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

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Find delivered appointments
    const { data: appointments, error: appErr } = await supabase
      .from('appointments')
      .select('id, client_email, client_name, delivered_at, user_id')
      .eq('kit_status', 'Delivered')
      .not('delivered_at', 'is', null)
      .lte('delivered_at', twentyFourHoursAgo)

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
          // Here we would trigger an email or whatsapp message to the client
          // with a link to the NPS form: https://.../nps/{app.id}
          console.log(`Triggering NPS survey for appointment ${app.id} to ${app.client_email}`)
          sentCount++
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
