import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getGoogleTokens } from '../_shared/integration-secrets.ts'
import { checkRateLimit, getClientIp, bucketFor } from '../_shared/rate-limit.ts'

// get-availability — disponibilidade de horários para o agendamento público.
// Retorna: agenda do dia (recurring ou específica), horários ocupados (Google
// Calendar via freeBusy) e contagem de agendamentos ativos por slot.
// IMPORTANTE: horários que JÁ PASSARAM no dia atual são removidos usando o
// fuso de Brasília (America/Sao_Paulo) — não UTC.
// Rate limit por IP (leitura pública): 60/min e 300/hora por IP — folgado o
// bastante para não atrapalhar a navegação normal do formulário público.
const READ_LIMIT_PER_MIN = 60
const READ_LIMIT_PER_HOUR = 300
const MINUTE_WINDOW = 60
const HOUR_WINDOW = 3600

function rateLimitedResponse(resetSeconds: number): Response {
  return new Response(
    JSON.stringify({
      error: 'Muitas consultas em pouco tempo. Aguarde alguns instantes e tente novamente.',
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(resetSeconds),
      },
    },
  )
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId, date } = await req.json().catch(() => ({}))
    if (!userId || !date) throw new Error('userId e date são obrigatórios.')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    )

    // --- Rate limit por IP (antes de qualquer consulta pesada) ---------------
    const clientIp = getClientIp(req)
    const perMinute = await checkRateLimit(
      supabase,
      bucketFor('availability', clientIp),
      READ_LIMIT_PER_MIN,
      MINUTE_WINDOW,
    )
    if (!perMinute.ok) return rateLimitedResponse(perMinute.resetSeconds)
    const perHour = await checkRateLimit(
      supabase,
      bucketFor('availability-hour', clientIp),
      READ_LIMIT_PER_HOUR,
      HOUR_WINDOW,
    )
    if (!perHour.ok) return rateLimitedResponse(perHour.resetSeconds)

    // Data/hora atual em BRT — via formatToParts com hourCycle h23, porque
    // toLocaleString('en-CA') pode devolver 12h ("2:59:00 p.m.") e quebrar a
    // comparação de horários passados.
    const nowInBrt = (type: Intl.DateTimeFormatPartTypes) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        hour12: false,
      })
        .formatToParts(new Date())
        .find((p) => p.type === type)?.value || ''

    const todayBrt = `${nowInBrt('year')}-${nowInBrt('month')}-${nowInBrt('day')}` // YYYY-MM-DD
    const nowBrtHour = Number(nowInBrt('hour'))
    const nowBrtMinute = Number(nowInBrt('minute'))
    const nowBrtMinutes = nowBrtHour * 60 + nowBrtMinute // minutos desde a meia-noite (BRT)

    // --- Agenda (específica do dia, senão recorrente) -------------------------
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
    const schedule = specRes.data && specRes.data.length > 0 ? specRes.data : schedRes.data || []

    // --- Slots bloqueados manualmente ----------------------------------------
    const { data: lockedSlots } = await supabase
      .from('locked_slots')
      .select('*')
      .eq('user_id', userId)
      .eq('lock_date', date)

    // --- Ocupação: agendamentos ativos por horário ----------------------------
    const { data: appointments } = await supabase
      .from('appointments')
      .select('id, start_time, end_time, status')
      .eq('user_id', userId)
      .eq('appointment_date', date)
      .or('status.is.null,status.ilike.lead,status.ilike.scheduled')

    const slotCounts: Record<string, number> = {}
    for (const a of appointments || []) {
      const key = String(a.start_time)
      slotCounts[key] = (slotCounts[key] || 0) + 1
    }

    // --- Google Calendar freeBusy (se configurado) ----------------------------
    let busySlots: { start: string; end: string }[] = []
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('sync_enabled')
      .eq('user_id', userId)
      .maybeSingle()

    if (integration?.sync_enabled) {
      const googleTokens = await getGoogleTokens(supabase, userId)
      const clientId =
        Deno.env.get('GOOGLE_CLIENT_ID') || Deno.env.get('VITE_GOOGLE_CLIENT_ID') || ''
      const clientSecret =
        Deno.env.get('GOOGLE_CLIENT_SECRET') || Deno.env.get('VITE_GOOGLE_CLIENT_SECRET') || ''

      if (googleTokens.accessToken && clientId && clientSecret) {
        let token = googleTokens.accessToken
        const startOfDay = new Date(`${date}T00:00:00-03:00`).toISOString()
        const endOfDay = new Date(`${date}T23:59:59-03:00`).toISOString()

        const makeRequest = (accessToken: string) =>
          fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              timeMin: startOfDay,
              timeMax: endOfDay,
              items: [{ id: 'primary' }],
            }),
          })

        let response = await makeRequest(token)
        if (response.status === 401 && googleTokens.refreshToken) {
          const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: googleTokens.refreshToken,
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
          const primary = data.calendars?.primary || { busy: [] }
          busySlots = (primary.busy || []).map((b: any) => ({
            start: new Date(b.start).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'America/Sao_Paulo',
            }),
            end: new Date(b.end).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'America/Sao_Paulo',
            }),
          }))
        }
      }
    }

    // --- Filtra horários que já passaram HOJE (BRT) ---------------------------
    const slotToMinutes = (hhmm: string): number => {
      const [h, m] = String(hhmm).split(':')
      return Number(h) * 60 + Number(m || 0)
    }
    const filteredSchedule = schedule.filter((s: any) => {
      if (date === todayBrt && s.start_time) {
        return slotToMinutes(s.start_time) > nowBrtMinutes
      }
      return true
    })

    return new Response(
      JSON.stringify({
        today: todayBrt,
        nowBrt: nowBrtMinutes,
        schedule: filteredSchedule,
        lockedSlots: lockedSlots || [],
        slotCounts,
        busySlots,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Erro inesperado.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
