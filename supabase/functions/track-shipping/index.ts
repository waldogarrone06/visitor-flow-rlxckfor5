import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const normalizeTracking = (code: string) => code.replace(/^[A-Z]+-/i, '').trim()

const MELHOR_ENVIO_DELIVERED_STATUSES = new Set(['delivered'])

const isOrderDelivered = (order: any): boolean => {
  if (order.delivered_at) return true
  if (MELHOR_ENVIO_DELIVERED_STATUSES.has(String(order.status || '').toLowerCase())) return true
  return false
}

const fetchJson = async (url: string, token: string): Promise<any | null> => {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': 'Fourlab Integration',
    },
  })
  const text = await res.text()
  if (text.trimStart().startsWith('<')) return null
  try {
    return JSON.parse(text)
  } catch (_) {
    return null
  }
}

const findOrderByTracking = async (
  normalizedCode: string,
  originalTracking: string,
  token: string,
  debugLog: any[],
  isDebug: boolean,
): Promise<any | null> => {
  const maxPages = 15

  for (let page = 1; page <= maxPages; page++) {
    const data = await fetchJson(
      `https://www.melhorenvio.com.br/api/v2/me/purchases?per_page=50&page=${page}`,
      token,
    )

    if (!data) {
      if (isDebug) debugLog.push({ step: 'fetch_failed', page })
      break
    }

    if (isDebug && page === 1) {
      debugLog.push({ step: 'pagination_info', total: data.total, last_page: data.last_page })
    }

    const purchases: any[] = data.data || []
    if (purchases.length === 0) break

    for (const purchase of purchases) {
      for (const order of purchase.orders || []) {
        const selfTracking = String(order.self_tracking || '').toLowerCase()
        const fullTracking = String(order.tracking || '').toLowerCase()

        if (
          selfTracking === normalizedCode.toLowerCase() ||
          fullTracking === originalTracking.toLowerCase()
        ) {
          if (isDebug)
            debugLog.push({
              step: 'order_found',
              page,
              order_id: order.id,
              tracking: order.tracking,
              self_tracking: order.self_tracking,
              status: order.status,
              delivered_at: order.delivered_at,
              posted_at: order.posted_at,
            })
          return order
        }
      }
    }

    if (page >= (data.last_page || 1)) break
    await new Promise((r) => setTimeout(r, 200))
  }

  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let appointmentIdToRefresh: string | null = null
    const isDebug = new URL(req.url).searchParams.get('debug') === 'true'

    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (body?.appointmentId) appointmentIdToRefresh = body.appointmentId
      } catch (_) {}
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    let query = supabase
      .from('appointments')
      .select('id, user_id, tracking_number, kit_status')
      .not('tracking_number', 'is', null)
      .neq('kit_status', 'Entregue')
      .neq('kit_status', 'Delivered')
      .neq('status', 'Lead')

    if (appointmentIdToRefresh) query = query.eq('id', appointmentIdToRefresh)

    const { data: appointments, error: appErr } = await query
    if (appErr) throw appErr

    if (!appointments || appointments.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No shipments to track' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userIds = [...new Set(appointments.map((a) => a.user_id))]
    const { data: secrets } = await supabase
      .from('integration_secrets')
      .select('user_id, melhor_envio_token')
      .in('user_id', userIds)

    const tokens = new Map<string, string>()
    if (secrets) {
      secrets.forEach((s) => {
        if (s.melhor_envio_token) tokens.set(String(s.user_id), s.melhor_envio_token)
      })
    }

    const updates: string[] = []
    const skipped: string[] = []
    const debugLog: any[] = []

    for (const app of appointments) {
      const token = tokens.get(String(app.user_id))

      if (!token) {
        console.warn(`[track-shipping] No token for user ${app.user_id}`)
        skipped.push(app.id)
        continue
      }

      const normalizedCode = normalizeTracking(app.tracking_number)

      try {
        const order = await findOrderByTracking(
          normalizedCode,
          app.tracking_number,
          token,
          debugLog,
          isDebug,
        )

        if (!order) {
          console.warn(`[track-shipping] Order not found: ${normalizedCode}`)
          if (isDebug) debugLog.push({ step: 'not_found', tracking: normalizedCode })
          skipped.push(app.id)
          continue
        }

        if (!isOrderDelivered(order)) {
          console.log(
            `[track-shipping] Not delivered yet: ${normalizedCode} (status: ${order.status})`,
          )
          continue
        }

        let deliveredAt = new Date().toISOString()
        if (order.delivered_at) {
          try {
            deliveredAt = new Date(order.delivered_at).toISOString()
          } catch (_) {}
        }

        const { error: updateErr } = await supabase
          .from('appointments')
          .update({ kit_status: 'Entregue', delivered_at: deliveredAt })
          .eq('id', app.id)

        if (updateErr) {
          console.error(`[track-shipping] Failed to update ${app.id}:`, updateErr.message)
        } else {
          updates.push(app.id)
          console.log(
            `[track-shipping] Marked delivered: ${app.id} (${normalizedCode}) at ${deliveredAt}`,
          )
        }
      } catch (e: any) {
        console.error(`[track-shipping] Exception for ${normalizedCode}:`, e.message)
        if (isDebug)
          debugLog.push({ step: 'exception', tracking: normalizedCode, error: e.message })
        skipped.push(app.id)
      }

      await new Promise((r) => setTimeout(r, 300))
    }

    return new Response(
      JSON.stringify({
        success: true,
        updatedCount: updates.length,
        updatedIds: updates,
        skippedCount: skipped.length,
        skippedIds: skipped,
        ...(isDebug && { debug: debugLog }),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
