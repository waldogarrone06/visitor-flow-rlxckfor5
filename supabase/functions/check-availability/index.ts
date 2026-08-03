import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getGoogleTokens } from '../_shared/integration-secrets.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId, date } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('sync_enabled')
      .eq('user_id', userId)
      .maybeSingle()

    if (!integration || !integration.sync_enabled) {
      return new Response(JSON.stringify({ busySlots: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const googleTokens = await getGoogleTokens(supabase, userId)
    let token = googleTokens.accessToken
    const refreshToken = googleTokens.refreshToken

    if (!token) {
      return new Response(JSON.stringify({ busySlots: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let busySlots: { start: string; end: string }[] = []

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || Deno.env.get('VITE_GOOGLE_CLIENT_ID') || ''
    const clientSecret =
      Deno.env.get('GOOGLE_CLIENT_SECRET') || Deno.env.get('VITE_GOOGLE_CLIENT_SECRET') || ''

    if (token.includes('mock') || !clientId || !clientSecret) {
      busySlots = [{ start: '14:00', end: '15:00' }]
    } else {
      const startOfDay = new Date(`${date}T00:00:00-03:00`).toISOString()
      const endOfDay = new Date(`${date}T23:59:59-03:00`).toISOString()

      const makeRequest = async (accessToken: string) => {
        return fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timeMin: startOfDay,
            timeMax: endOfDay,
            items: [{ id: 'primary' }],
          }),
        })
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
            .eq('user_id', userId)
          response = await makeRequest(token)
        }
      }

      if (response.ok) {
        const data = await response.json()
        const calendars = data.calendars || {}
        const primary = calendars.primary || { busy: [] }
        busySlots = primary.busy.map((b: any) => {
          const s = new Date(b.start)
          const e = new Date(b.end)
          return {
            start: s.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'America/Sao_Paulo',
            }),
            end: e.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'America/Sao_Paulo',
            }),
          }
        })
      }
    }

    let localSchedule = []
    if (date) {
      const dayOfWeek = new Date(`${date}T12:00:00-03:00`).getDay()
      const [schedRes, specRes] = await Promise.all([
        supabase
          .from('schedule_settings')
          .select('*')
          .eq('user_id', userId)
          .eq('day_of_week', dayOfWeek),
        supabase
          .from('date_specific_schedules')
          .select('*')
          .eq('user_id', userId)
          .eq('specific_date', date),
      ])
      localSchedule = specRes.data && specRes.data.length > 0 ? specRes.data : schedRes.data || []
    }

    return new Response(JSON.stringify({ busySlots, schedule: localSchedule }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
