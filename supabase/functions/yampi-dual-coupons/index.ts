import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { getOfficialAccessToken, getSecret } from '../_shared/integration-secrets.ts'
import { normalizePhoneVariants } from '../_shared/whatsapp-security.ts'

// =========================================================================
// CONSTANTES PARAMETRIZADAS NO TOPO DO CÓDIGO
// Fáceis de ajustar conforme solicitação do usuário:
// - Cupom de Paciente: 10%
// - Cupom Pessoal Nutricionista: 30%
// - Quantidade fixa: 50 unidades
// =========================================================================
export const PATIENT_COUPON_DISCOUNT_PERCENT = 10
export const PERSONAL_COUPON_DISCOUNT_PERCENT = 30
export const FIXED_COUPON_QUANTITY = 50
export const FIXED_DISCOUNT_TYPE = 'p' // porcentagem

// Link oficial da pesquisa de feedback no Google Forms (rápida e fácil)
export const FEEDBACK_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScTqmS-MDABMs7Z6l4gQOI3WgVRc8DRmqJ_xnLp5W_rdEK2DA/viewform'

interface DualCouponsPayload {
  appointmentId?: string
  contactId?: string
  userId?: string
  force?: boolean // se true, ignora cupons existentes e reemite
  customPatientCoupon?: string // Código customizado de cupom do paciente (opcional, sobrescreve derivação do nome)
  customPersonalCoupon?: string // Código customizado de cupom pessoal da nutri (opcional, sobrescreve derivação do nome)
}

/**
 * Remove acentos, prefixos comuns (Dra, Dr, Nutri) se desejar ou mantém legível,
 * e gera um identificador seguro com apenas [A-Z0-9].
 */
function cleanPrescriberName(rawName: string): string {
  const normalized = rawName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .trim()

  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'NUTRI'

  // Se tiver 1 palavra (ex: "JULIA"), usa JULIA
  // Se tiver 2 palavras (ex: "JULIA MENEZES"), usa JULIAMENEZES
  // Se tiver várias (ex: "DRA JULIA MENEZES SILVA"), pega até 3 primeiras sem títulos
  const filtered = words.filter((w) => !['DRA', 'DR', 'NUTRI', 'NUTRICIONISTA'].includes(w))
  const targetWords = filtered.length > 0 ? filtered : words

  // Pega o primeiro e último nome se tiver mais de 2, ou junta os 2 primeiros
  if (targetWords.length === 1) {
    return targetWords[0].substring(0, 15)
  }
  if (targetWords.length === 2) {
    return `${targetWords[0]}${targetWords[1]}`.substring(0, 20)
  }
  return `${targetWords[0]}${targetWords[1]}`.substring(0, 20)
}

/**
 * Monta o texto cordial e formatado para WhatsApp com os 2 cupons
 * e o link da pesquisa de feedback (rápida e fácil).
 */
function buildWhatsAppMessage(params: {
  prescriberName: string
  patientCoupon: string
  personalCoupon: string
  patientDiscount: number
  personalDiscount: number
}): string {
  const firstName = params.prescriberName.split(' ')[0] || 'Doutor(a)'

  return (
    `Olá, ${firstName}! 😊 Sua visita foi concluída e seus cupons já estão prontos! 🎉\n\n` +
    `🎟️ *Cupom para seus pacientes (${params.patientDiscount}%)*: ${params.patientCoupon}\n` +
    `Divulgue aos seus pacientes no consultório e nas redes!\n\n` +
    `🎟️ *Cupom pessoal (${params.personalDiscount}%)*: ${params.personalCoupon}\n` +
    `Para o seu uso pessoal nas compras na loja FourLab.\n\n` +
    `📝 E ficou faltando só uma coisinha: reserve *1 minutinho* para responder nossa pesquisa — *é rápida e fácil*! ` +
    `Queremos entender nossos pontos fortes, o que podemos desenvolver e como fortalecer nosso relacionamento, ` +
    `além de saber quais produtos você mais prescreve:\n` +
    `${FEEDBACK_FORM_URL}\n\n` +
    `Sua opinião vale muito para nós! 💙 Equipe FourLab`
  )
}

/**
 * Monta o HTML para envio por e-mail caso não haja WhatsApp válido
 */
function buildEmailHtml(params: {
  prescriberName: string
  patientCoupon: string
  personalCoupon: string
  patientDiscount: number
  personalDiscount: number
}): string {
  const firstName = params.prescriberName.split(' ')[0] || 'Doutor(a)'

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #0f172a; font-size: 24px; margin: 0;">FourLab Nutrition</h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Sua visita foi concluída e seus cupons já estão prontos! 🎉</p>
      </div>

      <p style="font-size: 16px; line-height: 1.6;">Olá, <strong>${firstName}</strong>! 😊</p>
      <p style="font-size: 15px; line-height: 1.6; color: #475569;">
        Sua visita foi concluída com sucesso e seus cupons já estão prontos para uso:
      </p>

      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 6px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #166534; font-weight: bold;">
          🎟️ Cupom para seus pacientes (${params.patientDiscount}%)
        </p>
        <div style="font-size: 22px; font-weight: bold; letter-spacing: 1px; color: #15803d; font-family: monospace;">
          ${params.patientCoupon}
        </div>
        <p style="margin: 6px 0 0 0; font-size: 13px; color: #166534;">
          Divulgue aos seus pacientes no consultório e nas redes!
        </p>
      </div>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 6px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a; font-weight: bold;">
          🎟️ Cupom pessoal (${params.personalDiscount}%)
        </p>
        <div style="font-size: 22px; font-weight: bold; letter-spacing: 1px; color: #0f172a; font-family: monospace;">
          ${params.personalCoupon}
        </div>
        <p style="margin: 6px 0 0 0; font-size: 13px; color: #64748b;">
          Para o seu uso pessoal nas compras na loja FourLab.
        </p>
      </div>

      <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #1e40af; font-weight: bold;">
          📝 E ficou faltando só uma coisinha: reserve 1 minutinho para responder nossa pesquisa — é rápida e fácil!
        </p>
        <p style="margin: 0 0 12px 0; font-size: 13px; line-height: 1.5; color: #1e3a8a;">
          Queremos entender nossos pontos fortes, o que podemos desenvolver e como fortalecer nosso relacionamento, além de saber quais produtos você mais prescreve:
        </p>
        <p style="margin: 0;">
          <a href="${FEEDBACK_FORM_URL}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 10px 18px; border-radius: 6px;">
            Responder Pesquisa de Feedback
          </a>
        </p>
      </div>

      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-top: 24px;">
        Sua opinião vale muito para nós! 💙<br/>
        <strong>Equipe FourLab</strong>
      </p>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
        FourLab Nutrition • Parcerias & Visitação Científica
      </p>
    </div>
  `
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Healthcheck via GET
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({
        status: 'active',
        service: 'yampi-dual-coupons',
        description:
          'Orquestrador de cupons duplos (Paciente 10% e Pessoal 30%) com envio automático via WhatsApp Oficial / Email. Cupons multiuso com limite total de 50 utilizações.',
        fixedDiscounts: {
          patient: PATIENT_COUPON_DISCOUNT_PERCENT,
          personal: PERSONAL_COUPON_DISCOUNT_PERCENT,
          quantity: FIXED_COUPON_QUANTITY,
          discount_type: FIXED_DISCOUNT_TYPE,
          once_per_customer: false,
          single_use: false,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Configuração do Supabase ausente no ambiente.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const authHeader = req.headers.get('Authorization') || ''
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    })

    const body: DualCouponsPayload = await req.json().catch(() => ({}))

    // Identificar usuário autenticado
    let effectiveUserId = body.userId
    if (!effectiveUserId && authHeader) {
      const {
        data: { user },
      } = await supabaseClient.auth.getUser()
      if (user) effectiveUserId = user.id
    }

    // Fallback: se não identificado, buscar o usuário com integração Yampi configurada ou qualquer integração
    if (!effectiveUserId) {
      const { data: firstYampi } = await supabaseAdmin
        .from('user_integrations')
        .select('user_id')
        .eq('yampi_configured', true)
        .not('yampi_alias', 'is', null)
        .limit(1)
        .maybeSingle()
      if (firstYampi?.user_id) {
        effectiveUserId = firstYampi.user_id
      }
    }

    if (!effectiveUserId) {
      const { data: firstAlias } = await supabaseAdmin
        .from('user_integrations')
        .select('user_id')
        .not('yampi_alias', 'is', null)
        .limit(1)
        .maybeSingle()
      if (firstAlias?.user_id) {
        effectiveUserId = firstAlias.user_id
      }
    }

    if (!effectiveUserId) {
      const { data: firstIntegration } = await supabaseAdmin
        .from('user_integrations')
        .select('user_id')
        .limit(1)
        .maybeSingle()
      if (firstIntegration?.user_id) {
        effectiveUserId = firstIntegration.user_id
      }
    }

    if (!effectiveUserId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Identificador do usuário não autenticado ou não encontrado.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 1. Obter dados do Agendamento / Contato
    let appointment: any = null
    let contact: any = null

    if (body.appointmentId) {
      const { data: aptData } = await supabaseAdmin
        .from('appointments')
        .select('*')
        .eq('id', body.appointmentId)
        .maybeSingle()
      appointment = aptData
    }

    if (body.contactId) {
      const { data: cntData } = await supabaseAdmin
        .from('contacts')
        .select('*')
        .eq('id', body.contactId)
        .maybeSingle()
      contact = cntData
    }

    // Se temos agendamento mas não temos contato direto, tentar localizar o contato por email ou telefone
    if (appointment && !contact) {
      const phones = appointment.client_phone
        ? normalizePhoneVariants(appointment.client_phone)
        : []
      let query = supabaseAdmin.from('contacts').select('*')
      if (appointment.client_email && phones.length > 0) {
        query = query.or(
          `email.ilike.${appointment.client_email.trim()},phone.in.(${phones.map((p: string) => `"${p}"`).join(',')})`,
        )
      } else if (appointment.client_email) {
        query = query.ilike('email', appointment.client_email.trim())
      } else if (phones.length > 0) {
        query = query.in('phone', phones)
      }

      const { data: matchedContacts } = await query.limit(1)
      if (matchedContacts && matchedContacts.length > 0) {
        contact = matchedContacts[0]
      }
    }

    // Se temos contato mas não recebemos appointmentId, procurar agendamento recente desse contato
    if (contact && !appointment) {
      const phones = contact.phone ? normalizePhoneVariants(contact.phone) : []
      let aptQuery = supabaseAdmin
        .from('appointments')
        .select('*')
        .order('appointment_date', { ascending: false })

      if (contact.email && phones.length > 0) {
        aptQuery = aptQuery.or(
          `client_email.ilike.${contact.email.trim()},client_phone.in.(${phones.map((p: string) => `"${p}"`).join(',')})`,
        )
      } else if (contact.email) {
        aptQuery = aptQuery.ilike('client_email', contact.email.trim())
      } else if (phones.length > 0) {
        aptQuery = aptQuery.in('client_phone', phones)
      }

      const { data: matchedApts } = await aptQuery.limit(1)
      if (matchedApts && matchedApts.length > 0) {
        appointment = matchedApts[0]
      }
    }

    const prescriberName =
      (appointment?.client_name || contact?.name || '').trim() || 'Nutricionista'
    const prescriberEmail = (appointment?.client_email || contact?.email || '').trim()
    const prescriberPhone = (appointment?.client_phone || contact?.phone || '').trim()

    // 2. REGRA DE IDEMPOTÊNCIA / EVITAR DUPLICIDADE:
    // Se a nutricionista já possuir cupons emitidos e não houver flag 'force', retornar cupons existentes
    const existingPatientCoupon = appointment?.patient_coupon || contact?.patient_coupon || null
    const existingPersonalCoupon =
      appointment?.nutritionist_coupon || contact?.nutritionist_coupon || null

    if (existingPatientCoupon && existingPersonalCoupon && !body.force) {
      console.log(
        `[yampi-dual-coupons] Cupons já existem para ${prescriberName}: Paciente=${existingPatientCoupon}, Pessoal=${existingPersonalCoupon}`,
      )
      return new Response(
        JSON.stringify({
          success: true,
          isExisting: true,
          message: 'Cupons já emitidos anteriormente para esta nutricionista.',
          coupons: {
            patient: {
              code: existingPatientCoupon,
              discount: PATIENT_COUPON_DISCOUNT_PERCENT,
              isExisting: true,
            },
            personal: {
              code: existingPersonalCoupon,
              discount: PERSONAL_COUPON_DISCOUNT_PERCENT,
              isExisting: true,
            },
          },
          communication: {
            channel: 'none',
            status: 'already_emitted',
            message: 'Cupons já emitidos anteriormente. Reenvio não disparado.',
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3. Gerar códigos legíveis baseados no nome da nutricionista ou usar códigos customizados fornecidos
    const baseClean = cleanPrescriberName(prescriberName)
    // Padrão solicitado (se não informado manualmente):
    // Paciente: DRAJULIAMENEZES10 (ou NUTRI...10)
    // Pessoal: DRAJULIAMENEZES30 (ou NUTRI...30)
    const cleanCustomCode = (val?: string) => {
      if (!val) return ''
      return val
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '')
        .substring(0, 40)
    }

    const customPatient = cleanCustomCode(body.customPatientCoupon)
    const customPersonal = cleanCustomCode(body.customPersonalCoupon)

    // Se ambos vierem vazios, derivar com baseClean + sufixos 10 e 30
    // Se vierem com o mesmo código por engano do chamador, apenas mantemos se explicitamente fornecidos
    const suggestedPatientCode = customPatient || `${baseClean}10`
    const suggestedPersonalCode = customPersonal || `${baseClean}30`

    console.log(
      `[yampi-dual-coupons] Iniciando criação dos cupons para '${prescriberName}' (Paciente: ${suggestedPatientCode}, Pessoal: ${suggestedPersonalCode})`,
    )

    // 4. Invocar a função oficial existente yampi-create-coupon para cada cupom
    // Cupom de Paciente (10%) - MULTIUSO para múltiplos pacientes usarem até 50 utilizações no total
    const patientReqBody = {
      userId: effectiveUserId,
      code: suggestedPatientCode,
      prescritor: prescriberName,
      name: prescriberName,
      lead_id: contact?.id || undefined,
      appointment_id: appointment?.id || undefined,
      force: Boolean(body.force),
      discount_type: FIXED_DISCOUNT_TYPE,
      type: 'percent',
      value: PATIENT_COUPON_DISCOUNT_PERCENT,
      quantity: FIXED_COUPON_QUANTITY,
      once_per_customer: false,
      single_use: false,
      description: `Cupom Pacientes (10%, 50 un multiuso) - ${prescriberName}`,
    }

    // Cupom Pessoal (30%) - MULTIUSO até 50 utilizações no total
    const personalReqBody = {
      userId: effectiveUserId,
      code: suggestedPersonalCode,
      prescritor: prescriberName,
      name: prescriberName,
      lead_id: contact?.id || undefined,
      // NOTA: Não passar appointment_id no cupom pessoal para evitar que yampi-create-coupon
      // retorne coupon_code já existente do agendamento (que é o cupom do paciente).
      force: Boolean(body.force),
      discount_type: FIXED_DISCOUNT_TYPE,
      type: 'percent',
      value: PERSONAL_COUPON_DISCOUNT_PERCENT,
      quantity: FIXED_COUPON_QUANTITY,
      once_per_customer: false,
      single_use: false,
      description: `Cupom Pessoal Nutricionista (30%, 50 un multiuso) - ${prescriberName}`,
    }

    // Chamar yampi-create-coupon internamente
    const callYampiCreate = async (payload: any) => {
      const targetUrl = `${supabaseUrl}/functions/v1/yampi-create-coupon`
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify(payload),
      })
      const text = await res.text()
      let json: any = null
      try {
        json = JSON.parse(text)
      } catch {
        json = { raw: text }
      }
      return { ok: res.ok, status: res.status, data: json }
    }

    // Executar criação sequencial para garantir que o preflight e exclusão ocorram de forma organizada
    console.log('[yampi-dual-coupons] Criando cupom de Paciente...')
    const patientRes = await callYampiCreate(patientReqBody)
    if (!patientRes.ok || !patientRes.data?.success) {
      const err =
        patientRes.data?.error || `Falha ao criar cupom de paciente (${patientRes.status})`
      console.error('[yampi-dual-coupons] Erro cupom paciente:', err)

      await supabaseAdmin.from('interaction_log').insert({
        user_id: effectiveUserId,
        contact_id: contact?.id || null,
        type: 'yampi_dual_coupons_error',
        details: {
          step: 'patient_coupon_creation',
          prescriber_name: prescriberName,
          error: err,
          appointment_id: appointment?.id || null,
        },
      })

      return new Response(
        JSON.stringify({
          success: false,
          error: `Erro ao criar o cupom de paciente na Yampi: ${err}`,
          details: patientRes.data,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    console.log('[yampi-dual-coupons] Criando cupom Pessoal...')
    const personalRes = await callYampiCreate(personalReqBody)
    if (!personalRes.ok || !personalRes.data?.success) {
      const err = personalRes.data?.error || `Falha ao criar cupom pessoal (${personalRes.status})`
      console.error('[yampi-dual-coupons] Erro cupom pessoal:', err)

      await supabaseAdmin.from('interaction_log').insert({
        user_id: effectiveUserId,
        contact_id: contact?.id || null,
        type: 'yampi_dual_coupons_error',
        details: {
          step: 'personal_coupon_creation',
          prescriber_name: prescriberName,
          error: err,
          created_patient_coupon: patientRes.data?.code,
          appointment_id: appointment?.id || null,
        },
      })

      return new Response(
        JSON.stringify({
          success: false,
          error: `Erro ao criar o cupom pessoal na Yampi: ${err}`,
          patientCouponCreated: patientRes.data?.code,
          details: personalRes.data,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const finalPatientCode = patientRes.data.code
    const finalPatientId = patientRes.data.id
    const finalPersonalCode = personalRes.data.code
    const finalPersonalId = personalRes.data.id

    console.log(
      `[yampi-dual-coupons] Cupons emitidos com sucesso na Yampi! Paciente=${finalPatientCode} (ID ${finalPatientId}), Pessoal=${finalPersonalCode} (ID ${finalPersonalId})`,
    )

    // 5. Persistir no banco de dados: contacts e appointments
    // contacts.nutritionist_coupon = finalPersonalCode (30%)
    // contacts.patient_coupon = finalPatientCode (10%)
    // appointments.nutritionist_coupon = finalPersonalCode
    // appointments.patient_coupon = finalPatientCode
    // appointments.coupon_code = finalPatientCode (código principal de referência)
    // appointments.coupon_verified = true
    if (contact?.id) {
      await supabaseAdmin
        .from('contacts')
        .update({
          nutritionist_coupon: finalPersonalCode,
          patient_coupon: finalPatientCode,
        })
        .eq('id', contact.id)
    }

    if (appointment?.id) {
      await supabaseAdmin
        .from('appointments')
        .update({
          nutritionist_coupon: finalPersonalCode,
          patient_coupon: finalPatientCode,
          coupon_code: finalPatientCode,
          coupon_verified: true,
        })
        .eq('id', appointment.id)
    }

    // Registrar no interaction_log a criação dos dois cupons
    await supabaseAdmin.from('interaction_log').insert({
      user_id: effectiveUserId,
      contact_id: contact?.id || null,
      type: 'yampi_dual_coupons_created',
      details: {
        prescriber_name: prescriberName,
        appointment_id: appointment?.id || null,
        patient_coupon: {
          code: finalPatientCode,
          id: finalPatientId,
          value: PATIENT_COUPON_DISCOUNT_PERCENT,
          quantity: FIXED_COUPON_QUANTITY,
        },
        personal_coupon: {
          code: finalPersonalCode,
          id: finalPersonalId,
          value: PERSONAL_COUPON_DISCOUNT_PERCENT,
          quantity: FIXED_COUPON_QUANTITY,
        },
        created_at: new Date().toISOString(),
      },
    })

    // 6. ENVIO AUTOMÁTICO:
    // Tentativa 1: WhatsApp Oficial (via whatsapp-send)
    // Tentativa 2: Fallback por Email (via send-email) se WhatsApp falhar ou sem telefone válido
    // Tentativa 3: Se nem telefone nem email, registrar no interaction_log
    const waText = buildWhatsAppMessage({
      prescriberName,
      patientCoupon: finalPatientCode,
      personalCoupon: finalPersonalCode,
      patientDiscount: PATIENT_COUPON_DISCOUNT_PERCENT,
      personalDiscount: PERSONAL_COUPON_DISCOUNT_PERCENT,
    })

    let communicationResult: {
      channel: 'whatsapp' | 'email' | 'none'
      status: 'sent' | 'failed' | 'not_available'
      recipient?: string
      messageId?: string
      error?: string
    } = {
      channel: 'none',
      status: 'not_available',
    }

    const cleanPhoneDigits = prescriberPhone.replace(/\D/g, '')
    const hasValidPhone = cleanPhoneDigits.length >= 10

    if (hasValidPhone) {
      console.log(`[yampi-dual-coupons] Tentando envio de WhatsApp para ${prescriberPhone}...`)
      try {
        const waRes = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            userId: effectiveUserId,
            to: prescriberPhone,
            text: waText,
            contactId: contact?.id || undefined,
          }),
        })

        const waData = await waRes.json().catch(() => ({}))

        if (waRes.ok && (waData.success || waData.wamid || waData.messageId)) {
          console.log('[yampi-dual-coupons] WhatsApp enviado com sucesso!', waData)
          communicationResult = {
            channel: 'whatsapp',
            status: 'sent',
            recipient: prescriberPhone,
            messageId: waData.wamid || waData.messageId,
          }

          await supabaseAdmin.from('interaction_log').insert({
            user_id: effectiveUserId,
            contact_id: contact?.id || null,
            type: 'dual_coupons_whatsapp_sent',
            details: {
              to: prescriberPhone,
              provider: waData.provider || 'official',
              messageId: waData.wamid || waData.messageId,
              patient_coupon: finalPatientCode,
              personal_coupon: finalPersonalCode,
            },
          })
        } else {
          console.warn('[yampi-dual-coupons] WhatsApp falhou:', waData)
          throw new Error(waData.error || `WhatsApp HTTP ${waRes.status}`)
        }
      } catch (waErr: any) {
        console.warn(
          `[yampi-dual-coupons] Falha no WhatsApp (${waErr.message}). Tentando fallback por e-mail...`,
        )
        await supabaseAdmin.from('interaction_log').insert({
          user_id: effectiveUserId,
          contact_id: contact?.id || null,
          type: 'dual_coupons_whatsapp_failed',
          details: {
            phone: prescriberPhone,
            error: waErr.message,
            fallback_to_email: true,
          },
        })

        // Tentar fallback por e-mail imediatamente
        if (prescriberEmail && prescriberEmail.includes('@')) {
          try {
            const emailHtml = buildEmailHtml({
              prescriberName,
              patientCoupon: finalPatientCode,
              personalCoupon: finalPersonalCode,
              patientDiscount: PATIENT_COUPON_DISCOUNT_PERCENT,
              personalDiscount: PERSONAL_COUPON_DISCOUNT_PERCENT,
            })

            const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                userId: effectiveUserId,
                to: prescriberEmail,
                subject: 'Seus Cupons de Parceria FourLab Nutrition 🌿',
                html: emailHtml,
                text: waText,
                senderName: 'FourLab Nutrition',
              }),
            })

            const emailData = await emailRes.json().catch(() => ({}))
            if (emailRes.ok && emailData.success) {
              console.log('[yampi-dual-coupons] Email fallback enviado com sucesso!')
              communicationResult = {
                channel: 'email',
                status: 'sent',
                recipient: prescriberEmail,
                messageId: emailData.messageId,
              }

              await supabaseAdmin.from('interaction_log').insert({
                user_id: effectiveUserId,
                contact_id: contact?.id || null,
                type: 'dual_coupons_email_fallback_sent',
                details: {
                  to: prescriberEmail,
                  messageId: emailData.messageId,
                  whatsapp_error: waErr.message,
                },
              })
            } else {
              communicationResult = {
                channel: 'email',
                status: 'failed',
                recipient: prescriberEmail,
                error: emailData.error || `Email HTTP ${emailRes.status}`,
              }
            }
          } catch (emailErr: any) {
            communicationResult = {
              channel: 'email',
              status: 'failed',
              recipient: prescriberEmail,
              error: emailErr.message,
            }
          }
        } else {
          communicationResult = {
            channel: 'whatsapp',
            status: 'failed',
            recipient: prescriberPhone,
            error: waErr.message,
          }
        }
      }
    } else if (prescriberEmail && prescriberEmail.includes('@')) {
      // Sem telefone válido, envia direto por email
      console.log(
        `[yampi-dual-coupons] Sem telefone válido (${prescriberPhone}). Enviando direto por e-mail para ${prescriberEmail}...`,
      )
      try {
        const emailHtml = buildEmailHtml({
          prescriberName,
          patientCoupon: finalPatientCode,
          personalCoupon: finalPersonalCode,
          patientDiscount: PATIENT_COUPON_DISCOUNT_PERCENT,
          personalDiscount: PERSONAL_COUPON_DISCOUNT_PERCENT,
        })

        const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            userId: effectiveUserId,
            to: prescriberEmail,
            subject: 'Seus Cupons de Parceria FourLab Nutrition 🌿',
            html: emailHtml,
            text: waText,
            senderName: 'FourLab Nutrition',
          }),
        })

        const emailData = await emailRes.json().catch(() => ({}))
        if (emailRes.ok && emailData.success) {
          communicationResult = {
            channel: 'email',
            status: 'sent',
            recipient: prescriberEmail,
            messageId: emailData.messageId,
          }

          await supabaseAdmin.from('interaction_log').insert({
            user_id: effectiveUserId,
            contact_id: contact?.id || null,
            type: 'dual_coupons_email_sent',
            details: {
              to: prescriberEmail,
              messageId: emailData.messageId,
              reason: 'phone_not_available',
            },
          })
        } else {
          communicationResult = {
            channel: 'email',
            status: 'failed',
            recipient: prescriberEmail,
            error: emailData.error || `Email HTTP ${emailRes.status}`,
          }
        }
      } catch (emailErr: any) {
        communicationResult = {
          channel: 'email',
          status: 'failed',
          recipient: prescriberEmail,
          error: emailErr.message,
        }
      }
    } else {
      // Nem telefone nem e-mail
      console.warn(
        `[yampi-dual-coupons] Nem telefone nem email válidos para ${prescriberName}. Registrando no interaction_log.`,
      )
      communicationResult = {
        channel: 'none',
        status: 'not_available',
        error: 'Prescritor não possui telefone nem e-mail cadastrado.',
      }

      await supabaseAdmin.from('interaction_log').insert({
        user_id: effectiveUserId,
        contact_id: contact?.id || null,
        type: 'dual_coupons_no_contact_channel',
        details: {
          prescriber_name: prescriberName,
          phone: prescriberPhone,
          email: prescriberEmail,
          patient_coupon: finalPatientCode,
          personal_coupon: finalPersonalCode,
        },
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Fluxo padrão de cupons duplos executado com sucesso.',
        prescriber: {
          name: prescriberName,
          phone: prescriberPhone,
          email: prescriberEmail,
        },
        coupons: {
          patient: {
            code: finalPatientCode,
            id: finalPatientId,
            discount: PATIENT_COUPON_DISCOUNT_PERCENT,
            quantity: FIXED_COUPON_QUANTITY,
            discountType: FIXED_DISCOUNT_TYPE,
          },
          personal: {
            code: finalPersonalCode,
            id: finalPersonalId,
            discount: PERSONAL_COUPON_DISCOUNT_PERCENT,
            quantity: FIXED_COUPON_QUANTITY,
            discountType: FIXED_DISCOUNT_TYPE,
          },
        },
        communication: communicationResult,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('[yampi-dual-coupons] Erro não tratado:', error.message)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erro interno no fluxo de cupons duplos.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
