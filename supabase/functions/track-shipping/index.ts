import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

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
        // Passo 1 e 2: busca o pedido no Melhor Envio pelo código de rastreio paginando pela API de purchases
        let shipment: any = null
        let page = 1
        const maxPages = 10
        let validResponseFound = false
        let lastErrorStatus = 0
        let lastErrorBody = ''
        let totalPagesSearched = 0

        while (page <= maxPages) {
          const endpoint = `https://www.melhorenvio.com.br/api/v2/me/purchases?per_page=50&page=${page}`
          totalPagesSearched = page

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

            if (isDebug && page === 1) {
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
              break // Break on HTML
            }

            if (!searchRes.ok) {
              console.error(
                `[track-shipping] Search error ${searchRes.status} for ${normalizedCode} at ${endpoint}: ${rawText.substring(0, 200)}`,
              )
              lastErrorStatus = searchRes.status
              lastErrorBody = rawText.substring(0, 500)
              break // Break on Error
            }

            let searchData
            try {
              searchData = JSON.parse(rawText)
            } catch (err) {
              console.warn(`[track-shipping] JSON parse failed for ${endpoint}`)
              break // Break on invalid JSON
            }

            validResponseFound = true

            if (isDebug && page === 1) {
              debugLog.push({
                step: 'purchases_page1',
                total: searchData.total,
                last_page: searchData.last_page,
              })
            }

            const purchases =
              searchData?.data || searchData?.items || (Array.isArray(searchData) ? searchData : [])

            for (const purchase of purchases) {
              const ordersToSearch = Array.isArray(purchase.orders) ? purchase.orders : [purchase]

              for (const o of ordersToSearch) {
                const selfTracking = String(o.self_tracking || '').toLowerCase()
                const tracking = String(o.tracking || '').toLowerCase()
                const trackingNumberLower = String(app.tracking_number || '').toLowerCase()
                const normLower = normalizedCode.toLowerCase()

                if (
                  selfTracking === normLower ||
                  tracking === trackingNumberLower ||
                  tracking === `lgi-${normLower}`
                ) {
                  shipment = o
                  break
                }
              }
              if (shipment) break
            }

            if (shipment) {
              if (isDebug)
                debugLog.push({
                  step: 'shipment_found',
                  page: page,
                  code: normalizedCode,
                  id: shipment.id,
                  status: shipment.status,
                  delivered_at: shipment.delivered_at,
                  tracking: shipment.tracking,
                })
              break // Found shipment, break pagination
            }

            const lastPage = searchData.last_page || 1
            if (page >= lastPage) {
              break // Reached last page
            }

            page++
            await new Promise((r) => setTimeout(r, 200)) // Delay between pages
          } catch (err: any) {
            console.error(`[track-shipping] Fetch exception at ${endpoint}: ${err.message}`)
            lastErrorStatus = 500
            lastErrorBody = err.message
            break
          }
        }

        if (!validResponseFound && !shipment) {
          console.warn(`[track-shipping] Valid response not found for ${normalizedCode}`)
          if (isDebug)
            debugLog.push({
              step: 'search_failed',
              code: normalizedCode,
              message: 'All pages returned HTML or invalid JSON or errors',
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

        if (!shipment) {
          console.warn(`[track-shipping] Shipment not found for tracking ${normalizedCode}`)
          if (isDebug)
            debugLog.push({
              step: 'not_found',
              code: normalizedCode,
              pages_searched: totalPagesSearched,
            })
          continue
        }

        // Passo 3: verifica se está entregue pelo status do pedido
        const shipmentDelivered =
          !!shipment.delivered_at ||
          isDelivered(shipment.status) ||
          isDelivered(shipment.delivery_status)
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
