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

    if (appErr) throw appErr

    if (!appointments || appointments.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No shipments to track' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userIds = [...new Set(appointments.map((a) => a.user_id))]

    const { data: integrations } = await supabase
      .from('user_integrations')
      .select('user_id, frenet_token')
      .in('user_id', userIds)
      .not('frenet_token', 'is', null)

    const frenetTokens = new Map()
    if (integrations) {
      integrations.forEach((i) => frenetTokens.set(i.user_id, i.frenet_token))
    }

    const updates = []

    for (const app of appointments) {
      const token = frenetTokens.get(app.user_id)
      if (!token) continue

      try {
        const response = await fetch(
          `https://api.frenet.com.br/tracking/trackinginfo?trackingNumber=${app.tracking_number}`,
          {
            headers: { token },
          },
        )

        if (response.ok) {
          const data = await response.json()
          let isDelivered = false
          let deliveredAt = new Date().toISOString()

          if (data && data.TrackingEvents && Array.isArray(data.TrackingEvents)) {
            for (const event of data.TrackingEvents) {
              const desc = (event.EventDescription || '').toLowerCase()
              if (desc.includes('entregue') || desc.includes('delivered')) {
                isDelivered = true
                if (event.EventDateTime) {
                  try {
                    deliveredAt = new Date(event.EventDateTime).toISOString()
                  } catch (err) {
                    // keep current date if parsing fails
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
                kit_status: 'Delivered',
                delivered_at: deliveredAt,
              })
              .eq('id', app.id)

            if (!updateErr) {
              updates.push(app.id)
            }
          }
        } else {
          console.warn(`Frenet API returned ${response.status} for tracking ${app.tracking_number}`)
        }
      } catch (e) {
        console.error(`Error tracking ${app.tracking_number}:`, e)
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
