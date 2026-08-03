import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getGoogleTokens } from '../_shared/integration-secrets.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { clientName = 'Waldo Garrone' } = await req.json()
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    )
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || Deno.env.get('VITE_GOOGLE_CLIENT_ID') || ''
    const clientSecret =
      Deno.env.get('GOOGLE_CLIENT_SECRET') || Deno.env.get('VITE_GOOGLE_CLIENT_SECRET') || ''

    const { data: appointments, error: fetchErr } = await supabase
      .from('appointments')
      .select('*')
      .ilike('client_name', clientName)

    if (fetchErr) throw fetchErr
    if (!appointments?.length) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Nenhum agendamento encontrado.',
          details: {
            appointmentsDeleted: 0,
            calendarEventsDeleted: 0,
            calendarSkipped: 0,
            contactsDeleted: 0,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const apptIds = appointments.map((a) => a.id)
    let calDeleted = 0
    let calSkipped = 0

    for (const appt of appointments) {
      if (!appt.google_event_id) {
        calSkipped++
        continue
      }

      const googleTokens = await getGoogleTokens(supabase, appt.user_id)
      let token = googleTokens.accessToken
      if (!token || token.includes('mock_access_token') || !clientId || !clientSecret) {
        calSkipped++
        continue
      }

      const delEvent = (t: string) =>
        fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${appt.google_event_id}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } },
        )

      let res = await delEvent(token)
      if (res.status === 401 && googleTokens.refreshToken) {
        const refresh = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: googleTokens.refreshToken,
            grant_type: 'refresh_token',
          }),
        })
        if (refresh.ok) {
          token = (await refresh.json()).access_token
          await supabase
            .from('integration_secrets')
            .update({ google_access_token: token, updated_at: new Date().toISOString() })
            .eq('user_id', appt.user_id)
          res = await delEvent(token)
        }
      }
      if (res.ok || res.status === 410 || res.status === 404) calDeleted++
      else calSkipped++
    }

    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email')
      .ilike('name', clientName)
    const contactIds = contacts?.map((c) => c.id) || []
    const emails = contacts?.map((c) => c.email).filter(Boolean) || []

    await supabase.from('nps_responses').delete().in('appointment_id', apptIds)
    if (contactIds.length) {
      await supabase.from('interaction_log').delete().in('contact_id', contactIds)
      await supabase.from('messages').delete().in('contact_id', contactIds)
      await supabase.from('contact_tag_relations').delete().in('contact_id', contactIds)
    }
    if (emails.length) {
      const { data: kits } = await supabase.from('kits').select('id').in('prescriber_email', emails)
      if (kits?.length)
        await supabase
          .from('kit_items')
          .delete()
          .in(
            'kit_id',
            kits.map((k) => k.id),
          )
      await supabase.from('kits').delete().in('prescriber_email', emails)
    }
    for (const appt of appointments) {
      await supabase
        .from('locked_slots')
        .delete()
        .eq('user_id', appt.user_id)
        .eq('lock_date', appt.appointment_date)
        .eq('start_time', appt.start_time)
        .eq('end_time', appt.end_time)
      await supabase
        .from('locked_slots')
        .delete()
        .eq('user_id', appt.user_id)
        .eq('lock_date', appt.appointment_date)
        .is('start_time', null)
        .is('end_time', null)
    }
    await supabase.from('appointments').delete().in('id', apptIds)
    if (contactIds.length) await supabase.from('contacts').delete().in('id', contactIds)

    return new Response(
      JSON.stringify({
        success: true,
        message: `${appointments.length} agendamento(s) removido(s).`,
        details: {
          appointmentsDeleted: appointments.length,
          calendarEventsDeleted: calDeleted,
          calendarSkipped: calSkipped,
          contactsDeleted: contactIds.length,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
