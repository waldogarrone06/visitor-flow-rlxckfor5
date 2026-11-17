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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // "Amanhã" no fuso de Brasília (America/Sao_Paulo), não em UTC:
    // depois das 21h BRT a data UTC já é o dia seguinte.
    const todayBrt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
      new Date(),
    )
    const [yBrt, mBrt, dBrt] = todayBrt.split('-').map(Number)
    const tomorrowStr = new Date(Date.UTC(yBrt, mBrt - 1, dBrt + 1)).toISOString().split('T')[0]

    // Find appointments for tomorrow where reminder_sent is false or null
    const { data: appointments, error: appErr } = await supabase
      .from('appointments')
      .select(
        'id, client_email, client_phone, client_name, appointment_date, start_time, user_id, google_meet_link',
      )
      .eq('appointment_date', tomorrowStr)
      .not('reminder_sent', 'eq', true)
      .neq('status', 'lead')

    if (appErr) throw appErr

    if (!appointments || appointments.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No reminders to send' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userIds = [...new Set(appointments.map((a) => a.user_id))]

    const { data: integrations } = await supabase
      .from('user_integrations')
      .select('*')
      .in('user_id', userIds)
      .eq('reminder_enabled', true)

    if (!integrations || integrations.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No integrations enabled for reminders' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const integrationsMap = new Map()
    integrations.forEach((i) => integrationsMap.set(i.user_id, i))

    let sentCount = 0

    for (const app of appointments) {
      const integration = integrationsMap.get(app.user_id)
      if (!integration) continue

      // DUAS renderizações a partir dos mesmos dados PUROS — nunca reutilizar a
      // string escapada do e-mail no WhatsApp: "D'Ávila" chega como "D'Ávila"
      // (não "D&#39;Ávila") e o link mantém o "&" (não "&amp;").
      const plainValues = {
        '{{nome_cliente}}': String(app.client_name ?? ''),
        '{{data}}': String(app.appointment_date ?? '')
          .split('-')
          .reverse()
          .join('/'),
        '{{hora}}': String(app.start_time ?? ''),
        '{{meet_link}}': String(app.google_meet_link || 'Link não gerado'),
      }

      const escapeHtmlLocal = (value: string): string =>
        value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')

      const htmlValues = Object.fromEntries(
        Object.entries(plainValues).map(([k, v]) => [k, escapeHtmlLocal(v)]),
      )

      const fillTemplate = (template: string, values: Record<string, string>): string => {
        let out = template
        for (const [key, value] of Object.entries(values)) {
          out = out.replaceAll(key, value)
        }
        return out
      }

      let sentAny = false

      // Send WhatsApp
      if (
        integration.whatsapp_connected &&
        app.client_phone &&
        integration.reminder_whatsapp_template
      ) {
        // Texto PURO para o WhatsApp (sem escape HTML).
        const msg = fillTemplate(integration.reminder_whatsapp_template, plainValues)

        try {
          await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              to: app.client_phone,
              text: msg,
              userId: app.user_id,
            }),
          })
          sentAny = true
        } catch (e) {
          console.error(`Failed to send WhatsApp reminder for ${app.id}`, e)
        }
      }

      // Send Email
      if (app.client_email && integration.reminder_email_template) {
        // HTML escapado SOMENTE para o corpo HTML do e-mail.
        const msg = fillTemplate(integration.reminder_email_template, htmlValues)

        try {
          await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              to: app.client_email,
              subject: 'Lembrete de Agendamento',
              html: `<div style="font-family: sans-serif; padding: 20px; color: #333;"><p>${msg.replace(/\n/g, '<br/>')}</p></div>`,
              senderName: 'Lembrete Automático',
            }),
          })
          sentAny = true
        } catch (e) {
          console.error(`Failed to send Email reminder for ${app.id}`, e)
        }
      }

      if (sentAny) {
        await supabase.from('appointments').update({ reminder_sent: true }).eq('id', app.id)
        sentCount++
      }
    }

    return new Response(JSON.stringify({ success: true, sentCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
