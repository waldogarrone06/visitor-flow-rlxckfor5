import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const normalizeTracking = (code: string) => code.replace(/^[A-Z]+-/i, '').trim()

const MELHOR_ENVIO_DELIVERED_STATUSES = new Set(['delivered', 'entregue'])

const isOrderDelivered = (order: any): boolean => {
  if (order.delivered_at) return true
  if (MELHOR_ENVIO_DELIVERED_STATUSES.has(String(order.status || '').toLowerCase())) return true
  return false
}

const fetchJson = async (
  url: string,
  token: string,
): Promise<{ data: any | null; httpStatus: number }> => {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': 'Fourlab Integration',
    },
  })
  const text = await res.text()
  if (text.trimStart().startsWith('<')) return { data: null, httpStatus: res.status }
  try {
    return { data: JSON.parse(text), httpStatus: res.status }
  } catch (_) {
    return { data: null, httpStatus: res.status }
  }
}

const findOrderByTracking = async (
  normalizedCode: string,
  originalTracking: string,
  token: string,
  debugLog: any[],
  isDebug: boolean,
): Promise<{ order: any | null; httpStatus: number; lastError?: string }> => {
  const maxPages = 15
  let httpStatus = 0
  let lastError: string | undefined

  for (let page = 1; page <= maxPages; page++) {
    const { data, httpStatus: status } = await fetchJson(
      `https://www.melhorenvio.com.br/api/v2/me/purchases?per_page=50&page=${page}`,
      token,
    )
    httpStatus = status

    if (!data) {
      lastError = `HTTP ${status} ou resposta inválida do Melhor Envio (página ${page})`
      if (isDebug) debugLog.push({ step: 'fetch_failed', page, httpStatus: status })
      break
    }

    if (data.error || data.message) {
      lastError = `Melhor Envio respondeu erro: ${typeof data.message === 'string' ? data.message : JSON.stringify(data.error || data.message).slice(0, 300)}`
      if (isDebug) debugLog.push({ step: 'api_error', page, body: data })
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
        const protocol = String(order.protocol || '').toLowerCase()

        if (
          selfTracking === normalizedCode.toLowerCase() ||
          fullTracking === originalTracking.toLowerCase() ||
          fullTracking === normalizedCode.toLowerCase() ||
          selfTracking === originalTracking.toLowerCase() ||
          protocol === normalizedCode.toLowerCase()
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
          return { order, httpStatus }
        }
      }
    }

    if (page >= (data.last_page || 1)) break
    await new Promise((r) => setTimeout(r, 200))
  }

  return { order: null, httpStatus, lastError }
}

const logTrackingError = async (
  supabase: any,
  appointmentId: string,
  userId: string | null,
  message: string,
): Promise<void> => {
  await supabase.from('interaction_log').insert({
    user_id: userId,
    type: 'tracking_error',
    details: {
      appointment_id: appointmentId,
      error: String(message).slice(0, 500),
      source: 'track-shipping',
    },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let appointmentIdToRefresh: string | null = null
    const urlObj = new URL(req.url)
    const isDebug = urlObj.searchParams.get('debug') === 'true'

    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (body?.appointmentId) appointmentIdToRefresh = body.appointmentId
      } catch (_) {}
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Itera TODOS os envios com rastreio que ainda não foram entregues,
    // independentemente do user_id (logística vê a operação inteira).
    // Importante: NÃO filtrar por status='scheduled' — a maioria dos envios
    // é de registros de lead e precisam ser rastreados igualmente.
    let query = supabase
      .from('appointments')
      .select('id, user_id, tracking_number, kit_status')
      .not('tracking_number', 'is', null)
      .neq('tracking_number', '')
      .not('kit_status', 'is', null)
      .neq('kit_status', 'Entregue')
      .neq('kit_status', 'Delivered')

    if (appointmentIdToRefresh) query = query.eq('id', appointmentIdToRefresh)

    const { data: appointments, error: appErr } = await query
    if (appErr) throw appErr

    if (!appointments || appointments.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No shipments to track', updatedCount: 0 }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const userIds = [...new Set(appointments.map((a) => a.user_id))]
    const { data: secrets } = await supabase
      .from('integration_secrets')
      .select('user_id, melhor_envio_token')
      .in('user_id', userIds)

    // Token do dono do envio; sem token próprio, cai para um token
    // compartilhado/reserva configurado por qualquer usuário.
    const tokens = new Map<string, string>()
    let fallbackToken: string | null = null

    if (secrets) {
      secrets.forEach((s) => {
        if (s.melhor_envio_token) {
          tokens.set(String(s.user_id), s.melhor_envio_token)
          if (!fallbackToken) fallbackToken = s.melhor_envio_token
        }
      })
    }

    if (!fallbackToken) {
      const { data: anySecret } = await supabase
        .from('integration_secrets')
        .select('melhor_envio_token')
        .not('melhor_envio_token', 'is', null)
        .limit(1)
        .maybeSingle()
      if (anySecret?.melhor_envio_token) fallbackToken = anySecret.melhor_envio_token
    }

    const updates: string[] = []
    const skipped: string[] = []
    const errors: Array<{ id: string; error: string }> = []
    const debugLog: any[] = []

    for (const app of appointments) {
      const token = tokens.get(String(app.user_id)) || fallbackToken

      if (!token) {
        console.warn(`[track-shipping] No token for user ${app.user_id}`)
        await logTrackingError(
          supabase,
          app.id,
          app.user_id,
          'Nenhum token do Melhor Envio configurado',
        )
        errors.push({ id: app.id, error: 'sem token do Melhor Envio' })
        skipped.push(app.id)
        continue
      }

      const normalizedCode = normalizeTracking(app.tracking_number)

      try {
        const { order, lastError } = await findOrderByTracking(
          normalizedCode,
          app.tracking_number,
          token,
          debugLog,
          isDebug,
        )

        if (!order) {
          const msg =
            lastError || `Pedido não encontrado no Melhor Envio para o rastreio ${normalizedCode}`
          console.warn(`[track-shipping] ${msg}`)
          await logTrackingError(supabase, app.id, app.user_id, msg)
          errors.push({ id: app.id, error: msg })
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
          await logTrackingError(
            supabase,
            app.id,
            app.user_id,
            `Falha ao atualizar status: ${updateErr.message}`,
          )
          errors.push({ id: app.id, error: updateErr.message })
          skipped.push(app.id)
        } else {
          updates.push(app.id)
          console.log(
            `[track-shipping] Marked delivered: ${app.id} (${normalizedCode}) at ${deliveredAt}`,
          )
        }
      } catch (e: any) {
        console.error(`[track-shipping] Exception for ${normalizedCode}:`, e.message)
        await logTrackingError(supabase, app.id, app.user_id, e.message)
        errors.push({ id: app.id, error: e.message })
        skipped.push(app.id)
      }

      await new Promise((r) => setTimeout(r, 300))
    }

    return new Response(
      JSON.stringify({
        success: true,
        checkedCount: appointments.length,
        updatedCount: updates.length,
        updatedIds: updates,
        skippedCount: skipped.length,
        skippedIds: skipped,
        errorCount: errors.length,
        errors,
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
