import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { appointmentId } = await req.json()
    if (!appointmentId) {
      throw new Error('ID do agendamento não fornecido.')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

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

    const replacements: Record<string, string> = {
      '\\{\\{nome_cliente\\}\\}': appointment.client_name || '',
      '\\{\\{data\\}\\}': appointment.appointment_date
        ? appointment.appointment_date.split('-').reverse().join('/')
        : '',
      '\\{\\{hora\\}\\}': appointment.start_time || '',
      '\\{\\{meet_link\\}\\}': effectiveMeetLink,
      '\\{\\{professional_name\\}\\}': profile?.name || 'Nossa equipe',
    }

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

    let msg = messageTemplate
    for (const [k, v] of Object.entries(replacements)) {
      msg = msg.replace(new RegExp(k, 'g'), v)
    }

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
            text: msg,
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
            html: `<div style="font-family: sans-serif; padding: 20px; color: #333;"><p>${msg.replace(/\n/g, '<br/>')}</p></div>`,
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
