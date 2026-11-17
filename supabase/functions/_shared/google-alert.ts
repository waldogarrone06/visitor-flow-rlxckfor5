// Alerta interno de falha de autenticação do Google Calendar.
// Quando o profissional tem sync_enabled e o token está expirado/ausente, o
// slot é recusado (fail-safe, mantido) — e um registro de alerta é gravado na
// tabela public.interaction_log (usada pelo app como histórico de interações)
// para o profissional ser avisado dentro do próprio app.
//
// SEM e-mail/WhatsApp externo: o alerta é só interno, por decisão do usuário.
// Deduplicação: um alerta idêntico (mesmo type + user) dentro da última hora
// não é regravado — evita encher a tabela a cada consulta de disponibilidade.
const ALERT_TYPE = 'google_token_alert'
const DEDUPE_WINDOW_MINUTES = 60

export async function logGoogleTokenAlert(
  supabase: any,
  userId: string,
  reason: string,
): Promise<void> {
  try {
    const since = new Date(Date.now() - DEDUPE_WINDOW_MINUTES * 60 * 1000).toISOString()
    const { data: existing, error: selectError } = await supabase
      .from('interaction_log')
      .select('id')
      .eq('user_id', userId)
      .eq('type', ALERT_TYPE)
      .gte('created_at', since)
      .limit(1)

    if (selectError) {
      console.error('[google-alert] select falhou:', selectError.message)
    }
    if (existing && existing.length > 0) {
      return // já alertado na janela — não duplica
    }

    const { error: insertError } = await supabase.from('interaction_log').insert({
      user_id: userId,
      type: ALERT_TYPE,
      details: {
        title: 'Google Calendar: token expirado ou ausente',
        message:
          'A sincronização com o Google Calendar está ativa, mas o token de acesso está expirado ou ausente. ' +
          'Os horários estão temporariamente bloqueados até a reconexão. Reconecte em Configurações > Google Calendar.',
        reason,
        severity: 'warning',
        source: 'get-availability/slot-validation',
      },
    })

    if (insertError) {
      console.error('[google-alert] insert falhou:', insertError.message)
    }
  } catch (e: any) {
    // O alerta NUNCA derruba o fluxo principal.
    console.error('[google-alert] erro inesperado:', e?.message || e)
  }
}
