import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getGoogleTokens } from '../_shared/integration-secrets.ts'
import { checkRateLimits, getClientIp, bucketFor } from '../_shared/rate-limit.ts'
import {
  validatePublicSlot,
  validateGoogleSlot,
  GoogleBusyError,
  isValidDateFormat,
  isValidTimeFormat,
} from '../_shared/slot-validation.ts'

// create-booking — pós-agendamento 100% no servidor.
// O front (formulário público) chama ESTA função em vez de gravar direto no banco:
// 1) Insere o agendamento via RPC book_appointment (atômica, lock de capacidade — rejeita acima de 10 por slot);
// 2) Cria/encontra o contato SEM duplicar (busca por telefone normalizado, depois e-mail, via service role);
// 3) Cria o evento no Google Calendar com link real do Meet (ou usa o link fixo
//    configurado). SEM integração disponível: falha de forma segura e o e-mail sai SEM link — nunca um link falso;
// 4) Envia o e-mail de confirmação via send-email (Resend, secret RESEND_API_KEY).
//
// SEGURANÇA: o cliente NÃO controla userId, capacidade, status nem exigência de
// consentimento — tudo é decidido AQUI. O userId vem da URL da página pública
// (route param, mesmo valor validado pela get-availability); capacidade e
// consentimento (quando e versão do termo) são constantes do servidor.
// LGPD: o timestamp de consentimento enviado pelo body é IGNORADO — a RPC grava
// now() do banco e a versão do termo vigente.
// ENTRADA: rate limit por IP (geral e por profissional) + validação do slot
// (existe na agenda, não passou, não está bloqueado/ocupado no Google).

const MAX_CAPACITY = 10
const CAPTURE_DATE = '1970-01-01' // LeadCapture: data sentinela fora da checagem de capacidade

// Rate limits (janela fixa persistida na tabela rate_limit_events):
// - agendamento real: 10 por IP a cada 10 min e 30 por IP/dia por profissional
// - captura de lead (sentinela): 5 por IP a cada 10 min e 20 leads/dia por IP
const BOOKING_LIMIT_10MIN = 10
const BOOKING_LIMIT_DAILY = 30
const CAPTURE_LIMIT_10MIN = 5
const CAPTURE_LIMIT_DAILY = 20
const DAY_WINDOW_SECONDS = 24 * 3600

function normalizePhone(raw: string | null | undefined): string {
  return (raw || '').replace(/\D/g, '')
}

function isValidUuid(value: string | null | undefined): boolean {
  return (
    !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
  )
}

// Escapa HTML de valores digitados pelo visitante antes de interpolar no
// template do e-mail — evita injeção de HTML/falsificação de conteúdo.
// SÓ para o corpo HTML do e-mail: WhatsApp e texto simples usam o valor PURO.
function escapeHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Texto puro (WhatsApp): sem nenhuma interpretação de HTML — o valor chega
// exatamente como o usuário digitou ("D'Ávila" continua "D'Ávila",
// "link.com/a?b=1&c=2" continua com "&").
function plainText(value: string | null | undefined): string {
  return String(value ?? '')
}

function rateLimitedResponse(resetSeconds: number): Response {
  return new Response(
    JSON.stringify({
      error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.',
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

async function refreshGoogleToken(
  supabase: any,
  userId: string,
  refreshToken: string,
): Promise<string | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || Deno.env.get('VITE_GOOGLE_CLIENT_ID') || ''
  const clientSecret =
    Deno.env.get('GOOGLE_CLIENT_SECRET') || Deno.env.get('VITE_GOOGLE_CLIENT_SECRET') || ''
  if (!refreshToken || !clientId || !clientSecret) return null

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data.access_token) return null

  await supabase
    .from('integration_secrets')
    .update({
      google_access_token: data.access_token,
      google_token_expires_at: new Date(
        Date.now() + (Number(data.expires_in) || 3600) * 1000,
      ).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  return data.access_token as string
}

async function createCalendarEvent(
  supabase: any,
  appointment: any,
  fixedMeetLink: string | null,
): Promise<{ eventId: string | null; meetLink: string | null; error: string | null }> {
  const googleTokens = await getGoogleTokens(supabase, appointment.user_id)
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') || Deno.env.get('VITE_GOOGLE_CLIENT_ID') || ''
  const clientSecret =
    Deno.env.get('GOOGLE_CLIENT_SECRET') || Deno.env.get('VITE_GOOGLE_CLIENT_SECRET') || ''

  let token = googleTokens.accessToken

  if (!token || !clientId || !clientSecret) {
    // Sem integração Google disponível: falha segura — sem link falso.
    if (fixedMeetLink) return { eventId: null, meetLink: fixedMeetLink, error: null }
    return {
      eventId: null,
      meetLink: null,
      error: 'Integração Google Calendar não configurada para este profissional.',
    }
  }

  const payload: any = {
    summary: `Reunião: ${appointment.client_name}`,
    description: `Agendamento confirmado.\n\nPaciente: ${appointment.client_name}\nEspecialidade: ${appointment.specialty || 'Não informada'}\nEndereço da Clínica: ${appointment.clinic_address || 'Não informado'}`,
    start: {
      dateTime: `${appointment.appointment_date}T${appointment.start_time}:00-03:00`,
      timeZone: 'America/Sao_Paulo',
    },
    end: {
      dateTime: `${appointment.appointment_date}T${appointment.end_time}:00-03:00`,
      timeZone: 'America/Sao_Paulo',
    },
    conferenceData: {
      createRequest: {
        requestId: `meet-${appointment.id}-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  }
  if (fixedMeetLink) {
    payload.location = fixedMeetLink
    delete payload.conferenceData
  }

  let response = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )

  if (response.status === 401) {
    token =
      (await refreshGoogleToken(supabase, appointment.user_id, googleTokens.refreshToken)) || ''
    if (token) {
      response = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
    }
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    console.error('[create-booking] Google Calendar error:', errorText)
    return {
      eventId: null,
      meetLink: null,
      error: `Falha ao criar evento no Google Calendar (${response.status}).`,
    }
  }

  let data = await response.json()
  // Aguardar o Meet link ficar pronto (createRequest pode vir "pending")
  let attempts = 0
  while (data.conferenceData?.createRequest?.status?.statusCode === 'pending' && attempts < 3) {
    await new Promise((r) => setTimeout(r, 1000))
    const getRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${data.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (getRes.ok) data = await getRes.json()
    attempts++
  }

  const meetLink =
    data.hangoutLink ||
    data.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri ||
    null

  return { eventId: data.id || null, meetLink, error: null }
}

async function upsertContact(supabase: any, a: any): Promise<string | null> {
  const phone = normalizePhone(a.client_phone)
  const email = (a.client_email || '').trim().toLowerCase()

  // 1) Match por telefone normalizado
  if (phone) {
    const { data: byPhone } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', a.user_id)
      .eq('phone', phone)
      .limit(1)
    if (byPhone && byPhone.length > 0) {
      await supabase
        .from('contacts')
        .update({
          name: a.client_name,
          email: a.client_email || undefined,
          document: a.client_document || undefined,
          address: a.clinic_address || undefined,
          cep: a.clinic_cep || undefined,
          number: a.clinic_number || undefined,
          neighborhood: a.clinic_neighborhood || undefined,
          complement: a.clinic_complement || undefined,
          city: a.clinic_city || undefined,
          state: a.clinic_state || undefined,
          specialty: a.specialty || undefined,
          registration_number: a.professional_id || undefined,
          instagram: a.instagram || undefined,
          patients_per_month: a.patients_per_month || undefined,
          lgpd_consent_at: a.lgpd_consent_at || undefined,
          lgpd_consent_term_version: a.lgpd_consent_term_version || undefined,
        })
        .eq('id', byPhone[0].id)
      return byPhone[0].id
    }
  }

  // 2) Match por e-mail
  if (email) {
    const { data: byEmail } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', a.user_id)
      .ilike('email', email)
      .limit(1)
    if (byEmail && byEmail.length > 0) {
      await supabase
        .from('contacts')
        .update({
          name: a.client_name,
          document: a.client_document || undefined,
          address: a.clinic_address || undefined,
          cep: a.clinic_cep || undefined,
          number: a.clinic_number || undefined,
          neighborhood: a.clinic_neighborhood || undefined,
          complement: a.clinic_complement || undefined,
          city: a.clinic_city || undefined,
          state: a.clinic_state || undefined,
          specialty: a.specialty || undefined,
          registration_number: a.professional_id || undefined,
          instagram: a.instagram || undefined,
          patients_per_month: a.patients_per_month || undefined,
          lgpd_consent_at: a.lgpd_consent_at || undefined,
          lgpd_consent_term_version: a.lgpd_consent_term_version || undefined,
          ...(phone ? { phone } : {}),
        })
        .eq('id', byEmail[0].id)
      return byEmail[0].id
    }
  }

  // 3) Criar novo contato
  const { data: created, error } = await supabase
    .from('contacts')
    .insert({
      user_id: a.user_id,
      name: a.client_name,
      phone: phone || null,
      email: a.client_email || null,
      document: a.client_document || null,
      address: a.clinic_address || null,
      cep: a.clinic_cep || null,
      number: a.clinic_number || null,
      neighborhood: a.clinic_neighborhood || null,
      complement: a.clinic_complement || null,
      city: a.clinic_city || null,
      state: a.clinic_state || null,
      specialty: a.specialty || null,
      registration_number: a.professional_id || null,
      instagram: a.instagram || null,
      patients_per_month: a.patients_per_month || null,
      lgpd_consent_at: a.lgpd_consent_at || null,
      lgpd_consent_term_version: a.lgpd_consent_term_version || null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[create-booking] Erro ao criar contato:', error.message)
    return null
  }
  return created?.id || null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const {
      userId,
      appointmentDate,
      startTime,
      clientName,
      clientEmail,
      clientPhone,
      clientDocument,
      specialty,
      professionalId,
      clinicCep,
      clinicAddress,
      clinicNumber,
      clinicNeighborhood,
      clinicComplement,
      clinicCity,
      clinicState,
      instagram,
      patientsPerMonth,
      // lgpdConsentAt do body é lido só para COMPATIBILIDADE de contrato — o
      // valor gravado é sempre now() do SERVIDOR (RPC book_appointment).
      // LeadCapture (só captura de contato) não cria evento nem envia e-mail.
      // São flags de COMPORTAMENTO do fluxo, não de permissão — nada aqui
      // afeta capacidade, consentimento, status ou de quem é o agendamento.
      createCalendar = true,
      sendConfirmationEmail = true,
      endTime: endTimeRaw,
    } = body || {}
    const endTime = isValidTimeFormat(endTimeRaw) ? endTimeRaw : ''

    // userId NUNCA vem "de confiança" do body de dados: o chamador público é a
    // página /agendar/:userId e o userId do route param é a origem válida.
    if (!userId || !isValidUuid(userId) || !appointmentDate || !startTime) {
      throw new Error(
        'Campos obrigatórios ausentes ou inválidos: userId, appointmentDate e startTime.',
      )
    }
    if (!isValidDateFormat(appointmentDate) || !isValidTimeFormat(startTime)) {
      throw new Error('Data ou horário em formato inválido.')
    }

    // --- 0) Rate limit por IP (antes de qualquer consulta ao banco) ----------
    // RPC ATÔMICA: cada janela é incrementada e contada numa ÚNICA viagem ao
    // banco (antes: um INSERT + um SELECT por janela, em chamadas separadas).
    const clientIp = getClientIp(req)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    )

    const isCaptureLead = String(appointmentDate) === CAPTURE_DATE
    // Limite específico do caminho de captura de lead: a data sentinela pula a
    // capacidade, então o freio aqui é a taxa de leads por IP (evita encher a
    // tabela de leads batendo no atalho da sentinela).
    const rules = [
      {
        bucket: bucketFor('booking', clientIp),
        max: isCaptureLead ? CAPTURE_LIMIT_10MIN : BOOKING_LIMIT_10MIN,
        windowSeconds: 600,
      },
      ...(isCaptureLead
        ? [
            {
              bucket: bucketFor('capture-daily', clientIp),
              max: CAPTURE_LIMIT_DAILY,
              windowSeconds: DAY_WINDOW_SECONDS,
            },
          ]
        : []),
    ]
    const [general, captureDaily] = await checkRateLimits(supabase, rules)
    if (!general.ok) return rateLimitedResponse(general.resetSeconds)
    if (captureDaily && !captureDaily.ok) return rateLimitedResponse(captureDaily.resetSeconds)

    // --- 1) userId existe (servidor resolve quem é o profissional) -----------
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Profissional não encontrado.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Limite diário de agendamentos reais por IP × profissional (só depois de
    // confirmar que o profissional existe — userId é validado acima).
    if (!isCaptureLead) {
      const [perUser] = await checkRateLimits(supabase, [
        {
          bucket: bucketFor('booking-user-daily', clientIp, userId),
          max: BOOKING_LIMIT_DAILY,
          windowSeconds: DAY_WINDOW_SECONDS,
        },
      ])
      if (!perUser.ok) return rateLimitedResponse(perUser.resetSeconds)
    }

    // --- 2) LGPD: consentimento é SEMPRE exigido pelo servidor. O front manda
    // APENAS a flag booleana (aceitou/não) — o QUANDO e a VERSÃO do termo são
    // fatos do SERVIDOR (RPC grava now() e 'v1'; timestamp do body é ignorado).
    const consentGiven =
      body?.lgpdConsent === true ||
      body?.lgpdConsentAccepted === true ||
      // compatibilidade: versões antigas do front mandavam um timestamp
      (typeof body?.lgpdConsentAt === 'string' && body.lgpdConsentAt.trim() !== '')
    if (!consentGiven) {
      return new Response(
        JSON.stringify({ error: 'Consentimento LGPD obrigatório para concluir o agendamento.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // --- 2b) Validação do slot: existe na agenda (início E fim exatos), não
    // está no passado (data < hoje BRT também é recusada), não está bloqueado
    // (bloqueio de dia inteiro recusa o dia) e o dia está LIVRE no Google
    // Calendar (freeBusy fail-closed — validateGoogleSlot). A captura de lead
    // (data sentinela) não é um slot real — pula esta validação.
    if (!isCaptureLead) {
      const slotCheck = await validatePublicSlot({
        supabase,
        userId,
        date: appointmentDate,
        startTime,
        endTime: endTime || startTime,
      })
      if (!slotCheck.ok) {
        return new Response(JSON.stringify({ error: slotCheck.error }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Checagem do Google restaurada (server-side): reserva é RECUSADA se
      // houver evento no Google Calendar — mesmo com chamada direta ao
      // create-booking. Ocupado no Google é regra de negócio (422); falha de
      // infraestrutura é erro do servidor (503).
      // validateGoogleSlot LANÇA GoogleBusyError quando há sobreposição com
      // evento no Google Calendar (422, regra de negócio — recusa ANTES de
      // gravar) e devolve ok:false em falha de infraestrutura (503 fail-
      // closed). O GoogleBusyError é tratado no try/catch interno (422). Qualquer
      // outro erro que escapar cai no catch externo, que devolve 400 com a
      // mensagem do erro.
      let googleCheck: Awaited<ReturnType<typeof validateGoogleSlot>>
      try {
        googleCheck = await validateGoogleSlot(
          supabase,
          userId,
          appointmentDate,
          startTime,
          endTime || startTime,
        )
      } catch (e: any) {
        if (e instanceof GoogleBusyError) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 422,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        throw e
      }
      if (googleCheck && !googleCheck.ok) {
        return new Response(JSON.stringify({ error: googleCheck.error }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // --- 3) Capacidade: constante do SERVIDOR. LeadCapture grava em data
    // sentinela (1970-01-01), fora da checagem de capacidade por slot.
    const pMaxCapacity = isCaptureLead ? 2147483647 : MAX_CAPACITY

    // --- 4) Inserção atômica (RPC com trava de CPF + lock de capacidade) ------
    // book_appointment_guarded = MESMOS parâmetros do book_appointment, com a
    // guarda de CPF ANTES de inserir (visita em aberto → remarca a existente;
    // <30 dias → bloqueado). A captura de lead (1970-01-01) passa direto pela
    // guarda, fora da trava de capacidade — fluxo próprio, como era antes.
    const { data: appointment, error: rpcError } = await supabase.rpc('book_appointment_guarded', {
      p_user_id: userId,
      p_appointment_date: appointmentDate,
      p_start_time: startTime,
      p_end_time: endTime || startTime,
      // Captura de contato (LeadCapture, data sentinela) continua 'lead';
      // agendamento real pela página pública é confirmado => 'scheduled'.
      p_status: isCaptureLead ? 'lead' : 'scheduled',
      p_client_name: clientName || null,
      p_client_email: clientEmail || null,
      p_client_phone: clientPhone || null,
      p_client_document: clientDocument || null,
      p_specialty: specialty || null,
      p_professional_id: professionalId || null,
      p_clinic_cep: clinicCep || null,
      p_clinic_address: clinicAddress || null,
      p_clinic_number: clinicNumber || null,
      p_clinic_neighborhood: clinicNeighborhood || null,
      p_clinic_complement: clinicComplement || null,
      p_clinic_city: clinicCity || null,
      p_clinic_state: clinicState || null,
      p_instagram: instagram || null,
      p_patients_per_month: patientsPerMonth || null,
      p_max_capacity: pMaxCapacity,
      // p_lgpd_consent_at do body NÃO é repassado: a RPC grava now() do banco.
      p_lgpd_consent_at: null,
    })

    if (rpcError || !appointment) {
      const msg = rpcError?.message || 'Falha ao inserir agendamento.'
      const isCapacity = msg.includes('CAPACITY_EXCEEDED')
      console.error('[create-booking] RPC error:', msg)

      // Trava de CPF (leia-me "Remarcar visita por CPF"): o visitante não cria
      // linha nova — é mandado para a página de remarcação do representante,
      // que preserva kit/rastreio/cupons da visita já existente.
      const hasOpenVisit = msg.includes('CPF_HAS_OPEN_VISIT')
      const blocked30d = msg.startsWith('CPF_BLOCKED_30D')

      if (hasOpenVisit) {
        return new Response(
          JSON.stringify({
            error:
              'Este CPF já possui uma visita em aberto. Remarque a visita existente em vez de criar uma nova.',
            code: 'cpf_open_visit',
            rescheduleUrl: `/remarcar/${userId}`,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      if (blocked30d) {
        // Formato do erro na RPC: 'CPF_BLOCKED_30D:DD/MM/YYYY'
        const releaseDate = msg.split(':')[1]?.trim() || null
        return new Response(
          JSON.stringify({
            error: releaseDate
              ? `Este CPF visitou há menos de 30 dias. Uma nova visita pode ser agendada a partir de ${releaseDate}.`
              : 'Este CPF visitou há menos de 30 dias. Uma nova visita ainda não pode ser agendada.',
            code: 'cpf_blocked_30d',
            releaseDate,
            rescheduleUrl: `/remarcar/${userId}`,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      return new Response(
        JSON.stringify({
          error: isCapacity
            ? 'Este horário acabou de esgotar. Escolha outro, por favor.'
            : 'Não foi possível concluir o agendamento. Tente novamente.',
        }),
        {
          status: isCapacity ? 409 : 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // --- 5) Contato sem duplicar ---------------------------------------------
    let contactId: string | null = null
    try {
      contactId = await upsertContact(supabase, appointment)
    } catch (e: any) {
      console.error('[create-booking] upsertContact falhou:', e?.message || e)
    }

    // --- 6) Google Calendar / Meet (real, sem mock) ---------------------------
    let calendarWarning: string | null = null
    let eventId: string | null = null
    let meetLink: string | null = null

    if (createCalendar) {
      const { data: integration } = await supabase
        .from('user_integrations')
        .select('fixed_meet_link')
        .eq('user_id', userId)
        .maybeSingle()
      const fixedMeetLink = integration?.fixed_meet_link || null
      meetLink = fixedMeetLink

      try {
        const cal = await createCalendarEvent(supabase, appointment, fixedMeetLink)
        eventId = cal.eventId
        meetLink = cal.meetLink || fixedMeetLink
        calendarWarning = cal.error
      } catch (e: any) {
        calendarWarning = e?.message || 'Falha ao sincronizar com Google Calendar.'
        console.error('[create-booking] createCalendarEvent falhou:', calendarWarning)
      }
    }

    if (eventId || meetLink) {
      const { error: updErr } = await supabase
        .from('appointments')
        .update({ google_event_id: eventId, google_meet_link: meetLink })
        .eq('id', appointment.id)
      if (updErr) console.error('[create-booking] update meet_link:', updErr.message)
    }

    // --- 7) E-mail de confirmação (Resend, server-side) -----------------------
    // Dois renderings a partir dos dados PUROS: texto simples (WhatsApp, se um
    // dia este canal for usado aqui) e HTML escapado — nunca reutilizar a
    // string escapada do e-mail em mensagem de WhatsApp.
    let emailSent = false
    if (clientEmail && sendConfirmationEmail) {
      try {
        const formattedDate = String(appointmentDate).split('-').reverse().join('/')
        const safeClientName = escapeHtml(clientName)
        const safeMeetLink = escapeHtml(meetLink)
        const meetHtml = meetLink
          ? `<div style="margin-top: 24px; padding: 16px; background-color: #f8f9fa; border-radius: 8px; text-align: center;"><p style="margin: 0; font-size: 16px; font-weight: bold; color: #333;">Link da reunião no Google Meet:</p><a href="${safeMeetLink}" style="display: inline-block; margin-top: 8px; font-size: 16px; color: #e10050; word-break: break-all;">${safeMeetLink}</a></div>`
          : ''

        const emailRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            to: clientEmail,
            subject: 'Confirmação de Agendamento - FourLab Nutrition',
            html: `<div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;"><div style="background-color: #e10050; padding: 24px; text-align: center;"><h1 style="color: white; margin: 0; font-size: 20px;">Agendamento Confirmado! 🎉</h1></div><div style="padding: 32px; background-color: #ffffff;"><p style="font-size: 16px; line-height: 1.5;">Olá <strong>${safeClientName}</strong>,</p><p style="font-size: 16px; line-height: 1.5;">Seu agendamento foi realizado com sucesso para o dia <strong>${formattedDate}</strong> às <strong>${startTime}</strong>.</p><p style="font-size: 16px; line-height: 1.5;">Em breve nossa equipe entrará em contato com você para alinhar os detalhes da visita ou da reunião virtual.</p>${meetHtml}<br/><p style="font-size: 14px; color: #666;">Atenciosamente,<br/>Equipe FourLab Nutrition</p></div></div>`,
            senderName: 'FourLab Nutrition',
          }),
        })
        emailSent = emailRes.ok
        if (!emailSent) {
          const t = await emailRes.text().catch(() => '')
          console.error('[create-booking] send-email status', emailRes.status, t)
        }
      } catch (e: any) {
        console.error('[create-booking] e-mail de confirmação falhou:', e?.message || e)
      }
    }

    // WhatsApp (texto PURO, sem escape) — quando configurado para o
    // profissional.Nunca recebe a string escapada do e-mail.
    if (sendConfirmationEmail && clientPhone) {
      try {
        const { data: waIntegration } = await supabase
          .from('user_integrations')
          .select('whatsapp_connected')
          .eq('user_id', userId)
          .maybeSingle()
        if (waIntegration?.whatsapp_connected) {
          const plainName = plainText(clientName)
          const plainMeetLink = plainText(meetLink)
          const waText = `Olá, ${plainName}! 👋\n\nSeu agendamento na FourLab Nutrition foi confirmado para o dia ${formattedDate} às ${startTime}.${plainMeetLink ? `\n\n🔗 Link da reunião: ${plainMeetLink}` : ''}\n\nAté logo! 😊\n*Equipe FourLab*`
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              to: clientPhone,
              text: waText,
              userId,
            }),
          })
        }
      } catch (e: any) {
        console.error('[create-booking] WhatsApp de confirmação falhou:', e?.message || e)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        appointment,
        contactId,
        meetLink,
        calendarWarning,
        emailSent,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('[create-booking] Error:', error?.message || error)
    return new Response(JSON.stringify({ error: error?.message || 'Erro inesperado.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
