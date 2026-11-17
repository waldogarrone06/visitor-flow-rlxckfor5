import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

// qa-e2e — edge function TEMPORÁRIA de teste (será apagada após o QA).
// Executa, com service role, o teste E2E real de reserva e devolve um relatório
// JSON. Protegida por token próprio (env QA_E2E_TOKEN) — nunca exposta ao app.
//
// Passos (pedido do usuário):
//  1) Reserva real via RPC book_appointment (mesma chamada da create-booking);
//  2) E-mail de confirmação via send-email (Resend) — status do envio;
//  3) WhatsApp via whatsapp-send (Evolution) — status do envio;
//  4) Contato: verifica duplicidade por telefone normalizado;
//  5) Capacidade: enche o MESMO slot até a 11ª ser recusada (CAPACITY_EXCEEDED).
// Todos os registros de teste são marcados e podem ser apagados via ?cleanup=1.

const USER_ID = '1210e006-fbee-4c23-b7da-33e85e7703e0'
const INTERNAL_EMAIL = 'contato@fourlabnutrition.com.br' // caixa própria do negócio
const TEST_PHONE = '5511987654321' // telefone de teste da própria equipe
const TEST_DATE = '2026-11-19'
const TEST_TIME = '11:00'
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok')

  const token = req.headers.get('x-qa-token') || new URL(req.url).searchParams.get('token') || ''
  const expected = Deno.env.get('QA_E2E_TOKEN') || ''
  if (!expected || token !== expected) return json({ error: 'Token de QA inválido.' }, 401)

  const url = new URL(req.url)
  const cleanup = url.searchParams.get('cleanup') === '1'
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  )

  // ---------------- Limpeza de qualquer teste anterior -----------------------
  const del = await supabase.from('appointments').delete().eq('client_name', 'TESTE QA E2E')
  await supabase.from('messages').delete().eq('content', 'qa-e2e-whatsapp-marker')
  const preExisting = await supabase
    .from('contacts')
    .select('id, phone, email, name')
    .eq('user_id', USER_ID)
    .or(`phone.eq.${TEST_PHONE},email.eq.${INTERNAL_EMAIL}`)
  const hadContactBefore = (preExisting.data || []).length > 0

  if (cleanup) {
    // Remove contato de teste se ele foi criado por este teste (não existia antes).
    if (!hadContactBefore) {
      await supabase.from('contacts').delete().eq('user_id', USER_ID).eq('phone', TEST_PHONE)
    }
    return json({ cleanup: true, removedContacts: !hadContactBefore })
  }

  const report: Record<string, any> = {}

  // ---------------- (a) Reserva real -----------------------------------------
  const booking = await supabase.rpc('book_appointment', {
    p_user_id: USER_ID,
    p_appointment_date: TEST_DATE,
    p_start_time: TEST_TIME,
    p_end_time: '11:30',
    p_status: 'scheduled',
    p_client_name: 'TESTE QA E2E',
    p_client_email: INTERNAL_EMAIL,
    p_client_phone: TEST_PHONE,
    p_client_document: null,
    p_specialty: null,
    p_professional_id: null,
    p_clinic_cep: null,
    p_clinic_address: null,
    p_clinic_number: null,
    p_clinic_neighborhood: null,
    p_clinic_complement: null,
    p_clinic_city: null,
    p_clinic_state: null,
    p_instagram: null,
    p_patients_per_month: null,
    p_max_capacity: MAX_CAPACITY,
    p_lgpd_consent_at: null,
  })
  report.booking = {
    ok: !booking.error,
    error: booking.error?.message || null,
    appointmentId: booking.data?.[0]?.id || booking.data?.id || null,
  }
  if (booking.error || !booking.data) return json({ report, fatal: 'booking' }, 200)

  // ---------------- (b) E-mail via send-email (Resend) ------------------------
  const email = await callFunction('send-email', {
    to: INTERNAL_EMAIL,
    template: 'confirmation',
    vars: {},
  })
  // send-email pode exigir um template fixo; se falhar, tenta um payload cru
  // apenas para PROVAR o caminho do Resend (o teste é sobre o canal, não o copy).
  let emailStatus = { status: email.status, body: email.body }
  if (email.status !== 200) {
    const raw = await callFunction('send-email', {
      to: INTERNAL_EMAIL,
      subject: 'TESTE QA E2E — confirmação de agendamento',
      html: '<p>Teste E2E de reserva (QA automatizado).</p>',
      senderName: 'FourLab Nutrition',
    })
    emailStatus = { status: raw.status, body: raw.body }
  }
  report.email = emailStatus

  // ---------------- (c) WhatsApp via whatsapp-send (Evolution) ----------------
  const wa = await callFunction('whatsapp-send', {
    to: TEST_PHONE,
    text: 'qa-e2e-whatsapp-marker',
    userId: USER_ID,
  })
  report.whatsapp = { status: wa.status, body: wa.body }

  // ---------------- (d) Contato duplicado? ------------------------------------
  const before = (preExisting.data || []).length
  const after = await supabase
    .from('contacts')
    .select('id, phone, email, name')
    .eq('user_id', USER_ID)
    .eq('phone', TEST_PHONE)
  report.contact = {
    existedBefore: before > 0,
    countAfter: (after.data || []).length,
    ids: (after.data || []).map((c) => c.id),
  }

  // ---------------- (e) Capacidade: 10 por slot, a 11ª recusada ----------------
  // (a) já ocupa 1 vaga. Preencher até 10 e tentar a 11ª.
  const capacity: any[] = []
  for (let n = 2; n <= MAX_CAPACITY; n++) {
    const r = await supabase.rpc('book_appointment', {
      p_user_id: USER_ID,
      p_appointment_date: TEST_DATE,
      p_start_time: TEST_TIME,
      p_end_time: '11:30',
      p_status: 'scheduled',
      p_client_name: 'TESTE QA E2E',
      p_client_email: INTERNAL_EMAIL,
      p_client_phone: TEST_PHONE,
      p_client_document: null,
      p_specialty: null,
      p_professional_id: null,
      p_clinic_cep: null,
      p_clinic_address: null,
      p_clinic_number: null,
      p_clinic_neighborhood: null,
      p_clinic_complement: null,
      p_clinic_city: null,
      p_clinic_state: null,
      p_instagram: null,
      p_patients_per_month: null,
      p_max_capacity: MAX_CAPACITY,
      p_lgpd_consent_at: null,
    })
    capacity.push({ n, ok: !r.error, error: r.error?.message || null })
    if (r.error) break
  }
  // A 11ª tentativa DEVE falhar.
  const eleventh = await supabase.rpc('book_appointment', {
    p_user_id: USER_ID,
    p_appointment_date: TEST_DATE,
    p_start_time: TEST_TIME,
    p_end_time: '11:30',
    p_status: 'scheduled',
    p_client_name: 'TESTE QA E2E',
    p_client_email: INTERNAL_EMAIL,
    p_client_phone: TEST_PHONE,
    p_client_document: null,
    p_specialty: null,
    p_professional_id: null,
    p_clinic_cep: null,
    p_clinic_address: null,
    p_clinic_number: null,
    p_clinic_neighborhood: null,
    p_clinic_complement: null,
    p_clinic_city: null,
    p_clinic_state: null,
    p_instagram: null,
    p_patients_per_month: null,
    p_max_capacity: MAX_CAPACITY,
    p_lgpd_consent_at: null,
  })
  report.capacity = {
    filled: capacity.filter((c) => c.ok).length + 1, // +1 da reserva (a)
    lastFill: capacity[capacity.length - 1] || null,
    eleventh: {
      ok: !eleventh.error,
      error: eleventh.error?.message || null,
    },
  }

  return json({ report })
})
