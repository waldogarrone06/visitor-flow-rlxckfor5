import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

// qa-e2e — edge function TEMPORÁRIA de teste (stub 404 logo após o QA).
// Token HARDCODED de propósito (temporário): QA_E2E_TOKEN não chegava ao
// runtime; a function é apagada no fim do teste e o secret removido.
//
// Uso (GET): ?token=<TOKEN>&phase=full|booking|email|whatsapp|dup|capacity|cleanup
// Fases exercitam o caminho REAL (create-booking via HTTP, send-email,
// whatsapp-send) com dados marcados "TESTE QA E2E" e contato interno.

const QA_TOKEN = 'qa-e2e-tmp-20261117'
const USER_ID = '1210e006-fbee-4c23-b7da-33e85e7703e0'
const INTERNAL_EMAIL = 'contato@fourlabnutrition.com.br' // caixa própria do negócio
const TEST_PHONE = '5511987654321' // telefone de teste marcado (fake)
const TEST_NAME = 'TESTE QA E2E'
const TEST_DATE = '2026-11-22' // domingo — slot recorrente 12:00-13:00 existente
const TEST_TIME = '12:00'
const TEST_END = '13:00'
const MAX_CAPACITY = 10

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

async function callFunction(name: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text().catch(() => '')
  let parsed: any = text
  try {
    parsed = JSON.parse(text)
  } catch {
    /* texto puro */
  }
  return { status: res.status, body: parsed }
}

const BOOKING_BODY = () => ({
  userId: USER_ID,
  appointmentDate: TEST_DATE,
  startTime: TEST_TIME,
  endTime: TEST_END,
  clientName: TEST_NAME,
  clientEmail: INTERNAL_EMAIL,
  clientPhone: TEST_PHONE,
  lgpdConsent: true,
  createCalendar: false, // teste não cria evento no Google Calendar
  sendConfirmationEmail: true,
})

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok')

  const url = new URL(req.url)
  const token = req.headers.get('x-qa-token') || url.searchParams.get('token') || ''
  if (token !== QA_TOKEN) return json({ error: 'Token de QA inválido.' }, 401)

  const phase = url.searchParams.get('phase') || 'full'
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  )
  const report: Record<string, any> = { phase, now: new Date().toISOString() }

  // ---------------- cleanup (apagável a qualquer momento) --------------------
  if (phase === 'cleanup' || phase === 'full') {
    const ap = await supabase.from('appointments').delete().eq('client_name', TEST_NAME)
    const ct = await supabase
      .from('contacts')
      .delete()
      .eq('user_id', USER_ID)
      .eq('phone', TEST_PHONE)
    const ms = await supabase
      .from('messages')
      .delete()
      .eq('user_id', USER_ID)
      .ilike('content', 'TESTE QA%')
    const il = await supabase
      .from('interaction_log')
      .delete()
      .eq('user_id', USER_ID)
      .or(`details->>to.eq.${TEST_PHONE},type.ilike.qa%`)
    const rl = await supabase
      .from('rate_limit_events')
      .delete()
      .like('bucket', 'booking%')
      .gte('created_at', new Date(Date.now() - 2 * 3600_000).toISOString())
    const qtl = await supabase.from('qa_test_log').delete().neq('step', '')
    report.cleanup = {
      appointments: !ap.error,
      contacts: !ct.error,
      messages: !ms.error,
      interactionLog: !il.error,
      rateLimitEvents: !rl.error,
      qaTestLog: !qtl.error,
      errors: [ap, ct, ms, il, rl, qtl]
        .filter((r: any) => r.error)
        .map((r: any) => r.error.message),
    }
    if (phase === 'cleanup') return json(report)
  }

  // ---------------- (a) reserva real via create-booking (HTTP) ----------------
  if (phase === 'full' || phase === 'booking') {
    const r = await callFunction('create-booking', BOOKING_BODY())
    report.booking = {
      status: r.status,
      success: r.body?.success === true,
      appointmentId: r.body?.appointment?.id || null,
      contactId: r.body?.contactId || null,
      emailSent: r.body?.emailSent ?? null,
      calendarWarning: r.body?.calendarWarning ?? null,
      error: r.body?.error || null,
    }
  }

  // ---------------- (b) e-mail via send-email (Resend) ------------------------
  if (phase === 'full' || phase === 'email') {
    // Tenta 1) domínio do negócio (pode falhar se não verificado no Resend)
    // e 2) sandbox onboarding@resend.dev (entregável ao dono da conta Resend).
    const attempts: any[] = []
    const froms: Array<{ from?: string; label: string }> = [
      { label: 'contato@fourlabnutrition.com.br' },
      { from: 'onboarding@resend.dev', label: 'onboarding@resend.dev (sandbox)' },
    ]
    for (const f of froms) {
      const r = await callFunction('send-email', {
        to: INTERNAL_EMAIL,
        subject: `TESTE QA E2E — confirmação de agendamento ${TEST_DATE} ${TEST_TIME}`,
        html: '<p>Teste E2E de reserva (QA automatizado). Pode apagar.</p>',
        text: 'TESTE QA E2E — pode apagar.',
        senderName: 'FourLab Nutrition',
        from: f.from,
      })
      const resendId = r.body?.messageId || null
      let resendStatus: any = null
      if (resendId) {
        const chk = await fetch(`https://api.resend.com/emails/${resendId}`, {
          headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}` },
        })
        resendStatus = chk.ok ? await chk.json().catch(() => null) : { http: chk.status }
      }
      attempts.push({
        from: f.label,
        sendStatus: r.status,
        messageId: resendId,
        resendReadback: resendStatus?.last_event || resendStatus || null,
        error: r.body?.error || null,
      })
      if (r.status === 200) break // entregue — não precisa do fallback
    }
    report.email = { attempts, delivered: attempts.some((a) => a.sendStatus === 200) }
  }

  // ---------------- (c) WhatsApp via whatsapp-send (Evolution) ----------------
  if (phase === 'full' || phase === 'whatsapp') {
    const r = await callFunction('whatsapp-send', {
      to: TEST_PHONE,
      text: `TESTE QA E2E — mensagem de teste do fluxo de agendamento. Pode apagar.`,
      userId: USER_ID,
    })
    report.whatsapp = {
      status: r.status,
      provider: r.body?.provider || null,
      messageId: r.body?.messageId || r.body?.wamid || null,
      evolutionResponse: r.body?.evolutionResponse || null,
      error: r.body?.error || null,
    }
  }

  // ---------------- (d) contato NÃO duplica (2ª reserva mesmo telefone) -------
  if (phase === 'full' || phase === 'dup') {
    const r = await callFunction('create-booking', BOOKING_BODY())
    const after = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', USER_ID)
      .eq('phone', TEST_PHONE)
    report.duplicateContact = {
      secondBookingStatus: r.status,
      secondContactId: r.body?.contactId || null,
      contactsCountAfter: (after.data || []).length,
      unique: (after.data || []).length === 1,
      error: r.body?.error || null,
    }
  }

  // ---------------- (e) capacidade: 10 aceitas, 11ª recusada ------------------
  if (phase === 'full' || phase === 'capacity') {
    const countRes = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: false })
      .eq('user_id', USER_ID)
      .eq('appointment_date', TEST_DATE)
      .eq('start_time', TEST_TIME)
      .in('status', ['lead', 'scheduled'])
    let active = countRes.count || 0
    const filledViaRpc: number[] = []
    while (active < MAX_CAPACITY) {
      const r = await supabase.rpc('book_appointment', {
        p_user_id: USER_ID,
        p_appointment_date: TEST_DATE,
        p_start_time: TEST_TIME,
        p_end_time: TEST_END,
        p_status: 'scheduled',
        p_client_name: TEST_NAME,
        p_client_email: INTERNAL_EMAIL,
        p_client_phone: TEST_PHONE,
        p_max_capacity: MAX_CAPACITY,
        p_lgpd_consent_at: null,
      })
      if (r.error) {
        report.capacity = { stage: 'fill', active, error: r.error.message }
        return json(report)
      }
      active++
      filledViaRpc.push(active)
    }
    // 11ª tentativa pelo CAMINHO REAL (create-booking): deve ser 409 capacidade.
    const eleventh = await callFunction('create-booking', BOOKING_BODY())
    report.capacity = {
      activeBeforeFill: countRes.count || 0,
      acceptedBeforeRefusal: active, // deve ser 10
      eleventhStatus: eleventh.status, // deve ser 409
      eleventhError: eleventh.body?.error || null,
      refusedCorrectly: eleventh.status === 409,
    }
  }

  return json(report)
})
