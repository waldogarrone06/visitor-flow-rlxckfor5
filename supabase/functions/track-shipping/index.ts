import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let appointmentIdToRefresh = null
    let debugMode = false

    const url = new URL(req.url)
    if (url.searchParams.get('debug') === 'true') {
      debugMode = true
    }

    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (body && body.appointmentId) {
          appointmentIdToRefresh = body.appointmentId
        }
        if (body && body.debug === true) {
          debugMode = true
        }
      } catch (e) {
        // empty body
      }
    } else if (req.method === 'GET') {
      appointmentIdToRefresh = url.searchParams.get('appointmentId')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get appointments with tracking but not delivered
    let query = supabase
      .from('appointments')
      .select('id, user_id, tracking_number, kit_status')
      .not('tracking_number', 'is', null)
      .neq('kit_status', 'Delivered')
      .neq('kit_status', 'Entregue')

    if (appointmentIdToRefresh) {
      query = query.eq('id', appointmentIdToRefresh)
    }

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

    const tokens = new Map()
    if (integrations) {
      integrations.forEach((i) => tokens.set(i.user_id, i.melhor_envio_token))
    }

    const updates = []
    const debugPayloads: any[] = []

    // Group appointments by user token to optimize batch requests
    const appointmentsByUser = appointments.reduce((acc: any, app) => {
      if (!acc[app.user_id]) acc[app.user_id] = []
      acc[app.user_id].push(app)
      return acc
    }, {})

    const deliveryKeywords = [
      'entregue',
      'delivered',
      'finalizado',
      'recebido',
      'objeto entregue',
      'entregue ao destinatário',
      'entrega realizada',
    ]

    const isStatusDelivered = (status: string) => {
      const s = String(status || '').toLowerCase()
      return deliveryKeywords.some((kw) => s.includes(kw))
    }

    for (const [userId, userApps] of Object.entries(appointmentsByUser)) {
      const token = tokens.get(userId)
      const userAppsList = userApps as any[]

      if (!token) {
        await supabase.from('interaction_log').insert({
          user_id: userId,
          type: 'tracking_error',
          details: { error: 'Missing melhor_envio_token', count: userAppsList.length },
        })
        continue
      }

      // Process in batches of 50 to avoid rate limits / large payloads
      const chunkSize = 50
      for (let i = 0; i < userAppsList.length; i += chunkSize) {
        const chunk = userAppsList.slice(i, i + chunkSize)
        const trackingNumbers = chunk.map((a) => a.tracking_number)

        const fetchTracking = async () => {
          return fetch('https://www.melhorenvio.com.br/api/v2/me/shipment/tracking', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'User-Agent': 'Fourlab Integration',
            },
            body: JSON.stringify({ orders: trackingNumbers }),
          })
        }

        try {
          let response = await fetchTracking()

          if (response.status === 429) {
            console.warn(
              `Melhor Envio API rate limit (429) for user ${userId}. Retrying after delay...`,
            )
            await new Promise((resolve) => setTimeout(resolve, 3000))
            response = await fetchTracking()
          }

          if (response.ok) {
            const data = await response.json()
            if (debugMode) {
              debugPayloads.push({ userId, trackingNumbers, response: data })
            }

            for (const app of chunk) {
              const trackInfo = data[app.tracking_number]
              if (trackInfo) {
                let isDelivered = false
                let deliveredAt = new Date().toISOString()

                if (isStatusDelivered(trackInfo.status)) {
                  isDelivered = true
                }

                const events = trackInfo.tracking || trackInfo.events
                if (events && Array.isArray(events)) {
                  for (const event of events) {
                    const evtStatus = String(
                      event.status || event.status_description || '',
                    ).toLowerCase()
                    const evtDetail = String(event.description || event.detail || '').toLowerCase()

                    if (isStatusDelivered(evtStatus) || isStatusDelivered(evtDetail)) {
                      isDelivered = true
                      if (event.date || event.created_at) {
                        try {
                          deliveredAt = new Date(event.date || event.created_at).toISOString()
                        } catch (err) {
                          // keep fallback date
                        }
                      }
                      break
                    }
                  }
                }

                if (isDelivered) {
                  const { error: updateErr } = await supabase
                    .from('appointments')
                    .update({
                      kit_status: 'Entregue',
                      delivered_at: deliveredAt,
                    })
                    .eq('id', app.id)

                  if (!updateErr) {
                    updates.push(app.id)
                  }
                }
              } else {
                await supabase.from('interaction_log').insert({
                  user_id: userId,
                  type: 'tracking_error',
                  details: {
                    error: 'Invalid tracking number or not found in API response',
                    tracking_number: app.tracking_number,
                  },
                })
              }
            }
          } else {
            console.warn(`Melhor Envio API returned ${response.status} for user ${userId}`)
            await supabase.from('interaction_log').insert({
              user_id: userId,
              type: 'tracking_error',
              details: {
                error: `Melhor Envio API returned ${response.status}`,
                statusText: response.statusText,
                trackingNumbers,
              },
            })
          }
        } catch (e: any) {
          console.error(`Error tracking for user ${userId}:`, e)
          await supabase.from('interaction_log').insert({
            user_id: userId,
            type: 'tracking_error',
            details: { error: e.message, trackingNumbers },
          })
        }

        if (i + chunkSize < userAppsList.length) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }
    }

    const responsePayload: any = {
      success: true,
      updatedCount: updates.length,
      updatedIds: updates,
    }
    if (debugMode) {
      responsePayload.debugPayloads = debugPayloads
    }

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
