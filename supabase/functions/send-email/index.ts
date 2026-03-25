import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { to, subject, html, text, senderName, resendApiKey, from } = body

    // Validate required inputs
    if (!to || !subject || (!html && !text)) {
      throw new Error('Parâmetros obrigatórios ausentes: to, subject e html (ou text).')
    }

    // Use the provided RESEND API KEY from frontend Vault, or environment variables
    const RESEND_API_KEY =
      resendApiKey || Deno.env.get('RESEND_API_KEY') || 're_WRBu3Lbz_EikoqsHQ6Kqpv3prxL1Qdgf6'

    if (!RESEND_API_KEY) {
      throw new Error('Chave de API do Resend não configurada. Adicione no Cofre de Segredos.')
    }

    // Limpa o nome do remetente
    const safeSenderName = (senderName || 'FourLab Nutrition').replace(/[<>]/g, '').trim()

    // Força o uso do domínio já verificado no Resend conforme solicitado
    const defaultFrom = 'contato@fourlabnutrition.com.br'
    const fromEmail = `${safeSenderName} <${from || defaultFrom}>`

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
        html: html,
        text: text,
      }),
    })

    const data = await res.json().catch(() => ({ error: 'Resend API returned malformed JSON' }))

    if (!res.ok) {
      console.error('Resend API Error Payload:', data)
      throw new Error(
        data.message || data.error?.message || 'Falha ao processar o envio na API do Resend.',
      )
    }

    return new Response(JSON.stringify({ success: true, messageId: data.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Edge Function Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
