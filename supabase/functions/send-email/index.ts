import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { forbidden, requireInternalOrUserAuth } from '../_shared/internal-auth.ts'
import {
  renderTemplate,
  type EmailTemplatePurpose,
  type EmailTemplateVars,
} from '../_shared/email-templates.ts'

// Atributo href seguro (front): bloqueia javascript:/data: e escapa aspas.
function escapeUrlAttribute(value: string): string {
  const v = String(value || '').trim()
  if (/^(javascript|data|vbscript):/i.test(v)) return '#'
  return v.replace(/"/g, '%22').replace(/'/g, '%27').replace(/</g, '%3C').replace(/>/g, '%3E')
}

function normalizeEmail(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

// Envio de e-mail autenticado (Resend).
//
// Autenticação com DOIS caminhos (requireInternalOrUserAuth):
// 1. Chamadores INTERNOS (outras edge functions: create-booking, sync-calendar,
//    send-meet-link, trigger-reminders): header Authorization
//    `Bearer <SUPABASE_SERVICE_ROLE_KEY>`, comparado com o secret do ambiente.
//    A service role key NÃO é um token de usuário — auth.getUser() falha para
//    ela, por isso a comparação direta vem PRIMEIRO.
// 2. Usuários autenticados do front: JWT no Authorization, validado via
//    auth.getUser(). Anon key => 401.
//
// OWNERSHIP (auditoria):
// - Chamada do front SEMPRE com template fixo (`template` + `vars`); subject/
//   html/text do corpo são IGNORADOS. Destinatário restrito a:
//     • com appointmentId: dono do agendamento e destinatário = e-mail do
//       cliente do PRÓPRIO agendamento;
//     • template test: apenas o e-mail da própria conta logada;
//     • template marketing_coupon_request: apenas o domínio interno da equipe;
//     • demais: contato do próprio usuário (contacts.user_id = auth.uid(),
//       match por e-mail normalizado). Fora disso => 403.
// - Caminho interno (service role) preservado: compõe o conteúdo próprio e
//   resolve o meet link fixo via RPC quando recebe userId.
//
// A chave da Resend vem EXCLUSIVAMENTE do secret RESEND_API_KEY (nunca
// hardcoded, nunca do corpo da requisição).

const INTERNAL_TEAM_DOMAINS = ['fourlabnutrition.com.br', 'fourlabnutri.com.br']

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // --- Autenticação obrigatória -------------------------------------------
    const auth = await requireInternalOrUserAuth(req)
    if (!auth.ok) return auth.response

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const isInternalCaller = auth.isInternal

    // --- Payload ------------------------------------------------------------
    const body = await req.json().catch(() => ({}))
    const { to, senderName, from, userId, meetLink, appointmentId, template, vars } = body || {}

    if (!to) {
      throw new Error('Parâmetro obrigatório ausente: to.')
    }

    const frontTemplate = typeof template === 'string' ? template : ''
    const frontVars: EmailTemplateVars =
      vars && typeof vars === 'object' && !Array.isArray(vars) ? vars : {}

    // --- Chave da Resend: apenas do ambiente/secrets -------------------------
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''

    if (!RESEND_API_KEY) {
      throw new Error(
        'Chave de API do Resend não configurada. Defina o secret RESEND_API_KEY (Configurações > Cofre de Segredos).',
      )
    }

    let finalSubject = ''
    let finalHtml = ''
    let finalText = ''
    let finalMeetLink: string | null = null

    if (!isInternalCaller) {
      // --- Caminho do FRONT autenticado: template fixo obrigatório ----------
      const VALID_PURPOSES: EmailTemplatePurpose[] = [
        'coupons',
        'kit_shipped',
        'marketing_coupon_request',
        'appointment_confirmation',
        'meet_link',
        'test',
      ]
      if (!VALID_PURPOSES.includes(frontTemplate as EmailTemplatePurpose)) {
        return forbidden(
          'Envio de e-mail requer um template fixo válido (template: coupons, kit_shipped, marketing_coupon_request, appointment_confirmation, meet_link ou test).',
        )
      }

      const recipientEmail = normalizeEmail(to)
      const isInternalTeamAddress = INTERNAL_TEAM_DOMAINS.some((d) =>
        recipientEmail.endsWith(`@${d}`),
      )

      const supabaseAsUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
        global: {
          headers: { Authorization: req.headers.get('Authorization') || '' },
        },
      })

      if (appointmentId) {
        // Dono do agendamento E destinatário é o e-mail do cliente dele.
        const { data: owned, error: ownedErr } = await supabaseAsUser
          .from('appointments')
          .select('id, client_email')
          .eq('id', appointmentId)
          .eq('user_id', auth.userId!)
          .maybeSingle()
        if (ownedErr || !owned) {
          return forbidden('Você não tem permissão para este agendamento.')
        }
        if (recipientEmail !== normalizeEmail((owned as any).client_email)) {
          return forbidden('O destinatário deve ser o e-mail do cliente deste agendamento.')
        }
      } else if (frontTemplate === 'test') {
        // Teste de configuração: só para o e-mail da própria conta logada.
        const { data: meData } = await supabaseAsUser.auth.getUser()
        const myEmail = normalizeEmail(meData?.user?.email)
        if (!myEmail || recipientEmail !== myEmail) {
          return forbidden(
            'O e-mail de teste só pode ser enviado para o e-mail da sua própria conta.',
          )
        }
      } else if (frontTemplate === 'marketing_coupon_request' && isInternalTeamAddress) {
        // Pedido interno de cadastro de cupom para a equipe: destinatário fixo
        // do domínio interno, conteúdo de template fixo — risco fechado.
      } else {
        // Destinatário precisa ser um contato do próprio usuário.
        const { data: ownedContact, error: contactErr } = await supabaseAsUser
          .from('contacts')
          .select('id')
          .eq('user_id', auth.userId!)
          .eq('email', recipientEmail)
          .limit(1)

        if (contactErr || !ownedContact || ownedContact.length === 0) {
          return forbidden(
            'Destinatário não autorizado: o e-mail deve pertencer a um contato do seu cadastro.',
          )
        }
      }

      // Conteúdo SEMPRE do template fixo com variáveis controladas.
      const rendered = renderTemplate(frontTemplate as EmailTemplatePurpose, frontVars)
      finalSubject = rendered.subject
      finalHtml = rendered.html
      finalText = rendered.text
      finalMeetLink = frontVars.meetLink ? escapeUrlAttribute(frontVars.meetLink) : null
    } else {
      // --- Caminho INTERNO (service role): conteúdo próprio do chamador -----
      finalSubject = body.subject
      finalHtml = body.html
      finalText = body.text
      finalMeetLink = meetLink || null

      if (!finalMeetLink && userId) {
        try {
          const supabase = createClient(supabaseUrl, serviceKey)
          const { data: fixedLink, error: rpcError } = await supabase.rpc('get_fixed_meet_link', {
            p_user_id: userId,
          })
          if (!rpcError && fixedLink) finalMeetLink = fixedLink
        } catch (e: any) {
          console.error('[send-email] get_fixed_meet_link falhou:', e?.message || e)
        }
      }
    }

    if (!finalSubject || (!finalHtml && !finalText)) {
      throw new Error('Conteúdo do e-mail ausente (template inválido ou corpo vazio).')
    }

    const safeSenderName = (senderName || 'FourLab Nutrition').replace(/[<>]/g, '').trim()
    const defaultFrom = 'contato@fourlabnutrition.com.br'
    const fromEmail = `${safeSenderName} <${from || defaultFrom}>`

    if (finalMeetLink) {
      const meetLinkHtml = `<div style="margin-top: 16px; padding: 12px; background-color: #f0fdfa; border: 1px solid #14b8a6; border-radius: 8px;"><p style="margin: 0 0 4px 0; font-size: 14px; color: #0f766e; font-weight: bold;">🔗 Link da Reunião</p><a href="${finalMeetLink}" style="color: #0d9488; font-weight: bold; word-break: break-all; text-decoration: underline;">${finalMeetLink}</a></div>`
      const meetLinkText = `\n\n---\n🔗 Link da Reunião: ${finalMeetLink}\n`

      if (finalHtml) {
        if (finalHtml.includes('</div>')) {
          finalHtml = finalHtml.replace(/<\/div>\s*$/, `${meetLinkHtml}</div>`)
        } else {
          finalHtml = finalHtml + meetLinkHtml
        }
      }
      if (finalText) {
        finalText = finalText + meetLinkText
      }
    }

    console.log(
      `Attempting to send email to ${to} via Resend from ${fromEmail} (internal caller: ${isInternalCaller}, template: ${frontTemplate || 'internal'})...`,
    )

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: finalSubject,
        html: finalHtml || undefined,
        text: finalText || undefined,
      }),
    })

    const data = await res.json().catch(() => ({ error: 'Resend API returned malformed JSON' }))

    if (!res.ok) {
      console.error('Resend API Error Payload:', data)
      throw new Error(
        data.message || data.error?.message || 'Falha ao processar o envio na API do Resend.',
      )
    }

    return new Response(
      JSON.stringify({ success: true, messageId: data.id, meetLink: finalMeetLink }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error: any) {
    console.error('Edge Function Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
