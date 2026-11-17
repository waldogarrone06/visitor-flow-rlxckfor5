// Validação do SERVIDOR para o slot solicitado no agendamento público.
// Espelha a lógica da get-availability (mesmas fontes de verdade):
//  - o horário existe na agenda configurada (específica do dia, senão recorrente);
//  - não está no passado (fuso de Brasília);
//  - não está bloqueado manualmente (locked_slots);
//  - não sobrepõe evento do Google Calendar (freeBusy, quando sincronizado).
// A capacidade por slot continua na RPC book_appointment (constante 10).

export interface SlotValidationInput {
  supabase: any
  userId: string
  date: string // YYYY-MM-DD
  startTime: string // HH:MM
  endTime: string // HH:MM
}

export interface SlotValidationResult {
  ok: boolean
  error?: string
}

export function isValidTimeFormat(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function isValidDateFormat(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

// Data/hora atual em BRT — via formatToParts com hourCycle h23, porque
// toLocaleString('en-CA') pode devolver 12h e quebrar comparação de horários.
export function brtNowParts(): { todayBrt: string; nowBrtMinutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    hour12: false,
  }).formatToParts(new Date())
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value || ''
  const todayBrt = `${get('year')}-${get('month')}-${get('day')}`
  const nowBrtMinutes = Number(get('hour')) * 60 + Number(get('minute'))
  return { todayBrt, nowBrtMinutes }
}

export async function validatePublicSlot(
  input: SlotValidationInput,
): Promise<SlotValidationResult> {
  const { supabase, userId, date, startTime, endTime } = input

  if (!isValidDateFormat(date)) return { ok: false, error: 'Data inválida.' }
  if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
    return { ok: false, error: 'Horário inválido.' }
  }
  if (toMinutes(endTime) < toMinutes(startTime)) {
    return { ok: false, error: 'Horário inválido: fim antes do início.' }
  }

  // --- 1) Não pode estar no passado (fuso de Brasília) ----------------------
  const { todayBrt, nowBrtMinutes } = brtNowParts()
  if (date < todayBrt) {
    return { ok: false, error: 'Não é possível agendar em uma data que já passou.' }
  }
  if (date === todayBrt && toMinutes(startTime) <= nowBrtMinutes) {
    return { ok: false, error: 'Este horário já passou. Escolha outro, por favor.' }
  }

  // --- 2) O slot existe na agenda configurada -------------------------------
  const dayOfWeek = new Date(`${date}T12:00:00-03:00`).getDay()
  const [schedRes, specRes, lockedRes, intRes] = await Promise.all([
    supabase
      .from('schedule_settings')
      .select('start_time, end_time')
      .eq('user_id', userId)
      .eq('day_of_week', dayOfWeek),
    supabase
      .from('date_specific_schedules')
      .select('start_time, end_time')
      .eq('user_id', userId)
      .eq('specific_date', date),
    supabase
      .from('locked_slots')
      .select('start_time, end_time')
      .eq('user_id', userId)
      .eq('lock_date', date),
    supabase.from('user_integrations').select('sync_enabled').eq('user_id', userId).maybeSingle(),
  ])

  if (schedRes.error || specRes.error) {
    return { ok: false, error: 'Falha ao validar a agenda. Tente novamente.' }
  }

  const schedule: any[] =
    specRes.data && specRes.data.length > 0 ? specRes.data : schedRes.data || []

  const matchesSchedule = schedule.some((s) => {
    const sStart = String(s.start_time || '').slice(0, 5)
    const sEnd = String(s.end_time || '').slice(0, 5)
    // O slot solicitado precisa existir exatamente na agenda do dia.
    return sStart === startTime && sEnd === endTime
  })
  if (!matchesSchedule) {
    return { ok: false, error: 'Este horário não está disponível na agenda do profissional.' }
  }

  // --- 3) Não pode estar bloqueado manualmente ------------------------------
  const lockedSlots: any[] = lockedRes.data || []
  const isFullDayLocked = lockedSlots.some((l) => !l.start_time || l.start_time === '')
  if (isFullDayLocked) {
    return { ok: false, error: 'Este dia está bloqueado para agendamentos.' }
  }
  const overlapsLocked = lockedSlots.some((l) => {
    if (!l.start_time || l.start_time === '') return false
    const lStart = String(l.start_time).slice(0, 5)
    const lEnd = String(l.end_time || '').slice(0, 5)
    return startTime < lEnd && endTime > lStart
  })
  if (overlapsLocked) {
    return { ok: false, error: 'Este horário está bloqueado. Escolha outro, por favor.' }
  }

  // --- 4) Não pode estar ocupado no Google Calendar -------------------------
  if (intRes.data?.sync_enabled) {
    try {
      const { getGoogleTokens } = await import('../_shared/integration-secrets.ts')
      const googleTokens = await getGoogleTokens(supabase, userId)
      const clientId =
        Deno.env.get('GOOGLE_CLIENT_ID') || Deno.env.get('VITE_GOOGLE_CLIENT_ID') || ''
      const clientSecret =
        Deno.env.get('GOOGLE_CLIENT_SECRET') || Deno.env.get('VITE_GOOGLE_CLIENT_SECRET') || ''

      if (googleTokens.accessToken && clientId && clientSecret) {
        let token = googleTokens.accessToken
        const makeRequest = (accessToken: string) =>
          fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              timeMin: new Date(`${date}T00:00:00-03:00`).toISOString(),
              timeMax: new Date(`${date}T23:59:59-03:00`).toISOString(),
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
            response = await makeRequest(token)
          }
        }

        if (response.ok) {
          const data = await response.json()
          const primary = data.calendars?.primary || { busy: [] }
          const busySlots = (primary.busy || []).map((b: any) => ({
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
          // Mesma regra do front: evento sem hora legível bloqueia por segurança;
          // sobrepõe se slot começa antes do fim do busy e termina depois do início.
          const isBusy = busySlots.some((b: any) => {
            if (!b?.start || !b?.end) return true
            return startTime < b.end && endTime > b.start
          })
          if (isBusy) {
            return {
              ok: false,
              error: 'Este horário acabou de ficar ocupado. Escolha outro, por favor.',
            }
          }
        }
        // freeBusy indisponível: não bloqueia o fluxo legítimo (a validação
        // principal — agenda, passado, bloqueios — já passou).
      }
    } catch (e: any) {
      console.error('[slot-validation] freeBusy falhou (seguindo):', e?.message || e)
    }
  }

  return { ok: true }
}
