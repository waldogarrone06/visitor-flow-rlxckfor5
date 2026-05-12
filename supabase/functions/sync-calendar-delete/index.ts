import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { appointmentId } = await req.json()

    if (!appointmentId) {
      throw new Error('ID do agendamento não fornecido.')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: appointment, error: appErr } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .single()

    if (appErr || !appointment) {
      throw new Error('Agendamento não encontrado.')
    }

    if (!appointment.google_event_id) {
      await supabase.from('appointments').update({ status: 'Cancelled' }).eq('id', appointmentId)

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Agendamento cancelado (sem evento no Google Calendar).',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', appointment.user_id)
      .single()

    let token = integration?.google_access_token
    const refreshToken = integration?.google_refresh_token

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
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || Deno.env.get('VITE_GOOGLE_CLIENT_ID') || ''
    const clientSecret =
      Deno.env.get('GOOGLE_CLIENT_SECRET') || Deno.env.get('VITE_GOOGLE_CLIENT_SECRET') || ''

    if (!token.includes('mock_access_token') && clientId && clientSecret) {
      const makeRequest = async (accessToken: string) => {
        const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${appointment.google_event_id}`
        return fetch(url, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })
      }

      let response = await makeRequest(token)

      // Renovação do token se receber 401
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

      // Ignora erro 410 Gone (já deletado) ou 404 (não encontrado)
      if (!response.ok && response.status !== 410 && response.status !== 404) {
        const errText = await response.text()
        console.error('Google API Error:', errText)
        throw new Error('Falha ao deletar evento no Google Calendar.')
      }
    }

    // Cancelar agendamento e limpar google_event_id no banco
    await supabase
      .from('appointments')
      .update({
        status: 'Cancelled',
        google_event_id: null,
      })
      .eq('id', appointmentId)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Erro na função sync-calendar-delete:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erro interno ao tentar excluir o agendamento.',
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
