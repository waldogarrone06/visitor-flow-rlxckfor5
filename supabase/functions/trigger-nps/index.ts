import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Option to target a specific appointment for manual trigger only
    let specificAppointmentId: string | null = null
    let forceSend = false
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (body?.appointmentId) specificAppointmentId = body.appointmentId
        if (body?.force) forceSend = !!body.force
      } catch (_) {}
    }

    // DESATIVAÇÃO DO DISPARO AUTOMÁTICO:
    // O envio automático de NPS pós-entrega foi desativado.
    // A pesquisa foi incorporada à mensagem com cupons duplos (Google Form).
    // Apenas disparos explicitamente manuais com appointmentId e force=true são processados,
    // garantindo que nenhum cron ou chamada automática envie mensagens.
    if (!specificAppointmentId || !forceSend) {
      console.log(
        '[trigger-nps] Envio automático de NPS pós-entrega está desativado. Pesquisa de satisfação migrada para o envio dos cupons.',
      )
      return new Response(
        JSON.stringify({
          success: true,
          disabled: true,
          message:
            'Envio automático de NPS desativado. A pesquisa agora é enviada junto aos cupons duplos.',
          npsTriggeredCount: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const now = Date.now()
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()

    let query = supabase
      .from('appointments')
      .select('id, client_email, client_name, delivered_at, user_id, client_phone, kit_status')
      .in('kit_status', ['Delivered', 'Entregue'])
      .neq('status', 'Lead')

    if (specificAppointmentId) {
      query = query.eq('id', specificAppointmentId)
    } else {
      // Must have delivered_at filled and must be at least 24h ago, within last 7 days
      query = query
        .not('delivered_at', 'is', null)
        .lte('delivered_at', twentyFourHoursAgo)
        .gte('delivered_at', sevenDaysAgo)
    }

    const { data: appointments, error: appErr } = await query
    if (appErr) throw appErr

    let sentCount = 0
    const details: any[] = []

    if (appointments && appointments.length > 0) {
      for (const app of appointments) {
        // Double check: if no delivered_at and not forced, skip to avoid sending prematurely
        if (!app.delivered_at && !forceSend) {
          console.warn(`[trigger-nps] Appointment ${app.id} has no delivered_at. Skipping.`)
          details.push({ id: app.id, status: 'skipped_no_delivered_at' })
          continue
        }

        // Check if NPS is already responded
        const { data: npsResponses } = await supabase
          .from('nps_responses')
          .select('id')
          .eq('appointment_id', app.id)

        if (npsResponses && npsResponses.length > 0) {
          details.push({ id: app.id, status: 'already_responded' })
          continue
        }

        // Check if we already sent notification for this appointment
        // We check if an interaction_log exists with type 'nps_triggered' and this appointment_id
        const { data: logs } = await supabase
          .from('interaction_log')
          .select('id, details')
          .eq('type', 'nps_triggered')

        const alreadySent = logs?.some((l) => {
          const det = l.details as any
          return det?.appointment_id === app.id
        })

        if (alreadySent && !forceSend) {
          details.push({ id: app.id, status: 'already_sent' })
          continue
        }

        console.log(
          `[trigger-nps] Triggering NPS survey for appointment ${app.id} to ${app.client_email || app.client_phone}`,
        )

        const publicUrl = Deno.env.get('FRONTEND_URL') || 'https://4labnutricom.goskip.app'
        const npsUrl = `${publicUrl}/nps/${app.id}`
        const message = `Olá, ${app.client_name}! Esperamos que tenha recebido seu kit com sucesso. Poderia nos avaliar rapidamente? ${npsUrl}`

        let channelSent = false

        // Send via WhatsApp if phone is available
        if (app.client_phone) {
          try {
            const waRes = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                to: app.client_phone,
                text: message,
                userId: app.user_id,
              }),
            })
            if (waRes.ok) channelSent = true
          } catch (e: any) {
            console.error(`Failed to send WhatsApp NPS for ${app.id}:`, e.message)
          }
        }

        // Send via Email if email is available
        if (app.client_email) {
          try {
            const mailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                to: app.client_email,
                subject: 'Pesquisa de Satisfação - Fourlab',
                html: `<p>Olá, ${app.client_name}!</p><p>Esperamos que tenha recebido seu kit com sucesso.</p><p>Poderia nos avaliar rapidamente clicando <a href="${npsUrl}">neste link</a>?</p>`,
                senderName: 'Fourlab',
              }),
            })
            if (mailRes.ok) channelSent = true
          } catch (e: any) {
            console.error(`Failed to send Email NPS for ${app.id}:`, e.message)
          }
        }

        // Log that we sent it so it won't be sent again
        await supabase.from('interaction_log').insert({
          user_id: app.user_id,
          type: 'nps_triggered',
          details: {
            appointment_id: app.id,
            delivered_at: app.delivered_at,
            timestamp: new Date().toISOString(),
            channel_sent: channelSent,
          },
        })

        sentCount++
        details.push({ id: app.id, status: 'sent', channelSent })
      }
    }

    return new Response(JSON.stringify({ success: true, npsTriggeredCount: sentCount, details }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
