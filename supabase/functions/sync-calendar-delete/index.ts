import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getGoogleTokens } from '../_shared/integration-secrets.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { appointmentId } = await req.json()
    if (!appointmentId) throw new Error('ID do agendamento não fornecido.')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: appointment, error: appErr } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .single()

    if (appErr || !appointment) throw new Error('Agendamento não encontrado.')

    if (!appointment.google_event_id) {
      await supabase.from('appointments').update({ status: 'Cancelled' }).eq('id', appointmentId)
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Agendamento cancelado (sem evento no Google Calendar).',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const googleTokens = await getGoogleTokens(supabase, appointment.user_id)
    let token = googleTokens.accessToken
    const refreshToken = googleTokens.refreshToken

    if (!token) {
      await supabase
        .from('appointments')
        .update({ status: 'Cancelled', google_event_id: null })
        .eq('id', appointmentId)
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Sem integração com o Google Calendar. Agendamento cancelado.',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || Deno.env.get('VITE_GOOGLE_CLIENT_ID') || ''
    const clientSecret =
      Deno.env.get('GOOGLE_CLIENT_SECRET') || Deno.env.get('VITE_GOOGLE_CLIENT_SECRET') || ''

    if (!token.includes('mock_access_token') && clientId && clientSecret) {
      const makeRequest = async (accessToken: string) => {
        return fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${appointment.google_event_id}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        )
      }

      let response = await makeRequest(token)

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
            .from('integration_secrets')
            .update({ google_access_token: token, updated_at: new Date().toISOString() })
            .eq('user_id', appointment.user_id)
          response = await makeRequest(token)
        }
      }

      if (!response.ok && response.status !== 410 && response.status !== 404) {
        throw new Error('Falha ao deletar evento no Google Calendar.')
      }
    }

    await supabase
      .from('appointments')
      .update({ status: 'Cancelled', google_event_id: null })
      .eq('id', appointmentId)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Erro na função sync-calendar-delete:', error.message || error)
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Erro interno.' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
