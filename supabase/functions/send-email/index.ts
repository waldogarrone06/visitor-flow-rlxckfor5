import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { to, subject, html, text, senderName } = await req.json()

    // Validate required inputs
    if (!to || !subject || (!html && !text)) {
      throw new Error('Parâmetros obrigatórios ausentes: to, subject e html (ou text).')
    }

    // Use the provided RESEND API KEY directly or from environment variables
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || 're_WRBu3Lbz_EikoqsHQ6Kqpv3prxL1Qdgf6'

    if (!RESEND_API_KEY) {
      throw new Error('Chave de API do Resend não configurada.')
    }

    // Since custom domains might not be verified yet in Resend free tier,
    // it's strictly required to use the onboarding@resend.dev domain for tests.
    // E-mails will only be successfully delivered to the e-mail address registered on the Resend account.
    const fromName = senderName || 'Sistema FourLab'
    const fromEmail = `${fromName} <onboarding@resend.dev>`

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

    const data = await res.json()

    if (!res.ok) {
      console.error('Resend API Error Payload:', data)
      // Throw a specific error message if it's the unverified email issue from Resend
      if (data.message && data.message.includes('verify')) {
        throw new Error(
          `Erro do Resend: Você só pode enviar e-mails para o seu próprio e-mail cadastrado no Resend até que verifique um domínio. Detalhe: ${data.message}`,
        )
      }
      throw new Error(data.message || 'Falha ao processar o envio na API do Resend.')
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
