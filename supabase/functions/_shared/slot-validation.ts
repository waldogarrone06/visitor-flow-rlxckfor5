// Validação de slot do Google Calendar (freeBusy) usada por get-availability e
// create-booking.
//
// Comportamento SEGURO mantido (fail-closed): se sync_enabled do profissional
// está ligado e o token do Google está ausente/expirado ou o Google falha, o
// slot é RECUSADO — nunca liberado. Em toda recusa de autenticação é gravado
// um ALERTA INTERNO (interaction_log, tipo google_token_alert) para o
// profissional ser avisado dentro do próprio app — sem e-mail/WhatsApp.
//
// Token do Google vive em public.integration_secrets (google_access_token /
// google_refresh_token / google_token_expires_at) — NÃO em
// user_integrations.google_calendar (essa coluna não existe).

import { logGoogleTokenAlert } from './google-alert.ts'

export interface GoogleSlotValidationResult {
  ok: boolean
  code?: 'no_token' | 'expired_token' | 'google_error'
  error?: string
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

async function loadSecrets(
  supabase: any,
  userId: string,
): Promise<{
  accessToken: string | null
  refreshToken: string | null
  expiresAt: string | null
} | null> {
  const { data, error } = await supabase
    .from('integration_secrets')
    .select('google_access_token, google_refresh_token, google_token_expires_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('[slot-validation] loadSecrets falhou:', error.message)
    return null
  }
  if (!data) return null
  return {
    accessToken: (data.google_access_token as string) || null,
    refreshToken: (data.google_refresh_token as string) || null,
    expiresAt: (data.google_token_expires_at as string) || null,
  }
}

async function persistRenewedToken(
  supabase: any,
  userId: string,
  accessToken: string,
  expiresAtIso: string,
): Promise<void> {
  const { error } = await supabase
    .from('integration_secrets')
    .update({
      google_access_token: accessToken,
      google_token_expires_at: expiresAtIso,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
  if (error) console.error('[slot-validation] persistRenewedToken falhou:', error.message)
}

async function refreshAccessToken(
  supabase: any,
  userId: string,
  refreshToken: string | null,
): Promise<{ ok: true; accessToken: string; expiresAt: string } | { ok: false }> {
  if (!refreshToken) return { ok: false }
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || ''
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') || ''
  if (!clientId || !clientSecret) return { ok: false }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    console.error(`[slot-validation] refresh do token falhou para ${userId}: HTTP ${res.status}`)
    return { ok: false }
  }

  const data = await res.json().catch(() => null)
  if (!data?.access_token) return { ok: false }

  const expiresAt = new Date(Date.now() + (Number(data.expires_in) || 3600) * 1000).toISOString()
  // PERSISTÊNCIA do token renovado — a próxima chamada não refaz o refresh.
  await persistRenewedToken(supabase, userId, data.access_token, expiresAt)
  return { ok: true, accessToken: data.access_token as string, expiresAt }
}

async function fetchFreeBusy(
  accessToken: string,
  timeMin: string,
  timeMax: string,
): Promise<boolean> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: [{ id: 'primary' }],
    }),
  })
  return res.ok
}

/**
 * Validação FAIL-CLOSED completa do dia/slot: usada pelo create-booking antes
 * de gravar o agendamento.
 * - sync_enabled desligado: ok (não há integração ativa).
 * - sync_enabled ligado e token ausente/expirado/Google fora: RECUSA o slot e
 *   grava o alerta interno google_token_alert (dedupe de 1h).
 */
export async function validateGoogleSlot(
  supabase: any,
  userId: string,
  startIso: string,
  endIso: string,
): Promise<GoogleSlotValidationResult> {
  // 1. sync_enabled está ligado?
  const { data: integration, error: integrationError } = await supabase
    .from('user_integrations')
    .select('sync_enabled')
    .eq('user_id', userId)
    .maybeSingle()

  if (integrationError) {
    return {
      ok: false,
      code: 'google_error',
      error: 'Falha ao carregar a integração do profissional.',
    }
  }

  if (!integration?.sync_enabled) {
    return { ok: true }
  }

  // 2. Token atual em integration_secrets.
  const secrets = await loadSecrets(supabase, userId)
  if (!secrets || !secrets.refreshToken) {
    await logGoogleTokenAlert(supabase, userId, 'no_token')
    return {
      ok: false,
      code: 'no_token',
      error: 'Agenda não sincronizada. Conecte o Google Calendar nas configurações.',
    }
  }

  // 3. Token expirado (ou prestes a, margem de 60s)? Renova e persiste.
  let accessToken = secrets.accessToken || ''
  const expiryMs = secrets.expiresAt ? Date.parse(secrets.expiresAt) : 0
  const isExpired = !accessToken || !expiryMs || expiryMs <= Date.now() + 60_000

  if (isExpired) {
    const renewed = await refreshAccessToken(supabase, userId, secrets.refreshToken)
    if (!renewed.ok) {
      await logGoogleTokenAlert(supabase, userId, 'expired_token')
      return {
        ok: false,
        code: 'expired_token',
        error: 'Não foi possível renovar o token do Google Calendar. Reconecte a conta.',
      }
    }
    accessToken = renewed.accessToken
  }

  // 4. freeBusy do Google — fail-closed.
  const freeBusyOk = await fetchFreeBusy(accessToken, startIso, endIso)
  if (!freeBusyOk) {
    await logGoogleTokenAlert(supabase, userId, 'google_error')
    return {
      ok: false,
      code: 'google_error',
      error: 'Google Calendar temporariamente indisponível. Tente novamente em instantes.',
    }
  }

  return { ok: true }
}

// ------------------------- helpers de formato -----------------------------

export function isValidDateFormat(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
}

export function isValidTimeFormat(value: unknown): boolean {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value.trim())
}

function slotToMinutes(hhmm: string): number {
  const [h, m] = String(hhmm).split(':')
  return Number(h) * 60 + Number(m || 0)
}

// "Hoje" em BRT (America/Sao_Paulo) e o minuto atual — com hourCycle h23,
// porque toLocaleString pode devolver 12h e quebrar a comparação.
function nowInBrt(): { date: string; minutes: number } {
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
  const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
  const date = `${get('year')}-${get('month')}-${get('day')}`
  const minutes = Number(get('hour')) * 60 + Number(get('minute'))
  return { date, minutes }
}

/**
 * Validação do slot público usada pelo create-booking (auditoria): o slot
 * existe na agenda do dia (específica ou recorrente), não está bloqueado
 * manualmente e não passou (BRT). A checagem do Google (freeBusy fail-closed)
 * é feita por validateGoogleSlot.
 */
export async function validatePublicSlot(opts: {
  supabase: any
  userId: string
  date: string
  startTime: string
  endTime: string
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase, userId, date, startTime } = opts

  const dayOfWeek = new Date(`${date}T12:00:00-03:00`).getDay()
  const [schedRes, specRes] = await Promise.all([
    supabase
      .from('schedule_settings')
      .select('start_time')
      .eq('user_id', userId)
      .eq('day_of_week', dayOfWeek),
    supabase
      .from('date_specific_schedules')
      .select('start_time')
      .eq('user_id', userId)
      .eq('specific_date', date),
  ])

  if (schedRes.error || specRes.error) {
    return { ok: false, error: 'Falha ao consultar a agenda do profissional.' }
  }

  const spec = specRes.data || []
  const schedule = spec.length > 0 ? spec : schedRes.data || []
  const slotExists = schedule.some(
    (s: any) => slotToMinutes(s.start_time) === slotToMinutes(startTime),
  )
  if (!slotExists) {
    return { ok: false, error: 'Horário fora da agenda disponível deste profissional.' }
  }

  const { data: locked, error: lockedError } = await supabase
    .from('locked_slots')
    .select('id, start_time, end_time')
    .eq('user_id', userId)
    .eq('lock_date', date)

  if (lockedError) {
    return { ok: false, error: 'Falha ao consultar horários bloqueados.' }
  }
  const reqStart = slotToMinutes(startTime)
  const reqEnd = slotToMinutes(opts.endTime || startTime)
  const overlapsLocked = (locked || []).some((l: any) => {
    const lStart = slotToMinutes(l.start_time)
    const lEnd = slotToMinutes(l.end_time || l.start_time)
    return reqStart < lEnd && reqEnd > lStart
  })
  if (overlapsLocked) {
    return { ok: false, error: 'Este horário está bloqueado pelo profissional.' }
  }

  const { date: todayBrt, minutes: nowBrtMinutes } = nowInBrt()
  if (date === todayBrt && reqStart <= nowBrtMinutes) {
    return { ok: false, error: 'Este horário já passou. Escolha outro, por favor.' }
  }

  return { ok: true }
}
