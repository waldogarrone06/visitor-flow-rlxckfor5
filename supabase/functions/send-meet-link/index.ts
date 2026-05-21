import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

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

    if (!appointment.google_meet_link) {
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

    const replacements: Record<string, string> = {
      '\\{\\{nome_cliente\\}\\}': appointment.client_name || '',
      '\\{\\{data\\}\\}': appointment.appointment_date
        ? appointment.appointment_date.split('-').reverse().join('/')
        : '',
      '\\{\\{hora\\}\\}': appointment.start_time || '',
      '\\{\\{meet_link\\}\\}': appointment.google_meet_link,
    }

    let sentAny = false

    // WhatsApp Delivery
    if (integration.whatsapp_connected && appointment.client_phone) {
      let msg =
        integration.reminder_whatsapp_template ||
        'Olá {{nome_cliente}}, sua visita online está agendada para {{data}} às {{hora}}. Acesse o link no horário marcado: {{meet_link}}'
      for (const [k, v] of Object.entries(replacements)) {
        msg = msg.replace(new RegExp(k, 'g'), v)
      }

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
    if (appointment.client_email && integration.reminder_email_template) {
      let msg = integration.reminder_email_template
      for (const [k, v] of Object.entries(replacements)) {
        msg = msg.replace(new RegExp(k, 'g'), v)
      }

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
