import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

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
      .select('google_access_token, sync_enabled')
      .eq('user_id', userId)
      .single()

    if (!integration || !integration.sync_enabled || !integration.google_access_token) {
      return new Response(JSON.stringify({ busySlots: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = integration.google_access_token
    let busySlots: { start: string; end: string }[] = []

    // Simulate busy block at 14:00 if using mock token to demonstrate sync
    if (token.includes('mock')) {
      busySlots = [{ start: '14:00', end: '15:00' }]
    } else {
      // Real API Call
      const startOfDay = new Date(`${date}T00:00:00-03:00`).toISOString()
      const endOfDay = new Date(`${date}T23:59:59-03:00`).toISOString()

      const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeMin: startOfDay,
          timeMax: endOfDay,
          items: [{ id: 'primary' }],
        }),
      })

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

    return new Response(JSON.stringify({ busySlots }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
