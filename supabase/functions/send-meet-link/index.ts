import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { forbidden, requireInternalOrUserAuth } from '../_shared/internal-auth.ts'

// Chamada pelo FRONT autenticado (UpcomingOnlineMeetings — botão "Enviar Link").
// Requer service role (chamadas internas) ou JWT de usuário — anônimo 401.
// OWNERSHIP: usuário autenticado só pode enviar o link de agendamento PRÓPRIO
// (403 caso contrário) — o meet link é dado sensível.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const auth = await requireInternalOrUserAuth(req)
    if (!auth.ok) return auth.response

    const { appointmentId } = await req.json()
    if (!appointmentId) {
      throw new Error('ID do agendamento não fornecido.')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // OWNERSHIP (auditoria): chamada autenticada do front só pode mexer em
    // agendamento próprio. Interno (service role) passa sem checagem.
    if (!auth.isInternal) {
      const supabaseAsUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
        global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
      })
      const { data: owned, error: ownedErr } = await supabaseAsUser
        .from('appointments')
        .select('id')
        .eq('id', appointmentId)
        .eq('user_id', auth.userId!)
        .maybeSingle()
      if (ownedErr || !owned) {
        return forbidden('Você não tem permissão para este agendamento.')
      }
    }

    const { data: appointment, error: appErr } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .single()

    if (appErr || !appointment) {
      throw new Error('Agendamento não encontrado.')
    }

    let effectiveMeetLink = appointment.google_meet_link

    if (!effectiveMeetLink) {
      const { data: fixedLink } = await supabase.rpc('get_fixed_meet_link', {
        p_user_id: appointment.user_id,
      })

      if (fixedLink) {
        effectiveMeetLink = fixedLink
      }
    }

    if (!effectiveMeetLink) {
      return new Response(
        JSON.stringify({ error: 'Link ainda não gerado. Gere o link primeiro.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { data: integration, error: intErr } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', appointment.user_id)
      .single()

    if (intErr || !integration) {
      throw new Error('Integração não encontrada.')
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', appointment.user_id)
      .single()

    let sentAny = false

    const messageTemplate = `Olá, {{nome_cliente}}! 👋

Sua visita online com a equipe Fourlab está confirmada e o link da reunião já está pronto.

📅 Data: {{data}}
🕐 Horário: {{hora}}

🔗 Acesse pelo link abaixo:
{{meet_link}}

{{professional_name}} já estará na sala aguardando você no horário marcado. Basta clicar no link e solicitar entrada — seu acesso será liberado em instantes.

Até logo! 😊
*Equipe Fourlab*`

    // DUAS renderizações a partir dos mesmos dados PUROS (nunca reutilizar a
    // string escapada do e-mail no WhatsApp):
    // - texto PURO → WhatsApp/texto simples ("D'Ávila" fica "D'Ávila", "&" fica "&");
    // - HTML escapado → corpo HTML do e-mail (anti-injeção).
    const fillTemplate = (values: Record<string, string>): string => {
      let out = messageTemplate
      for (const [key, value] of Object.entries(values)) {
        out = out.replaceAll(`{{${key}}}`, value)
      }
      return out
    }

    const plainValues: Record<string, string> = {
      nome_cliente: String(appointment.client_name ?? ''),
      data: appointment.appointment_date
        ? appointment.appointment_date.split('-').reverse().join('/')
        : '',
      hora: String(appointment.start_time ?? ''),
      meet_link: String(effectiveMeetLink ?? ''),
      professional_name: String(profile?.name || 'Nossa equipe'),
    }

    const escapeHtmlLocal = (value: string): string =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')

    const htmlValues: Record<string, string> = Object.fromEntries(
      Object.entries(plainValues).map(([k, v]) => [k, escapeHtmlLocal(v)]),
    )

    const plainMessage = fillTemplate(plainValues) // WhatsApp / texto simples
    const htmlMessage = fillTemplate(htmlValues) // corpo HTML do e-mail

    // WhatsApp Delivery
    if (integration.whatsapp_connected && appointment.client_phone) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            to: appointment.client_phone,
            text: plainMessage,
            userId: appointment.user_id,
          }),
        })
        sentAny = true
      } catch (e) {
        console.error(`Failed to send automated WhatsApp for ${appointmentId}`, e)
      }
    }

    // Email Delivery
    if (appointment.client_email) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            to: appointment.client_email,
            subject: 'Sua visita online está pronta - Fourlab',
            html: `<div style="font-family: sans-serif; padding: 20px; color: #333;"><p>${htmlMessage.replace(/\n/g, '<br/>')}</p></div>`,
            senderName: 'FourLab Nutrition',
            userId: appointment.user_id,
            meetLink: effectiveMeetLink,
          }),
        })
        sentAny = true
      } catch (e) {
        console.error(`Failed to send automated Email for ${appointmentId}`, e)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: sentAny
          ? 'Links enviados com sucesso.'
          : 'Nenhum canal de envio configurado (WhatsApp ou Email).',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
