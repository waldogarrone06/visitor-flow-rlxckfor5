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

    if (appointment.status === 'Lead') {
      return new Response(JSON.stringify({ success: true, message: 'Ignored lead capture.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', appointment.user_id)
      .single()

    let token = integration?.google_access_token
    const refreshToken = integration?.google_refresh_token
    const fixedMeetLink = integration?.fixed_meet_link

    if (!token && !fixedMeetLink) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No Google integration or fixed link found, skipping.',
        }),
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

    let eventId = appointment.google_event_id || `mock-event-${Date.now()}`
    let meetLink =
      appointment.google_meet_link || fixedMeetLink || `https://meet.google.com/mock-abc-xyz`

    // Only call real API if it's not a mocked token
    if (token && !token.includes('mock_access_token') && clientId && clientSecret) {
      const makeRequest = async (accessToken: string) => {
        const isUpdate = !!appointment.google_event_id
        const url = isUpdate
          ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${appointment.google_event_id}?conferenceDataVersion=1`
          : 'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1'

        const method = isUpdate ? 'PATCH' : 'POST'

        const defaultDescription = `Agendamento confirmado.\n\nPaciente: ${appointment.client_name}\nEspecialidade: ${appointment.specialty || 'Não informada'}\nEndereço da Clínica: ${appointment.clinic_address || 'Não informado'}\n\nAcesse o link do Meet no horário marcado.`

        const payload: any = {
          summary: `Reunião: ${appointment.client_name}`,
          description: integration?.google_invitation_body || defaultDescription,
          start: {
            dateTime: `${appointment.appointment_date}T${appointment.start_time}:00-03:00`,
            timeZone: 'America/Sao_Paulo',
          },
          end: {
            dateTime: `${appointment.appointment_date}T${appointment.end_time}:00-03:00`,
            timeZone: 'America/Sao_Paulo',
          },
        }

        if (fixedMeetLink) {
          payload.location = fixedMeetLink
        }

        if (!isUpdate || !appointment.google_meet_link) {
          if (!fixedMeetLink) {
            payload.conferenceData = {
              createRequest: {
                requestId: `meet-${appointment.id}-${Date.now()}`,
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            }
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
        let data = await response.json()

        // Handle potential Google API delays for conferenceData
        if (!fixedMeetLink && (!isUpdate || !appointment.google_meet_link)) {
          let attempts = 0
          while (
            data.conferenceData?.createRequest?.status?.statusCode === 'pending' &&
            attempts < 3
          ) {
            await new Promise((resolve) => setTimeout(resolve, 1000))
            const getRes = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/primary/events/${data.id}`,
              {
                headers: { Authorization: `Bearer ${token}` },
              },
            )
            if (getRes.ok) {
              data = await getRes.json()
            }
            attempts++
          }
        }

        eventId = data.id || eventId
        // Keep existing dynamic link if any, else fixed, else newly generated
        meetLink =
          appointment.google_meet_link ||
          fixedMeetLink ||
          data.hangoutLink ||
          data.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri ||
          meetLink
      } else {
        const errorText = await response.text()
        console.error('Google API Error:', errorText)
        throw new Error(`Falha ao sincronizar com Google Calendar. Erro: ${errorText}`)
      }
    } else if (fixedMeetLink) {
      // No Google Calendar Token, but we have a fixed link
      meetLink = appointment.google_meet_link || fixedMeetLink
      eventId = appointment.google_event_id || null
    }

    // Save generated links to database
    await supabase
      .from('appointments')
      .update({
        google_event_id: eventId,
        google_meet_link: meetLink,
      })
      .eq('id', appointmentId)

    // Notify prescriber
    try {
      if (meetLink) {
        const { data: currentApp } = await supabase
          .from('appointments')
          .select('prescriber_notified, client_name, appointment_date, start_time')
          .eq('id', appointmentId)
          .single()

        if (currentApp && !currentApp.prescriber_notified) {
          // Get prescriber email using the RPC function
          const { data: targetEmail, error: rpcErr } = await supabase.rpc('get_prescriber_email', {
            p_user_id: appointment.user_id,
          })

          const { data: integ } = await supabase
            .from('user_integrations')
            .select('google_email, reminder_email_template')
            .eq('user_id', appointment.user_id)
            .single()
          const { data: profile } = await supabase
            .from('profiles')
            .select('email, name')
            .eq('id', appointment.user_id)
            .single()

          let finalEmail = targetEmail
          if (rpcErr || !finalEmail) {
            finalEmail = integ?.google_email || profile?.email
          }

          if (finalEmail) {
            const formattedDate = currentApp.appointment_date
              ? currentApp.appointment_date.split('-').reverse().join('/')
              : ''

            let msg = `Olá!

Um novo agendamento foi confirmado e o link da reunião foi gerado com sucesso.

Paciente: ${currentApp.client_name}
Data: ${formattedDate}
Horário: ${currentApp.start_time}

Link da Reunião: ${meetLink}

Acesse o link no horário marcado para iniciar a consulta.

Atenciosamente,
Sistema de Agendamento`

            if (integ?.reminder_email_template) {
              const replacements: Record<string, string> = {
                '\\{\\{nome_cliente\\}\\}': currentApp.client_name || '',
                '\\{\\{data\\}\\}': formattedDate,
                '\\{\\{hora\\}\\}': currentApp.start_time || '',
                '\\{\\{meet_link\\}\\}': meetLink,
                '\\{\\{professional_name\\}\\}': profile?.name || 'Equipe',
              }
              msg = integ.reminder_email_template
              for (const [k, v] of Object.entries(replacements)) {
                msg = msg.replace(new RegExp(k, 'g'), v)
              }
            }

            const sendEmailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                to: finalEmail,
                subject: 'Link da Reunião - ' + currentApp.client_name,
                html:
                  '<div style="font-family: sans-serif; padding: 20px; color: #333;"><p>' +
                  msg.replace(/\n/g, '<br/>') +
                  '</p></div>',
                senderName: 'Notificação do Sistema',
              }),
            })

            if (sendEmailRes.ok) {
              await supabase
                .from('appointments')
                .update({ prescriber_notified: true })
                .eq('id', appointmentId)
            } else {
              console.error('Failed to send email API response:', await sendEmailRes.text())
            }
          }
        }
      } else {
        console.error('Meet link is empty, skipping prescriber notification.')
      }
    } catch (e) {
      console.error('Failed to send prescriber notification:', e)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Link da reunião gerado com sucesso',
        eventId,
        meetLink,
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
