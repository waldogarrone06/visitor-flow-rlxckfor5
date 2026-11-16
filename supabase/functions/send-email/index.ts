import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Envio de e-mail autenticado (Resend).
//
// Autenticação com DOIS caminhos:
// 1. Chamadores INTERNOS (outras edge functions: create-booking, sync-calendar,
//    send-meet-link, trigger-reminders, trigger-nps): header Authorization
//    `Bearer <SUPABASE_SERVICE_ROLE_KEY>`, comparado com o secret do ambiente.
//    A service role key NÃO é um token de usuário — auth.getUser() falha para
//    ela, por isso a comparação direta vem PRIMEIRO.
// 2. Usuários autenticados do front: JWT no Authorization, validado via
//    auth.getUser(). Anon key => 401.
//
// A chave da Resend vem EXCLUSIVAMENTE do secret RESEND_API_KEY (nunca
// hardcoded, nunca do corpo da requisição).

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // --- Autenticação obrigatória -------------------------------------------
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()

    if (!token) {
      return new Response(JSON.stringify({ error: 'Não autenticado: token ausente.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    // 1) Caminho INTERNO: service role key do ambiente (comparação exata).
    //    Deve vir antes do auth.getUser — a service role key não é um JWT de
    //    usuário e auth.getUser(token) retorna erro para ela.
    const isInternalCaller = !!serviceKey && token === serviceKey

    if (!isInternalCaller) {
      // 2) Caminho FRONT: valida JWT real de usuário autenticado.
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
      const supabaseAsUser = createClient(supabaseUrl, supabaseAnonKey || token, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: userData, error: userError } = await supabaseAsUser.auth.getUser(token)

      if (userError || !userData?.user || userData.user.role !== 'authenticated') {
        return new Response(JSON.stringify({ error: 'Não autenticado ou token inválido.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // --- Payload ------------------------------------------------------------
    const body = await req.json().catch(() => ({}))
    const { to, subject, html, text, senderName, from, userId, meetLink } = body

    if (!to || !subject || (!html && !text)) {
      throw new Error('Parâmetros obrigatórios ausentes: to, subject e html (ou text).')
    }

    // --- Chave da Resend: apenas do ambiente/secrets -------------------------
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''

    if (!RESEND_API_KEY) {
      throw new Error(
        'Chave de API do Resend não configurada. Defina o secret RESEND_API_KEY (Configurações > Cofre de Segredos).',
      )
    }

    const safeSenderName = (senderName || 'FourLab Nutrition').replace(/[<>]/g, '').trim()
    const defaultFrom = 'contato@fourlabnutrition.com.br'
    const fromEmail = `${safeSenderName} <${from || defaultFrom}>`

    let finalMeetLink = meetLink || null

    if (!finalMeetLink && userId) {
      if (supabaseUrl && serviceKey) {
        const supabase = createClient(supabaseUrl, serviceKey)
        const { data: fixedLink, error: rpcError } = await supabase.rpc('get_fixed_meet_link', {
          p_user_id: userId,
        })

        if (!rpcError && fixedLink) {
          finalMeetLink = fixedLink
        }
      }
    }

    let finalHtml = html
    let finalText = text

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
      `Attempting to send email to ${to} via Resend from ${fromEmail} (internal caller: ${isInternalCaller})...`,
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
        subject: subject,
        html: finalHtml,
        text: finalText,
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
