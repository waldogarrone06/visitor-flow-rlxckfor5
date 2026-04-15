import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ success: true, status: 'online', mode: 'evolution-v2' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
    }

    const data = await req.json().catch(() => ({}))

    // Robust parsing for Evolution API v1/v2 and Baileys structures
    const eventType = data?.event || data?.messageType || 'unknown'
    const sessionId = (data?.instance || data?.sessionId || data?.instanceId || 'unknown').trim()

    const payloadData = data?.data || data
    const firstItem = Array.isArray(payloadData) ? payloadData[0] : payloadData

    const keyData = firstItem?.key || firstItem?.message?.key || data?.key || {}
    const msgData = firstItem?.message || firstItem

    let phone =
      keyData?.remoteJid || firstItem?.remoteJid || data?.sender || data?.from || data?.number || ''
    if (typeof phone === 'string') phone = phone.split('@')[0]
    phone = String(phone).replace(/\D/g, '')

    console.log(
      '📥 Webhook Recebido:',
      JSON.stringify({ eventType, sessionId, phone, fromMe: keyData?.fromMe }),
    )

    const isSystemEvent =
      eventType.startsWith('connection') || eventType.startsWith('qrcode') || !phone

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    })

    // 1. Raw event log
    try {
      await supabaseAdmin.from('whatsapp_events').insert({
        instance: sessionId,
        message_type: eventType,
        remote_jid: phone || 'system',
        message: data || {},
      })
    } catch (dbErr) {}

    if (isSystemEvent) {
      return new Response(JSON.stringify({ status: 'ok', handled: 'system_event' }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    // 2. Status Updates
    if (eventType === 'messages.update') {
      let messageId = keyData?.id || firstItem?.update?.id || null
      let newStatus = firstItem?.update?.status

      if (messageId && newStatus) {
        let mappedStatus = 'sent'
        if (newStatus === 'SERVER_ACK' || newStatus === 'PENDING') mappedStatus = 'sent'
        if (newStatus === 'DELIVERY_ACK') mappedStatus = 'delivered'
        if (newStatus === 'READ') mappedStatus = 'read'
        if (newStatus === 'PLAYED') mappedStatus = 'played'
        if (newStatus === 'ERROR') mappedStatus = 'failed'

        try {
          await supabaseAdmin
            .from('messages')
            .update({ status: mappedStatus })
            .eq('client_id', messageId)
        } catch (e) {}
      }
    }

    // 3. New Messages
    let text =
      msgData?.conversation ||
      msgData?.extendedTextMessage?.text ||
      firstItem?.text ||
      data?.body ||
      data?.text ||
      data?.content ||
      ''
    let isFromMe = keyData?.fromMe || false
    let messageId = keyData?.id || data?.messageId || null

    if ((eventType === 'messages.upsert' || data?.data?.message || msgData) && text) {
      try {
        let userId = null
        const { data: integration } = await supabaseAdmin
          .from('user_integrations')
          .select('user_id')
          .eq('whatsapp_instance_id', sessionId)
          .maybeSingle()

        if (integration) userId = integration.user_id
        else {
          const { data: mainProfile } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .limit(1)
            .maybeSingle()
          if (mainProfile) userId = mainProfile.id
        }

        if (userId && phone) {
          let { data: contact } = await supabaseAdmin
            .from('contacts')
            .select('id')
            .eq('user_id', userId)
            .eq('phone', phone)
            .maybeSingle()
          let contactId = contact?.id

          if (!contactId) {
            const pushName = firstItem?.pushName || `Contato (${phone})`
            const { data: newContact } = await supabaseAdmin
              .from('contacts')
              .insert({ user_id: userId, phone: phone, name: pushName })
              .select('id')
              .maybeSingle()
            if (newContact) contactId = newContact.id
          }

          if (contactId) {
            let msgExists = false
            if (messageId) {
              const { data: existingMsg } = await supabaseAdmin
                .from('messages')
                .select('id')
                .eq('client_id', messageId)
                .maybeSingle()
              if (existingMsg) msgExists = true
            }

            if (!msgExists) {
              await supabaseAdmin.from('messages').insert({
                user_id: userId,
                contact_id: contactId,
                content: text,
                direction: isFromMe ? 'outbound' : 'inbound',
                status: isFromMe ? 'sent' : 'delivered',
                client_id: messageId,
              })

              await supabaseAdmin.from('interaction_log').insert({
                user_id: userId,
                contact_id: contactId,
                type: 'whatsapp_receive',
                details: { text: text.substring(0, 50), isFromMe, messageId, eventType },
              })
            }
          }
        }
      } catch (e) {
        console.error('Erro processando mensagem:', e)
      }
    }

    return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: corsHeaders })
  } catch (err: any) {
    console.error('❌ ERRO GERAL:', err)
    return new Response(JSON.stringify({ status: 'error' }), { status: 200, headers: corsHeaders })
  }
})
