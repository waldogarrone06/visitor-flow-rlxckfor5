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

    // Logs detalhados para diagnóstico do payload recebido da Evolution API
    console.log('📥 Webhook Recebido (Completo):', JSON.stringify(data, null, 2))

    const eventType = data?.event || data?.messageType || 'unknown'
    const sessionId = (data?.instance || data?.sessionId || data?.instanceId || 'unknown').trim()

    const payloadData = data?.data || data?.message || data
    const firstItem = Array.isArray(payloadData) ? payloadData[0] : payloadData

    const keyData = firstItem?.key || firstItem?.message?.key || data?.key || {}
    const msgData = firstItem?.message || firstItem

    let remoteJid =
      data?.sender || keyData?.remoteJid || firstItem?.remoteJid || data?.from || data?.number || ''

    // Ignorar mensagens de grupos para evitar lixo no banco
    if (typeof remoteJid === 'string' && remoteJid.includes('@g.us')) {
      return new Response(JSON.stringify({ status: 'ok', handled: 'group_message_ignored' }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    let phone = remoteJid
    if (typeof phone === 'string') phone = phone.split('@')[0]
    if (typeof phone === 'string' && phone.includes(':')) phone = phone.split(':')[0] // Correção para IDs linked (lid) da Evolution
    phone = String(phone).replace(/\D/g, '')

    console.log(
      '🧩 Webhook Extraído:',
      JSON.stringify({ eventType, sessionId, phone, sender: data?.sender }),
    )

    const isSystemEvent =
      eventType.startsWith('connection') ||
      eventType.startsWith('qrcode') ||
      !phone ||
      phone.length < 8

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    })

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

    // Processamento de Atualização de Status (DELIVERY_ACK, READ, etc)
    if (eventType === 'messages.update') {
      let messageId =
        keyData?.id ||
        firstItem?.update?.id ||
        firstItem?.keyId ||
        firstItem?.messageId ||
        data?.data?.keyId ||
        null
      let newStatus = firstItem?.update?.status || firstItem?.status || data?.data?.status

      console.log(`🔄 Atualização de Status detectada: MSG ID ${messageId} -> ${newStatus}`)

      if (messageId && newStatus) {
        let mappedStatus = 'sent'
        if (newStatus === 'SERVER_ACK' || newStatus === 'PENDING') mappedStatus = 'sent'
        if (newStatus === 'DELIVERY_ACK') mappedStatus = 'delivered'
        if (newStatus === 'READ') mappedStatus = 'read'
        if (newStatus === 'PLAYED') mappedStatus = 'played'
        if (newStatus === 'ERROR') mappedStatus = 'failed'

        try {
          const { data: updatedMsg, error: updErr } = await supabaseAdmin
            .from('messages')
            .update({ status: mappedStatus })
            .eq('client_id', messageId)
            .select('id')
            .maybeSingle()

          if (updErr) console.error('❌ Erro ao atualizar status no Supabase:', updErr)
          else if (updatedMsg)
            console.log('✅ Status atualizado com sucesso no banco:', updatedMsg.id)
        } catch (e) {
          console.error('❌ Exceção ao atualizar status:', e)
        }
      }

      // Retorna cedo, pois é apenas um update de status, não uma mensagem nova
      return new Response(JSON.stringify({ status: 'ok', handled: 'status_update' }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    // Processamento de Novas Mensagens
    let text =
      msgData?.message?.conversation ||
      msgData?.message?.extendedTextMessage?.text ||
      msgData?.conversation ||
      msgData?.extendedTextMessage?.text ||
      firstItem?.text ||
      firstItem?.message?.text ||
      data?.body ||
      data?.text ||
      data?.content ||
      ''

    if (!text) {
      if (msgData?.message?.imageMessage || msgData?.imageMessage)
        text =
          msgData?.message?.imageMessage?.caption || msgData?.imageMessage?.caption || '[Imagem]'
      else if (msgData?.message?.videoMessage || msgData?.videoMessage)
        text =
          msgData?.message?.videoMessage?.caption || msgData?.videoMessage?.caption || '[Vídeo]'
      else if (msgData?.message?.audioMessage || msgData?.audioMessage) text = '[Áudio]'
      else if (msgData?.message?.documentMessage || msgData?.documentMessage)
        text =
          msgData?.message?.documentMessage?.fileName ||
          msgData?.documentMessage?.fileName ||
          '[Documento]'
      else if (msgData?.message?.stickerMessage || msgData?.stickerMessage) text = '[Sticker]'
      else if (msgData?.message?.contactMessage || msgData?.contactMessage) text = '[Contato]'
    }

    let isFromMe = keyData?.fromMe || firstItem?.fromMe || data?.data?.fromMe || false
    let messageId = keyData?.id || data?.messageId || firstItem?.keyId || null

    if ((eventType === 'messages.upsert' || data?.data?.message || msgData) && text) {
      console.log(
        `💬 Processando nova mensagem [fromMe: ${isFromMe}]: ${phone} -> ${text.substring(0, 30)}...`,
      )
      try {
        let userId = null

        const { data: integrations } = await supabaseAdmin
          .from('user_integrations')
          .select('user_id')
          .ilike('whatsapp_instance_id', sessionId)
          .limit(1)

        if (integrations && integrations.length > 0) {
          userId = integrations[0].user_id
        } else {
          const { data: fallbackIntegration } = await supabaseAdmin
            .from('user_integrations')
            .select('user_id')
            .not('whatsapp_api_url', 'is', null)
            .limit(1)
            .maybeSingle()

          if (fallbackIntegration) {
            userId = fallbackIntegration.user_id
          } else {
            const { data: mainProfile } = await supabaseAdmin
              .from('profiles')
              .select('id')
              .limit(1)
              .maybeSingle()
            if (mainProfile) userId = mainProfile.id
          }
        }

        if (userId && phone) {
          let contactId = null

          let { data: contact } = await supabaseAdmin
            .from('contacts')
            .select('id')
            .eq('user_id', userId)
            .eq('phone', phone)
            .maybeSingle()
          if (contact) contactId = contact.id

          if (!contactId && phone.startsWith('55') && phone.length >= 12) {
            const phoneWithout55 = phone.substring(2)
            let { data: contact2 } = await supabaseAdmin
              .from('contacts')
              .select('id')
              .eq('user_id', userId)
              .eq('phone', phoneWithout55)
              .maybeSingle()
            if (contact2) contactId = contact2.id
          }

          if (!contactId && !phone.startsWith('55') && phone.length >= 10) {
            const phoneWith55 = '55' + phone
            let { data: contact3 } = await supabaseAdmin
              .from('contacts')
              .select('id')
              .eq('user_id', userId)
              .eq('phone', phoneWith55)
              .maybeSingle()
            if (contact3) contactId = contact3.id
          }

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

            if (!msgExists && isFromMe && text) {
              const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString()
              const { data: recentMsg } = await supabaseAdmin
                .from('messages')
                .select('id, client_id')
                .eq('contact_id', contactId)
                .eq('direction', 'outbound')
                .eq('content', text)
                .gte('created_at', thirtySecondsAgo)
                .limit(1)
                .maybeSingle()

              if (recentMsg) {
                msgExists = true
                if (!recentMsg.client_id && messageId) {
                  await supabaseAdmin
                    .from('messages')
                    .update({ client_id: messageId })
                    .eq('id', recentMsg.id)
                }
              }
            }

            if (!msgExists) {
              const { error: insErr } = await supabaseAdmin.from('messages').insert({
                user_id: userId,
                contact_id: contactId,
                content: text,
                direction: isFromMe ? 'outbound' : 'inbound',
                status: isFromMe ? 'sent' : 'delivered',
                client_id: messageId,
              })

              if (insErr) console.error('❌ Erro ao inserir nova mensagem no banco:', insErr)
              else console.log('✅ Nova mensagem persistida no banco com sucesso.')

              await supabaseAdmin.from('interaction_log').insert({
                user_id: userId,
                contact_id: contactId,
                type: 'whatsapp_receive',
                details: { text: text.substring(0, 50), isFromMe, messageId, eventType },
              })
            } else {
              console.log('⚠️ Mensagem ignorada (já existe ou recém-enviada por mim via painel).')
            }
          }
        }
      } catch (e) {
        console.error('❌ Erro interno processando mensagem:', e)
      }
    } else {
      console.log('ℹ️ Nenhum texto extraído ou evento não mapeado para inserção de conteúdo.')
    }

    return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: corsHeaders })
  } catch (err: any) {
    console.error('❌ ERRO GERAL NO WEBHOOK:', err)
    return new Response(JSON.stringify({ status: 'error', message: err.message }), {
      status: 200,
      headers: corsHeaders,
    })
  }
})
