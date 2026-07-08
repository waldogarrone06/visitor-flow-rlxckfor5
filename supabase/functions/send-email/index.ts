import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { to, subject, html, text, senderName, resendApiKey, from, userId, meetLink } = body

    if (!to || !subject || (!html && !text)) {
      throw new Error('Parâmetros obrigatórios ausentes: to, subject e html (ou text).')
    }

    const RESEND_API_KEY =
      resendApiKey || Deno.env.get('RESEND_API_KEY') || 're_WRBu3Lbz_EikoqsHQ6Kqpv3prxL1Qdgf6'

    if (!RESEND_API_KEY) {
      throw new Error('Chave de API do Resend não configurada. Adicione no Cofre de Segredos.')
    }

    const safeSenderName = (senderName || 'FourLab Nutrition').replace(/[<>]/g, '').trim()
    const defaultFrom = 'contato@fourlabnutrition.com.br'
    const fromEmail = `${safeSenderName} <${from || defaultFrom}>`

    let finalMeetLink = meetLink || null

    if (!finalMeetLink && userId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey)
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

    console.log(`Attempting to send email to ${to} via Resend from ${fromEmail}...`)

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
