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

    console.log('📥 Webhook Recebido (Payload Completo):', JSON.stringify(data, null, 2))

    const eventType = data?.event || data?.messageType || 'unknown'
    const payloadData = data?.data || data?.message || data
    const firstItem = Array.isArray(payloadData) ? payloadData[0] : payloadData

    const keyData = firstItem?.key || firstItem?.message?.key || data?.key || data?.data?.key || {}
    const msgData = firstItem?.message || firstItem

    let rawRemoteJid =
      keyData?.remoteJid || firstItem?.remoteJid || data?.sender || data?.from || data?.number || ''

    // Utilizar remoteJidAlt caso o principal seja um @lid e exista um número real no Alt
    const remoteJidAlt = keyData?.remoteJidAlt || firstItem?.remoteJidAlt
    if (
      typeof rawRemoteJid === 'string' &&
      rawRemoteJid.includes('@lid') &&
      typeof remoteJidAlt === 'string' &&
      remoteJidAlt.includes('@s.whatsapp.net')
    ) {
      rawRemoteJid = remoteJidAlt
    }

    if (typeof rawRemoteJid === 'string' && rawRemoteJid.includes('@g.us')) {
      return new Response(JSON.stringify({ status: 'ok', handled: 'group_message_ignored' }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    let phone = rawRemoteJid
    if (typeof phone === 'string') phone = phone.split('@')[0]
    if (typeof phone === 'string' && phone.includes(':')) phone = phone.split(':')[0]
    phone = String(phone).replace(/\D/g, '')

    console.log('🧩 Webhook Extraído:', JSON.stringify({ eventType, phone, rawRemoteJid }))

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
        instance: String(data?.instance || data?.sessionId || data?.instanceId || 'unknown').trim(),
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
          else console.log(`⚠️ Mensagem com ID ${messageId} não encontrada para atualizar status.`)
        } catch (e) {
          console.error('❌ Exceção ao atualizar status:', e)
        }
      }

      return new Response(JSON.stringify({ status: 'ok', handled: 'status_update' }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    // Processamento de Novas Mensagens
    let text =
      msgData?.conversation ||
      msgData?.extendedTextMessage?.text ||
      firstItem?.message?.conversation ||
      firstItem?.message?.extendedTextMessage?.text ||
      firstItem?.text ||
      data?.body ||
      data?.text ||
      data?.content ||
      ''

    if (!text) {
      if (msgData?.imageMessage || msgData?.message?.imageMessage)
        text =
          msgData?.imageMessage?.caption || msgData?.message?.imageMessage?.caption || '[Imagem]'
      else if (msgData?.videoMessage || msgData?.message?.videoMessage)
        text =
          msgData?.videoMessage?.caption || msgData?.message?.videoMessage?.caption || '[Vídeo]'
      else if (msgData?.audioMessage || msgData?.message?.audioMessage) text = '[Áudio]'
      else if (msgData?.documentMessage || msgData?.message?.documentMessage)
        text =
          msgData?.documentMessage?.fileName ||
          msgData?.message?.documentMessage?.fileName ||
          '[Documento]'
      else if (msgData?.stickerMessage || msgData?.message?.stickerMessage) text = '[Sticker]'
      else if (msgData?.contactMessage || msgData?.message?.contactMessage) text = '[Contato]'
    }

    let isFromMe = false
    if (keyData?.fromMe !== undefined) isFromMe = keyData.fromMe
    else if (firstItem?.fromMe !== undefined) isFromMe = firstItem.fromMe
    else if (data?.data?.fromMe !== undefined) isFromMe = data.data.fromMe
    else if (data?.fromMe !== undefined) isFromMe = data.fromMe

    let messageId =
      keyData?.id ||
      data?.messageId ||
      firstItem?.keyId ||
      firstItem?.id ||
      data?.data?.messageId ||
      null

    if ((eventType === 'messages.upsert' || eventType === 'messages.add') && text) {
      console.log(
        `💬 Processando nova mensagem [fromMe: ${isFromMe}, id: ${messageId}]: ${phone} -> ${text.substring(0, 30)}...`,
      )
      try {
        const sessionId = String(data?.instance || data?.sessionId || data?.instanceId || '').trim()
        let userId = null

        const searchInstances = [
          sessionId,
          data?.data?.instanceId,
          data?.instanceId,
          data?.instance,
        ]
          .filter(Boolean)
          .map((s) => String(s).trim().toLowerCase())

        console.log('🔍 Procurando user_id para as instâncias:', searchInstances)

        if (searchInstances.length > 0) {
          const { data: allIntegrations, error: intErr } = await supabaseAdmin
            .from('user_integrations')
            .select('user_id, whatsapp_instance_id')
            .not('whatsapp_instance_id', 'is', null)

          if (intErr) console.error('❌ Erro ao buscar integrações:', intErr)

          if (allIntegrations && allIntegrations.length > 0) {
            let match = allIntegrations.find((int) => {
              const dbInstance = String(int.whatsapp_instance_id).trim().toLowerCase()
              return searchInstances.includes(dbInstance)
            })

            if (!match) {
              match = allIntegrations.find((int) => {
                const dbInstance = String(int.whatsapp_instance_id).trim().toLowerCase()
                return searchInstances.some(
                  (s) =>
                    (s === 'junior' && dbInstance === 'jr') ||
                    (s === 'jr' && dbInstance === 'junior'),
                )
              })
            }

            if (!match) {
              match = allIntegrations.find((int) => {
                const dbInstance = String(int.whatsapp_instance_id).trim().toLowerCase()
                return searchInstances.some(
                  (s) =>
                    (dbInstance.length >= 3 && s.includes(dbInstance)) ||
                    (s.length >= 3 && dbInstance.includes(s)),
                )
              })
            }

            if (match) {
              userId = match.user_id
              console.log(
                `✅ Instância encontrada: ${match.whatsapp_instance_id}. User ID: ${userId}`,
              )
            }
          }
        }

        if (!userId) {
          console.log('⚠️ Nenhuma instância correspondente encontrada. Usando fallback seguro...')
          const { data: allConfigured } = await supabaseAdmin
            .from('user_integrations')
            .select('user_id')
            .not('whatsapp_instance_id', 'is', null)

          if (allConfigured && allConfigured.length === 1) {
            userId = allConfigured[0].user_id
            console.log(`✅ Fallback usado: Só existe 1 usuário configurado. User ID: ${userId}`)
          } else {
            const { data: mainProfile } = await supabaseAdmin
              .from('profiles')
              .select('id')
              .limit(1)
              .maybeSingle()
            if (mainProfile) userId = mainProfile.id
            console.log(`⚠️ Fallback genérico usado. User ID: ${userId}`)
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
            const pushName =
              firstItem?.pushName || data?.data?.pushName || data?.pushName || `Contato (${phone})`
            console.log(`👤 Criando novo contato para o phone ${phone}...`)
            const { data: newContact, error: createContactErr } = await supabaseAdmin
              .from('contacts')
              .insert({ user_id: userId, phone: phone, name: pushName })
              .select('id')
              .maybeSingle()
            if (newContact) contactId = newContact.id
            else if (createContactErr) console.error(`❌ Erro ao criar contato:`, createContactErr)
          }

          if (contactId) {
            let msgExists = false
            if (messageId) {
              const { data: existingMsg } = await supabaseAdmin
                .from('messages')
                .select('id')
                .eq('client_id', messageId)
                .maybeSingle()
              if (existingMsg) {
                msgExists = true
                console.log(`ℹ️ Mensagem com ID ${messageId} já existe. Ignorando insert.`)
              }
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
                console.log(
                  `ℹ️ Mensagem outbound idêntica encontrada nos últimos 30s. Atualizando client_id para ${messageId}.`,
                )
                if (!recentMsg.client_id && messageId) {
                  await supabaseAdmin
                    .from('messages')
                    .update({ client_id: messageId, status: 'sent' })
                    .eq('id', recentMsg.id)
                }
              }
            }

            if (!msgExists) {
              const msgPayload = {
                user_id: userId,
                contact_id: contactId,
                content: text,
                direction: isFromMe ? 'outbound' : 'inbound',
                status: isFromMe ? 'sent' : 'delivered',
                client_id: messageId,
              }

              console.log(
                `📝 Inserindo mensagem na tabela messages... payload:`,
                JSON.stringify(msgPayload),
              )

              const { data: insertedMsg, error: insErr } = await supabaseAdmin
                .from('messages')
                .insert(msgPayload)
                .select()
                .maybeSingle()

              if (insErr) {
                console.error('❌ Erro ao inserir nova mensagem no banco:', insErr)
              } else {
                console.log(
                  `✅ Nova mensagem persistida com sucesso no banco! ID: ${insertedMsg?.id}`,
                )
              }

              await supabaseAdmin.from('interaction_log').insert({
                user_id: userId,
                contact_id: contactId,
                type: 'whatsapp_receive',
                details: { text: text.substring(0, 50), isFromMe, messageId, eventType },
              })
            }
          } else {
            console.log(
              `⚠️ Não foi possível determinar ou criar contactId para o telefone ${phone}`,
            )
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
