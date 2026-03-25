import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { to, subject, html, text, senderName, resendApiKey } = body

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

    // Since custom domains might not be verified yet in Resend free tier,
    // it's strictly required to use the onboarding@resend.dev domain for tests.
    // E-mails will only be successfully delivered to the e-mail address registered on the Resend account.
    const safeSenderName = (senderName || 'Sistema FourLab').replace(/[<>]/g, '').trim()
    const fromEmail = `${safeSenderName} <onboarding@resend.dev>`

    console.log(`Attempting to send email to ${to} via Resend...`)

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
      // Catch common free tier limits from Resend
      if (
        data.message &&
        (data.message.toLowerCase().includes('verify') ||
          data.message.toLowerCase().includes('testing emails') ||
          data.message.toLowerCase().includes('own email address'))
      ) {
        throw new Error(
          `Restrição do Resend: O domínio ainda não foi verificado. Você só pode enviar e-mails de teste para o e-mail exato em que a conta do Resend foi criada. Detalhe: ${data.message}`,
        )
      }
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
