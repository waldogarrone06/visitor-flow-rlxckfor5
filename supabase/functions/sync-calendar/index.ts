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
    const { appointmentId } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: appointment, error: appErr } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .single()

    if (appErr || !appointment) {
      throw new Error('Appointment not found')
    }

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', appointment.user_id)
      .single()

    let token = integration?.google_access_token
    const refreshToken = integration?.google_refresh_token

    if (!token) {
      return new Response(
        JSON.stringify({ success: true, message: 'No Google integration found, skipping.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || Deno.env.get('VITE_GOOGLE_CLIENT_ID') || ''
    const clientSecret =
      Deno.env.get('GOOGLE_CLIENT_SECRET') || Deno.env.get('VITE_GOOGLE_CLIENT_SECRET') || ''

    // Check conflicts considering overrides priority logic
    const appDate = new Date(`${appointment.appointment_date}T12:00:00-03:00`)
    const dayOfWeek = appDate.getDay()
    const { data: specific } = await supabase
      .from('date_specific_schedules')
      .select('*')
      .eq('user_id', appointment.user_id)
      .eq('specific_date', appointment.appointment_date)

    let isValidSlot = false
    if (specific && specific.length > 0) {
      isValidSlot = specific.some((s) => s.start_time === appointment.start_time)
    } else {
      const { data: recurring } = await supabase
        .from('schedule_settings')
        .select('*')
        .eq('user_id', appointment.user_id)
        .eq('day_of_week', dayOfWeek)
      isValidSlot = recurring && recurring.some((s) => s.start_time === appointment.start_time)
    }

    if (!isValidSlot) {
      console.warn(
        `Warning: Time slot ${appointment.start_time} may conflict or was overridden locally.`,
      )
    }

    let eventId = `mock-event-${Date.now()}`
    let meetLink = `https://meet.google.com/mock-abc-xyz`

    // Only call real API if it's not a mocked token
    if (!token.includes('mock_access_token') && clientId && clientSecret) {
      const makeRequest = async (accessToken: string) => {
        const isUpdate = !!appointment.google_event_id
        const url = isUpdate
          ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${appointment.google_event_id}`
          : 'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1'

        const method = isUpdate ? 'PATCH' : 'POST'

        const payload: any = {
          summary: `Reunião: ${appointment.client_name}`,
          description:
            integration.google_invitation_body ||
            'Agendamento confirmado. Acesse o link do Meet no horário marcado.',
          start: {
            dateTime: `${appointment.appointment_date}T${appointment.start_time}:00-03:00`,
            timeZone: 'America/Sao_Paulo',
          },
          end: {
            dateTime: `${appointment.appointment_date}T${appointment.end_time}:00-03:00`,
            timeZone: 'America/Sao_Paulo',
          },
        }

        if (!isUpdate) {
          payload.conferenceData = {
            createRequest: {
              requestId: appointment.id,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          }
        }

        return fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })
      }

      let response = await makeRequest(token)

      // Refresh logic
      if (response.status === 401 && refreshToken) {
        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
          }),
        })

        if (refreshRes.ok) {
          const refreshData = await refreshRes.json()
          token = refreshData.access_token

          await supabase
            .from('user_integrations')
            .update({
              google_access_token: token,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', appointment.user_id)

          response = await makeRequest(token)
        }
      }

      if (response.ok) {
        const data = await response.json()
        eventId = data.id || eventId
        meetLink = data.hangoutLink || meetLink
      } else {
        console.error('Google API Error:', await response.text())
      }
    }

    // Save generated links to database
    await supabase
      .from('appointments')
      .update({
        google_event_id: eventId,
        google_meet_link: meetLink,
      })
      .eq('id', appointmentId)

    return new Response(JSON.stringify({ success: true, eventId, meetLink }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
