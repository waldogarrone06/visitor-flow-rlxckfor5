import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get appointments with tracking but not delivered
    const { data: appointments, error: appErr } = await supabase
      .from('appointments')
      .select('id, user_id, tracking_number, kit_status')
      .not('tracking_number', 'is', null)
      .neq('kit_status', 'Delivered')
      .neq('kit_status', 'Entregue')

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
      .not('melhor_envio_token', 'is', null)

    const tokens = new Map()
    if (integrations) {
      integrations.forEach((i) => tokens.set(i.user_id, i.melhor_envio_token))
    }

    const updates = []

    // Group appointments by user token to optimize batch requests
    const appointmentsByUser = appointments.reduce((acc: any, app) => {
      if (!acc[app.user_id]) acc[app.user_id] = []
      acc[app.user_id].push(app)
      return acc
    }, {})

    for (const [userId, userApps] of Object.entries(appointmentsByUser)) {
      const token = tokens.get(userId)
      if (!token) continue

      const trackingNumbers = (userApps as any[]).map((a) => a.tracking_number)

      try {
        const response = await fetch('https://www.melhorenvio.com.br/api/v2/me/shipment/tracking', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Fourlab Integration',
          },
          body: JSON.stringify({ orders: trackingNumbers }),
        })

        if (response.ok) {
          const data = await response.json()

          for (const app of userApps as any[]) {
            const trackInfo = data[app.tracking_number]
            if (trackInfo) {
              let isDelivered = false
              let deliveredAt = new Date().toISOString()

              const statusStr = String(trackInfo.status || '').toLowerCase()

              if (statusStr === 'delivered' || statusStr === 'entregue') {
                isDelivered = true
              } else if (trackInfo.tracking && Array.isArray(trackInfo.tracking)) {
                for (const event of trackInfo.tracking) {
                  const evtStatus = String(
                    event.status || event.status_description || '',
                  ).toLowerCase()
                  if (evtStatus.includes('delivered') || evtStatus.includes('entregue')) {
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
            }
          }
        } else {
          console.warn(`Melhor Envio API returned ${response.status} for user ${userId}`)
        }
      } catch (e) {
        console.error(`Error tracking for user ${userId}:`, e)
      }
    }

    return new Response(
      JSON.stringify({ success: true, updatedCount: updates.length, updatedIds: updates }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
