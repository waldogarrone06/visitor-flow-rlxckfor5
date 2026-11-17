// Validação de slot do Google Calendar (freeBusy) usada por get-availability e
// create-booking.
//
// Comportamento SEGURO mantido (fail-closed): se sync_enabled do profissional
// está ligado e o token do Google está ausente/expirado ou o Google falha, o
// slot é RECUSADO — nunca liberado.
//
// Novidades (auditoria):
// 1. Token renovado via refresh é PERSISTIDO de volta na integração
//    (user_integrations.google_calendar), com novo expiry — as próximas
//    chamadas reutilizam sem refazer o refresh.
// 2. Falha de autenticação/fetch do Google grava um ALERTA INTERNO na tabela
//    interaction_log (tipo 'google_auth_alert'), visível no app, apontando o
//    profissional e o motivo. Sem e-mail/WhatsApp externo.

import { logGoogleAuthAlert } from './google-alert.ts'

export interface GoogleSlotValidationResult {
  ok: boolean
  code?: 'no_token' | 'expired_token' | 'google_error'
  error?: string
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

interface GoogleCalendarIntegration {
  accessToken?: string | null
  refreshToken?: string | null
  expiresAt?: string | null
  [key: string]: unknown
}

async function loadIntegration(
  supabase: any,
  userId: string,
): Promise<GoogleCalendarIntegration | null> {
  const { data, error } = await supabase
    .from('user_integrations')
    .select('google_calendar')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.google_calendar) return null
  return data.google_calendar as GoogleCalendarIntegration
}

async function saveIntegration(
  supabase: any,
  userId: string,
  integration: GoogleCalendarIntegration,
): Promise<void> {
  // Persistência apenas dos campos de token (merge com o registro existente);
  // feita com service role — a tabela não é gravável pelo cliente.
  const { error } = await supabase
    .from('user_integrations')
    .update({
      google_calendar: {
        ...(integration as Record<string, unknown>),
      },
    })
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

function tokenIsExpired(integration: GoogleCalendarIntegration): boolean {
  if (!integration.accessToken) return true
  const expiryMs = integration.expiresAt ? Date.parse(integration.expiresAt) : 0
  // Margem de 60s: token prestes a vencer é tratado como vencido.
  return !expiryMs || expiryMs <= Date.now() + 60_000
}

async function refreshAccessToken(
  supabase: any,
  userId: string,
  integration: GoogleCalendarIntegration,
): Promise<boolean> {
  if (!integration.refreshToken) return false
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || ''
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') || ''
  if (!clientId || !clientSecret) return false

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: integration.refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    console.error(`[slot-validation] refresh do token falhou para ${userId}: HTTP ${res.status}`)
    return false
  }

  const data = await res.json().catch(() => null)
  if (!data?.access_token) return false

  integration.accessToken = data.access_token
  integration.expiresAt = new Date(
    Date.now() + (Number(data.expires_in) || 3600) * 1000,
  ).toISOString()

  // PERSISTÊNCIA do token renovado — a próxima chamada não refaz o refresh.
  await saveIntegration(supabase, userId, integration)
  return true
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
 * Valida o slot contra o Google Calendar do profissional.
 * - sync_enabled desligado: ok (não há integração ativa).
 * - Falha de autenticação Google: RECUSA o slot (fail-closed) e grava alerta
 *   interno (uma vez por janela de 1h por profissional).
 */
export async function validateGoogleSlot(
  supabase: any,
  userId: string,
  startIso: string,
  endIso: string,
): Promise<GoogleSlotValidationResult> {
  // 1. sync_enabled ligado?
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('sync_enabled')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    return { ok: false, code: 'google_error', error: 'Falha ao carregar perfil do profissional.' }
  }

  if (!profile?.sync_enabled) {
    return { ok: true }
  }

  // 2. Integração + token.
  const integration = await loadIntegration(supabase, userId)
  if (!integration || !integration.refreshToken) {
    await logGoogleAuthAlert(
      supabase,
      userId,
      'no_token',
      'Integração do Google Calendar ausente ou sem refresh token.',
    )
    return {
      ok: false,
      code: 'no_token',
      error: 'Agenda não sincronizada. Conecte o Google Calendar nas configurações.',
    }
  }

  // 3. Token expirado? Tenta renovar (e persistir o renovado).
  let accessToken = integration.accessToken || ''
  if (tokenIsExpired(integration)) {
    const renewed = await refreshAccessToken(supabase, userId, integration)
    if (!renewed) {
      await logGoogleAuthAlert(
        supabase,
        userId,
        'expired_token',
        'Token do Google Calendar expirado e renovação falhou.',
      )
      return {
        ok: false,
        code: 'expired_token',
        error: 'Não foi possível renovar o token do Google Calendar. Reconecte a conta.',
      }
    }
    accessToken = integration.accessToken || ''
  }

  // 4. freeBusy do Google.
  const freeBusyOk = await fetchFreeBusy(accessToken, startIso, endIso)
  if (!freeBusyOk) {
    // Falha de rede/Google: fail-closed — recusa o slot e alerta.
    await logGoogleAuthAlert(
      supabase,
      userId,
      'google_error',
      'Falha ao consultar o Google Calendar (freeBusy indisponível).',
    )
    return {
      ok: false,
      code: 'google_error',
      error: 'Google Calendar temporariamente indisponível. Tente novamente em instantes.',
    }
  }

  return { ok: true }
}
