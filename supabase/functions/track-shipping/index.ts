import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

const normalizeTracking = (code: string) => code.replace(/^LGI-/i, '').trim()

const DELIVERED_KEYWORDS = [
  'entregue',
  'delivered',
  'finalizado',
  'recebido',
  'objeto entregue',
  'entregue ao destinatário',
  'entrega realizada',
]

const isDelivered = (val: any): boolean => {
  if (!val) return false
  const text = typeof val === 'string' ? val : JSON.stringify(val)
  return DELIVERED_KEYWORDS.some((kw) => text.toLowerCase().includes(kw))
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
      .neq('kit_status', 'Delivered')
      .neq('kit_status', 'Entregue')

    if (appointmentIdToRefresh) query = query.eq('id', appointmentIdToRefresh)

    const { data: appointments, error: appErr } = await query
    if (appErr) throw appErr

    if (!appointments || appointments.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No shipments to track' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userIds = [...new Set(appointments.map((a) => a.user_id))]
    const { data: integrations } = await supabase
      .from('user_integrations')
      .select('user_id, melhor_envio_token')
      .in('user_id', userIds)

    const tokens = new Map<string, string>()
    if (integrations)
      integrations.forEach((i) => tokens.set(String(i.user_id), i.melhor_envio_token))

    const updates: string[] = []
    const debugLog: any[] = []

    for (const app of appointments) {
      const token = tokens.get(String(app.user_id))
      if (!token) {
        console.warn(`[track-shipping] No token for user ${app.user_id}`)
        continue
      }

      const normalizedCode = normalizeTracking(app.tracking_number)

      try {
        // Passo 1: busca o pedido no Melhor Envio pelo código de rastreio com fallback de endpoints
        const endpoints = [
          `https://www.melhorenvio.com.br/api/v2/me/shipments?q=${normalizedCode}&per_page=5`,
          `https://www.melhorenvio.com.br/api/v2/me/orders?q=${normalizedCode}&per_page=5`,
          `https://www.melhorenvio.com.br/api/v2/me/purchases?q=${normalizedCode}&per_page=5`,
        ]

        let searchData: any = null
        let validResponseFound = false
        let lastErrorStatus = 0
        let lastErrorBody = ''

        for (const endpoint of endpoints) {
          try {
            const searchRes = await fetch(endpoint, {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'Fourlab Integration',
              },
            })

            const rawText = await searchRes.text()

            if (isDebug) {
              debugLog.push({
                step: 'search_attempt',
                endpoint: endpoint,
                status: searchRes.status,
                preview: rawText.substring(0, 300),
              })
            }

            if (rawText.trim().startsWith('<')) {
              console.warn(`[track-shipping] HTML response from ${endpoint} for ${normalizedCode}`)
              lastErrorStatus = searchRes.status
              lastErrorBody = rawText.substring(0, 500)
              continue
            }

            if (!searchRes.ok) {
              console.error(
                `[track-shipping] Search error ${searchRes.status} for ${normalizedCode} at ${endpoint}: ${rawText.substring(0, 200)}`,
              )
              lastErrorStatus = searchRes.status
              lastErrorBody = rawText.substring(0, 500)
              continue
            }

            searchData = JSON.parse(rawText)
            validResponseFound = true
            if (isDebug)
              debugLog.push({ step: 'search', code: normalizedCode, response: searchData })
            break // Found valid JSON
          } catch (err: any) {
            console.error(`[track-shipping] Fetch exception at ${endpoint}: ${err.message}`)
            lastErrorStatus = 500
            lastErrorBody = err.message
          }
        }

        if (!validResponseFound) {
          console.warn(`[track-shipping] All endpoints failed for ${normalizedCode}`)
          if (isDebug)
            debugLog.push({
              step: 'search_failed',
              code: normalizedCode,
              message: 'All endpoints returned HTML or invalid JSON',
            })

          if (lastErrorStatus && lastErrorStatus !== 404) {
            await supabase.from('interaction_log').insert({
              user_id: app.user_id,
              type: 'shipping_sync_error',
              details: {
                tracking_code: normalizedCode,
                status: lastErrorStatus,
                apiResponse: lastErrorBody,
              },
            })
          }
          continue
        }

        // Passo 2: encontra o pedido que bate com o tracking code
        const items =
          searchData?.data || searchData?.items || (Array.isArray(searchData) ? searchData : [])
        const shipment = items.find(
          (s: any) =>
            String(s.tracking || s.code || s.tracking_code || '').toLowerCase() ===
            normalizedCode.toLowerCase(),
        )

        if (!shipment) {
          console.warn(`[track-shipping] Shipment not found for tracking ${normalizedCode}`)
          if (isDebug)
            debugLog.push({
              step: 'match',
              code: normalizedCode,
              message: 'not found in results',
              results: items,
            })
          continue
        }

        if (isDebug) debugLog.push({ step: 'shipment', code: normalizedCode, shipment })

        // Passo 3: verifica se está entregue pelo status do pedido
        const shipmentDelivered =
          isDelivered(shipment.status) || isDelivered(shipment.delivery_status)
        let deliveredAt = new Date().toISOString()

        if (shipment.delivered_at) {
          try {
            deliveredAt = new Date(shipment.delivered_at).toISOString()
          } catch (_) {}
        }

        if (shipmentDelivered) {
          const { error: updateErr } = await supabase
            .from('appointments')
            .update({ kit_status: 'Entregue', delivered_at: deliveredAt })
            .eq('id', app.id)

          if (updateErr) {
            console.error(`[track-shipping] Update error for ${app.id}:`, updateErr.message)
          } else {
            updates.push(app.id)
            console.log(`[track-shipping] Marked delivered: ${app.id} (${normalizedCode})`)
          }
        } else {
          // Passo 4: se não está entregue pelo status, usa o UUID para buscar tracking detalhado
          const shipmentId = shipment.id
          if (shipmentId) {
            const trackRes = await fetch(
              'https://www.melhorenvio.com.br/api/v2/me/shipment/tracking',
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: 'application/json',
                  'Content-Type': 'application/json',
                  'User-Agent': 'application/json',
                },
                body: JSON.stringify({ orders: [shipmentId] }),
              },
            )

            if (trackRes.ok) {
              const trackData = await trackRes.json()
              if (isDebug) debugLog.push({ step: 'tracking', shipmentId, response: trackData })

              const trackInfo = trackData[shipmentId]
              if (trackInfo && isDelivered(JSON.stringify(trackInfo))) {
                const events = trackInfo.tracking || trackInfo.events || []
                const eventList = Array.isArray(events) ? events : Object.values(events)
                let finalDate = new Date().toISOString()

                for (const ev of eventList as any[]) {
                  if (isDelivered(JSON.stringify(ev))) {
                    const rawDate = ev.date || ev.created_at || ev.happened_at
                    try {
                      if (rawDate) finalDate = new Date(rawDate).toISOString()
                    } catch (_) {}
                    break
                  }
                }

                const { error: updateErr } = await supabase
                  .from('appointments')
                  .update({ kit_status: 'Entregue', delivered_at: finalDate })
                  .eq('id', app.id)

                if (!updateErr) {
                  updates.push(app.id)
                  console.log(`[track-shipping] Marked delivered via tracking detail: ${app.id}`)
                }
              }
            }
          }
        }
      } catch (e: any) {
        console.error(`[track-shipping] Exception for ${normalizedCode}:`, e.message)
        if (isDebug) debugLog.push({ step: 'exception', code: normalizedCode, error: e.message })
      }

      await new Promise((r) => setTimeout(r, 300))
    }

    return new Response(
      JSON.stringify({
        success: true,
        updatedCount: updates.length,
        updatedIds: updates,
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
