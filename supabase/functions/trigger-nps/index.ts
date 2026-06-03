import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    // Find delivered appointments within the 24 to 48 hours window
    const { data: appointments, error: appErr } = await supabase
      .from('appointments')
      .select('id, client_email, client_name, delivered_at, user_id, client_phone')
      .in('kit_status', ['Delivered', 'Entregue'])
      .not('delivered_at', 'is', null)
      .lte('delivered_at', twentyFourHoursAgo)
      .gte('delivered_at', fortyEightHoursAgo)

    if (appErr) throw appErr

    let sentCount = 0

    if (appointments && appointments.length > 0) {
      for (const app of appointments) {
        // Check if NPS is already responded
        const { data: npsResponses } = await supabase
          .from('nps_responses')
          .select('id')
          .eq('appointment_id', app.id)

        if (!npsResponses || npsResponses.length === 0) {
          // Verify if we already sent a notification (we can check interaction_log)
          const { data: logs } = await supabase
            .from('interaction_log')
            .select('id')
            .eq('user_id', app.user_id)
            .eq('type', 'nps_triggered')
            .contains('details', { appointment_id: app.id })

          if (!logs || logs.length === 0) {
            console.log(`Triggering NPS survey for appointment ${app.id} to ${app.client_email}`)

            const publicUrl = Deno.env.get('FRONTEND_URL') || 'https://4labnutricom.goskip.app'
            const npsUrl = `${publicUrl}/nps/${app.id}`
            const message = `Olá, ${app.client_name}! Esperamos que tenha recebido seu kit com sucesso. Poderia nos avaliar rapidamente? ${npsUrl}`

            // Try to send via whatsapp if phone is available
            if (app.client_phone) {
              try {
                await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseKey}`,
                  },
                  body: JSON.stringify({
                    to: app.client_phone,
                    text: message,
                    userId: app.user_id,
                  }),
                })
              } catch (e) {
                console.error(`Failed to send WhatsApp NPS for ${app.id}`, e)
              }
            }

            if (app.client_email) {
              try {
                await fetch(`${supabaseUrl}/functions/v1/send-email`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseKey}`,
                  },
                  body: JSON.stringify({
                    to: app.client_email,
                    subject: 'Pesquisa de Satisfação - Fourlab',
                    html: `<p>Olá, ${app.client_name}!</p><p>Esperamos que tenha recebido seu kit com sucesso.</p><p>Poderia nos avaliar rapidamente clicando <a href="${npsUrl}">neste link</a>?</p>`,
                    senderName: 'Fourlab',
                  }),
                })
              } catch (e) {
                console.error(`Failed to send Email NPS for ${app.id}`, e)
              }
            }

            // Log that we sent it
            await supabase.from('interaction_log').insert({
              user_id: app.user_id,
              type: 'nps_triggered',
              details: { appointment_id: app.id, timestamp: new Date().toISOString() },
            })

            sentCount++
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, npsTriggeredCount: sentCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
