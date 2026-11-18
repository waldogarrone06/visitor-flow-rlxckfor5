import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getGoogleTokens } from '../_shared/integration-secrets.ts'

// qa-e2e-booking — função TEMPORÁRIA de uso único (teste E2E do agendamento público).
// Padrão já usado em rodadas anteriores: executa os cenários contra as edge functions
// REAIS (create-booking/get-availability/send-email/whatsapp-send) via HTTP, coleta as
// evidências e devolve o relatório JSON na PRÓPRIA resposta. A limpeza acontece no
// próprio run (inclusive das próprias linhas de interaction_log deste run, apagadas
// APÓS a montagem do relatório).
//
// CENÁRIOS:
// C1: disponibilidade — get-availability (anon) para os próximos 14 dias; para cada dia,
//     consulta o freebusy do Google (mesma fonte do validateGoogleSlot) e escolhe o
//     primeiro slot comercial cuja contagem de reservas é 0 E que o Google reports livre.
// C2: reserva no slot livre — create-booking (anon) → 200 esperado + linha criada.
// C3: evento no Google ocupa — cria evento REAL na conta conectada cobrindo o MESMO
//     slot → create-booking de novo → 422 com mensagem em português.
// C4: capacidade — remove reservas/evento QA e cria 10 reservas no MESMO slot completo;
//     a 10ª passa e a 11ª recebe 409 "Este horário acabou de esgotar...". rate_limit_events
//     é zerado antes de CADA booking para o 429 não mascarar o 409.
// C5: envios — chamadas DIRETAS às functions reais send-email (caminho interno, igual ao
//     que create-booking usa) e whatsapp-send (Evolution) para capturar status HTTP e erro
//     verbatim.
// C6: contato repetido — segunda reserva com MESMO telefone em outro slot livre →
//     contatos com aquele telefone devem permanecer 1 (não duplica).
// CLEANUP: apaga appointments/contacts (por nome E telefone)/eventos Google QA/
//     rate_limit_events do run/interaction_log do run; confere com SELECT.
//
// SEGURANÇA: roda sob service role. Nenhum dado sensível é devolvido — só status HTTP,
// mensagens de erro e contagens.

const USER_ID = '87f4e576-6608-4016-8366-2632131092ab'
const LOG_TYPE = 'qa_e2e_booking_v4' // marcador deste run
const QA_NAME_LIKE = 'TESTE QA E2E%'
const QA_PHONE = '11999990001' // cliente de teste repetido
const QA_PHONE_2 = '11999990002' // cliente do cenário Google

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
)

const URLS = {
  availability: `${Deno.env.get('SUPABASE_URL')}/functions/v1/get-availability`,
  booking: `${Deno.env.get('SUPABASE_URL')}/functions/v1/create-booking`,
  sendEmail: `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`,
  waSend: `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-send`,
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ---------- helpers de data (BRT) ----------
function nowInBrt(type: Intl.DateTimeFormatPartTypes): string {
  return (
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
  )
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00-03:00`)
  d.setDate(d.getDate() + days)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function dayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00-03:00`).getDay()
}

// ---------- limpeza (roda no início e no fim — idempotente) ----------
async function cleanupAll(startedAt?: string): Promise<{ deletedGoogleEvents: string[]; errors: string[] }> {
  const errors: string[] = []
  const deletedGoogleEvents: string[] = []
  // 1) Agendamentos de teste (por nome)
  const delApp = await supabaseAdmin.from('appointments').delete().like('client_name', QA_NAME_LIKE)
  if (delApp.error) errors.push(`appointments: ${delApp.error.message}`)
  // 2) Contatos de teste (por nome E por telefone de teste, com e sem prefixo 55)
  const delCon = await supabaseAdmin.from('contacts').delete().like('name', QA_NAME_LIKE)
  if (delCon.error) errors.push(`contacts(name): ${delCon.error.message}`)
  const delCon2 = await supabaseAdmin
    .from('contacts')
    .delete()
    .in('phone', [QA_PHONE, `55${QA_PHONE}`, QA_PHONE_2, `55${QA_PHONE_2}`])
  if (delCon2.error) errors.push(`contacts(phone): ${delCon2.error.message}`)
  // 3) Eventos Google de teste — listagem por JANELA DE TEMPO (sem q=, que tem
  // lag de indexação) e filtro por resumo no cliente. Cobre tanto os eventos
  // de ocupação injetados quanto os criados pelo create-booking ("Reunião: ...").
  const token = await googleToken()
  if (token) {
    const timeMin = new Date(Date.now() - 86400000).toISOString()
    const timeMax = new Date(Date.now() + 21 * 86400000).toISOString()
    const all: any[] = []
    let pageToken: string | undefined
    do {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&maxResults=250${pageToken ? `&pageToken=${pageToken}` : ''}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) {
        errors.push(`google list: HTTP ${res.status}`)
        break
      }
      const data = await res.json()
      all.push(...(data.items || []))
      pageToken = data.nextPageToken
    } while (pageToken)
    for (const item of all) {
      const summary: string = item.summary || ''
      const isQa =
        summary.includes('TESTE QA E2E') || /^Reunião: TESTE QA E2E/.test(summary)
      if (!isQa) continue
      const del = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${item.id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      )
      if (del.ok || del.status === 410) deletedGoogleEvents.push(item.id)
      else errors.push(`google event ${item.id}: HTTP ${del.status}`)
    }
  }
  // 4) Rate limit events do run
  if (startedAt) {
    const delRl = await supabaseAdmin
      .from('rate_limit_events')
      .delete()
      .gte('created_at', startedAt)
    if (delRl.error) errors.push(`rate_limit_events: ${delRl.error.message}`)
  }
  return { deletedGoogleEvents, errors }
}

// ---------- log de evidência (o próprio run apaga ao final) ----------
async function logStep(name: string, data: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from('interaction_log')
    .insert({
      user_id: USER_ID,
      type: LOG_TYPE,
      details: { ...data, kind: 'step', step: name, ts: new Date().toISOString() },
    })
  if (error) console.error('[qa-e2e-booking] logStep:', error.message)
}

// ---------- cliente HTTP com as chaves anon (mesma chamada que o front real faz) ----------
async function anonCall(
  url: string,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: Deno.env.get('SUPABASE_ANON_KEY') || '',
      ...extraHeaders,
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

// Pausa entre chamadas: mitiga o rate limit da PLATAFORMA (por rajada de
// invocações), não o do app (que zeramos no banco entre reservas).
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const PAUSE_MS = 1500

// ---------- Google Calendar (mesma API que o app usa) ----------
async function googleToken(): Promise<string | null> {
  const tokens = await getGoogleTokens(supabaseAdmin, USER_ID)
  if (!tokens?.accessToken) return null
  return tokens.accessToken
}

async function freebusyDay(token: string, date: string): Promise<string[]> {
  // Devolve a lista "busy" (start/end ISO) do dia na agenda primária conectada.
  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin: `${date}T00:00:00-03:00`,
      timeMax: `${date}T23:59:59-03:00`,
      items: [{ id: 'primary' }],
    }),
  })
  if (!res.ok) return []
  const data = await res.json()
  return data?.calendars?.primary?.busy || []
}

function overlapsSlot(busy: { start: string; end: string }, date: string, s: string, e: string): boolean {
  const slotStart = new Date(`${date}T${s}:00-03:00`).getTime()
  const slotEnd = new Date(`${date}T${e}:00-03:00`).getTime()
  const bStart = new Date(busy.start).getTime()
  const bEnd = new Date(busy.end).getTime()
  return bStart < slotEnd && bEnd > slotStart
}

async function listDayEvents(token: string, date: string): Promise<any[]> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${date}T00:00:00-03:00&timeMax=${date}T23:59:59-03:00&singleEvents=true&orderBy=startTime`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return [{ error: `HTTP ${res.status}` }]
  const data = await res.json()
  return (data.items || []).map((i: any) => ({ id: i.id, summary: i.summary, start: i.start, end: i.end }))
}

async function insertGoogleEvent(
  token: string,
  date: string,
  start: string,
  end: string,
  summary: string,
): Promise<{ id: string | null; error: string | null }> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary,
      start: { dateTime: `${date}T${start}:00-03:00`, timeZone: 'America/Sao_Paulo' },
      end: { dateTime: `${date}T${end}:00-03:00`, timeZone: 'America/Sao_Paulo' },
    }),
  })
  if (!res.ok) {
    return { id: null, error: `google ${res.status}: ${await res.text().catch(() => '')}` }
  }
  const data = await res.json()
  return { id: data.id || null, error: null }
}

// ---------- main ----------
async function main(): Promise<Response> {
  const startedAt = new Date().toISOString()
  const report: any = {
    startedAt,
    userId: USER_ID,
    slot: null,
    scenarios: {},
    cleanup: {},
    counts: {},
    warnings: [],
  }

  // ---------- C0: setup + limpeza defensiva de runs anteriores ----------
  const pre = await cleanupAll(startedAt)
  if (pre.errors.length) report.warnings.push({ cleanupPre: pre.errors })
  report.cleanup.preRun = { googleEventsDeleted: pre.deletedGoogleEvents, errors: pre.errors }

  const headAppointments = async (like: string) =>
    (
      await supabaseAdmin
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .like('client_name', like)
    ).count
  const contactsHead = async (col: string, val: string) =>
    (
      await supabaseAdmin
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq(col, val)
    ).count

  const token = await googleToken()
  report.googleTokenAvailable = !!token

  try {
    report.counts.before = {
      appointmentsQa: await headAppointments(QA_NAME_LIKE),
      contactsQaByName: await contactsHead('name', 'TESTE QA E2E Livre'),
      contactsQaByPhone: await contactsHead('phone', QA_PHONE),
    }

    // ---------- C1: disponibilidade (get-availability real + freebusy Google) ----------
    let D: string | null = null
    let S: string | null = null
    let E: string | null = null
    const todayBrt = `${nowInBrt('year')}-${nowInBrt('month')}-${nowInBrt('day')}`
    const attempts: any[] = []
    for (let i = 1; i <= 14 && !D; i++) {
      const date = addDays(todayBrt, i)
      const r = await anonCall(URLS.availability, { userId: USER_ID, date })
      attempts.push({ date, status: r.status, error: r.body?.error || null, dow: dayOfWeek(date) })
      if (D) break
      if (r.status !== 200) continue
      await sleep(400)
      const slots = (r.body?.schedule || []) as any[]
      if (!slots.length) continue
      // Freebusy do dia (mesma fonte do validateGoogleSlot) — só slots Google-livres.
      const busy = token ? await freebusyDay(token, date) : []
      for (const s of slots) {
        const count = Number(r.body?.slotCounts?.[`${s.start_time}-${s.end_time ?? ''}`] || 0)
        const googleBusy = busy.some((b) => overlapsSlot(b, date, s.start_time, s.end_time))
        if (count === 0 && !googleBusy && s.start_time && s.end_time) {
          D = date
          S = s.start_time
          E = s.end_time
          break
        }
      }
   }
    report.scenarios.c1_availability = { status: D ? 'ok' : 'failed', picked: { D, S, E }, attempts }
    if (!D || !S || !E) throw new Error('Nenhum dia com slot comercial livre (contagem 0 e Google livre) em 14 dias.')

    report.slot = { D, S, E }

    // ---------- C2: reserva no slot livre (create-booking, anon) ----------
    await supabaseAdmin.from('rate_limit_events').delete().gte('created_at', startedAt)
    await sleep(PAUSE_MS)
    const c2 = await anonCall(URLS.booking, {
      userId: USER_ID,
      appointmentDate: D,
      startTime: S,
      endTime: E,
      clientName: 'TESTE QA E2E Livre',
      clientEmail: 'teste.qa.e2e@fourlabnutrition.com.br',
      clientPhone: QA_PHONE,
      specialty: 'TESTE QA E2E',
      lgpdConsent: true,
      createCalendar: true,
      sendConfirmationEmail: true,
    })
    report.scenarios.c2_free_slot = {
      status: c2.status === 200 ? 'ok' : 'failed',
      http: c2.status,
      body: c2.body,
      dayGoogleEvents: c2.status !== 200 && token ? await listDayEvents(token, D) : undefined,
    }
    await logStep('C2', { http: c2.status, emailSent: c2.body?.emailSent ?? null })

    // ---------- C3: evento no Google ocupa o MESMO slot ----------
    if (!token) {
      report.scenarios.c3_google_busy = { status: 'skipped', reason: 'sem google token' }
    } else {
      // Remove a reserva do C2 para o busy vir SÓ do Google.
      await supabaseAdmin
        .from('appointments')
        .delete()
        .eq('user_id', USER_ID)
        .eq('appointment_date', D)
        .eq('start_time', S)
      const ins = await insertGoogleEvent(
        token,
        D,
        S,
        E,
        `TESTE QA E2E — ocupação E2E (${S}-${E})`,
      )
      if (!ins.id) {
        report.scenarios.c3_google_busy = { status: 'failed', insertError: ins.error }
      } else {
        await supabaseAdmin.from('rate_limit_events').delete().gte('created_at', startedAt)
        await sleep(PAUSE_MS)
        const c3 = await anonCall(URLS.booking, {
          userId: USER_ID,
          appointmentDate: D,
          startTime: S,
          endTime: E,
          clientName: 'TESTE QA E2E Google',
          clientEmail: 'teste.qa.e2e.google@fourlabnutrition.com.br',
          clientPhone: QA_PHONE_2,
          specialty: 'TESTE QA E2E',
          lgpdConsent: true,
          createCalendar: false,
          sendConfirmationEmail: false,
        })
        report.scenarios.c3_google_busy = {
          status: c3.status === 422 ? 'ok' : 'failed',
          googleEventInserted: true,
          http: c3.status,
          body: c3.body,
        }
        await logStep('C3', { http: c3.status, body: c3.body })
      }
    }

    // ---------- C4: capacidade (10 reservas + a 11ª deve dar 409) ----------
    // Remove o evento Google de C3 e qualquer reserva QA para o slot voltar a 0.
    await cleanupAll(startedAt)
    await sleep(PAUSE_MS)
    const c4: any[] = []
    for (let i = 1; i <= 11; i++) {
      // Zera o rate limit do run antes de CADA reserva (o 429 não deve mascarar o 409).
      await supabaseAdmin.from('rate_limit_events').delete().gte('created_at', startedAt)
      await sleep(PAUSE_MS)
      const r = await anonCall(URLS.booking, {
        userId: USER_ID,
        appointmentDate: D,
        startTime: S,
        endTime: E,
        clientName: `TESTE QA E2E Cap ${String(i).padStart(2, '0')}`,
        clientEmail: `teste.qa.e2e.cap${String(i).padStart(2, '0')}@fourlabnutrition.com.br`,
        clientPhone: `1199999${String(1000 + i).padStart(4, '0')}`,
        specialty: 'TESTE QA E2E',
        lgpdConsent: true,
        createCalendar: false,
        sendConfirmationEmail: false,
      })
      c4.push({ i, http: r.status, error: r.body?.error || null, id: r.body?.appointment?.id || null })
      await logStep('C4', { i, http: r.status, error: r.body?.error || null })
    }
    const ok10 = c4.slice(0, 10).filter((x) => x.http === 200).length
    const last = c4[c4.length - 1]
    report.scenarios.c4_capacity = {
      status: ok10 === 10 && last.http === 409 ? 'ok' : 'failed',
      okCount: ok10,
      lastHttp: last.http,
      lastError: last.error,
      results: c4,
    }

    // ---------- C5: envios (e-mail Resend + WhatsApp Evolution, functions reais) ----------
    // Caminho interno (service role) — o mesmo que create-booking usa.
    await sleep(PAUSE_MS)
    const emailRes = await fetch(URLS.sendEmail, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        to: 'teste.qa.e2e@fourlabnutrition.com.br',
        subject: 'TESTE QA E2E — confirmação de agendamento',
        html: '<p>TESTE QA E2E — e-mail de confirmação (cenário 5).</p>',
        senderName: 'FourLab Nutrition',
      }),
    })
    const emailText = await emailRes.text().catch(() => '')
    let emailBody: any = emailText
    try {
      emailBody = JSON.parse(emailText)
    } catch { /* texto */ }
    report.scenarios.c5_sends = { email: { http: emailRes.status, body: emailBody } }

    await sleep(PAUSE_MS)
    const waRes = await fetch(URLS.waSend, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        userId: USER_ID,
        to: QA_PHONE,
        text: 'TESTE QA E2E — mensagem de confirmação (cenário 5).',
      }),
    })
    const waText = await waRes.text().catch(() => '')
    let waBody: any = waText
    try {
      waBody = JSON.parse(waText)
    } catch { /* texto */ }
    // Não devolver o evolutionResponse inteiro (longo) — só o essencial.
    if (waBody && typeof waBody === 'object') {
      waBody = {
        success: waBody.success,
        provider: waBody.provider,
        messageId: waBody.messageId,
        error: waBody.error,
        evolutionStatus: waBody.evolutionResponse?.status,
      }
    }
    report.scenarios.c5_sends.whatsapp = { http: waRes.status, body: waBody }
    await logStep('C5', { emailHttp: emailRes.status, waHttp: waRes.status })

    // ---------- C6: contato repetido (mesmo telefone → não duplicar) ----------
    // Segunda reserva do MESMO cliente em OUTRO slot livre do MESMO dia (ou do próximo
    // dia livre) para não esbarrar na capacidade do C4.
    let S2: string | null = null
    let E2: string | null = null
    let D2 = D
    if (token) {
      const busy = await freebusyDay(token, D!)
      const rAvail = await anonCall(URLS.availability, { userId: USER_ID, date: D })
      if (rAvail.status === 200) {
        for (const s of (rAvail.body?.schedule || []) as any[]) {
          if (s.start_time === S && s.end_time === E) continue // slot cheio do C4
          const count = Number(rAvail.body?.slotCounts?.[`${s.start_time}-${s.end_time ?? ''}`] || 0)
          const googleBusy = busy.some((b) => overlapsSlot(b, D!, s.start_time, s.end_time))
          if (count === 0 && !googleBusy) {
            S2 = s.start_time
            E2 = s.end_time
            break
          }
        }
      }
    }
    if (!S2) {
      D2 = addDays(D!, 1)
      const rAvail2 = await anonCall(URLS.availability, { userId: USER_ID, date: D2 })
      if (rAvail2.status === 200) {
        const busy2 = token ? await freebusyDay(token, D2) : []
        for (const s of (rAvail2.body?.schedule || []) as any[]) {
          const count = Number(rAvail2.body?.slotCounts?.[`${s.start_time}-${s.end_time ?? ''}`] || 0)
          const googleBusy = busy2.some((b) => overlapsSlot(b, D2!, s.start_time, s.end_time))
          if (count === 0 && !googleBusy) {
            S2 = s.start_time
            E2 = s.end_time
            break
          }
        }
      }
    }
    if (S2 && E2) {
      await supabaseAdmin.from('rate_limit_events').delete().gte('created_at', startedAt)
      await sleep(PAUSE_MS)
      // "before" medido AGORA (após os cleanups do C4 terem removido o contato do C2)
      const contactsBefore =
        (await contactsHead('phone', QA_PHONE)) + (await contactsHead('phone', `55${QA_PHONE}`))
      const c6 = await anonCall(URLS.booking, {
        userId: USER_ID,
        appointmentDate: D2,
        startTime: S2,
        endTime: E2,
        clientName: 'TESTE QA E2E Livre',
        clientEmail: 'teste.qa.e2e@fourlabnutrition.com.br',
        clientPhone: QA_PHONE,
        specialty: 'TESTE QA E2E',
        lgpdConsent: true,
        createCalendar: false,
        sendConfirmationEmail: false,
      })
      const contactsAfter =
        (await contactsHead('phone', QA_PHONE)) + (await contactsHead('phone', `55${QA_PHONE}`))
      report.scenarios.c6_repeat_contact = {
        status: contactsBefore === 0 && contactsAfter === 1 && c6.status === 200 ? 'ok' : 'failed',
        contactsBefore,
        contactsAfter,
        bookingHttp: c6.status,
        bookingBody: c6.body,
        slot2: { D2, S2, E2 },
      }
      await logStep('C6', { before: contactsBefore, after: contactsAfter, http: c6.status })
    } else {
      report.scenarios.c6_repeat_contact = {
        status: 'skipped',
        reason: 'nenhum segundo slot Google-livre encontrado',
      }
    }

    // ---------- C7: limpeza final + conferência ----------
    const fin = await cleanupAll(startedAt)
    report.cleanup.final = { googleEventsDeleted: fin.deletedGoogleEvents, errors: fin.errors }
    report.counts.after = {
      appointmentsQa: await headAppointments(QA_NAME_LIKE),
      appointmentsQaBroader: await headAppointments('%TESTE QA%'),
      contactsQaByName: await contactsHead('name', 'TESTE QA E2E Livre'),
      contactsQaByPhone: await contactsHead('phone', QA_PHONE),
      contactsQaByPhone55: await contactsHead('phone', `55${QA_PHONE}`),
      rateLimitEventsRun: (
        await supabaseAdmin
          .from('rate_limit_events')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', startedAt)
      ).count,
    }
    report.residue =
      report.counts.after.appointmentsQa +
      report.counts.after.contactsQaByName +
      report.counts.after.contactsQaByPhone +
      report.counts.after.contactsQaByPhone55 +
      report.counts.after.rateLimitEventsRun
    report.warnings.push(
      'interaction_log deste run (type=qa_e2e_booking_v4) é apagado pelo próprio run após montar o relatório (a evidência vai na resposta HTTP).',
    )
  } catch (e: any) {
    report.fatalError = e?.message || String(e)
    // best-effort limpeza mesmo em erro
    try {
      await cleanupAll(startedAt)
    } catch { /* ignora */ }
  }

  // Apaga as linhas de log DESTE run DEPOIS de montar o relatório (evidência na resposta).
  const bodyText = JSON.stringify(report)
  await supabaseAdmin.from('interaction_log').delete().eq('type', LOG_TYPE)
  return new Response(bodyText, {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  // Uso único: cada chamada limpa resíduos anteriores e roda do zero.
  return await main()
})
