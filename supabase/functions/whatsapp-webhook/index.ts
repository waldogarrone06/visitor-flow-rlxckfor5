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

    // Handle global base64
    if (data?.base64 && typeof data.base64 === 'string') {
      try {
        const decoded = JSON.parse(atob(data.base64))
        Object.assign(data, decoded)
      } catch (e) {
        console.log('Base64 decode failed for data.base64')
      }
    }
    if (data?.data?.base64 && typeof data.data.base64 === 'string') {
      try {
        const decoded = JSON.parse(atob(data.data.base64))
        data.data = { ...data.data, ...decoded }
      } catch (e) {
        console.log('Base64 decode failed for data.data.base64')
      }
    }

    const eventType = String(data?.event || data?.messageType || 'unknown').toLowerCase()
    const payloadData = data?.data || data?.message || data
    let firstItem = Array.isArray(payloadData) ? payloadData[0] : payloadData

    if (firstItem?.message?.base64 && typeof firstItem.message.base64 === 'string') {
      try {
        const decoded = JSON.parse(atob(firstItem.message.base64))
        firstItem.message = { ...firstItem.message, ...decoded }
      } catch (e) {}
    }
    if (firstItem?.base64 && typeof firstItem.base64 === 'string') {
      try {
        const decoded = JSON.parse(atob(firstItem.base64))
        firstItem = { ...firstItem, ...decoded }
      } catch (e) {}
    }

    const keyData =
      firstItem?.key ||
      firstItem?.message?.key ||
      data?.key ||
      data?.data?.key ||
      data?.data?.message?.key ||
      {}
    let msgData = firstItem?.message || firstItem || data?.data?.message || {}

    if (typeof msgData === 'string') {
      try {
        msgData = JSON.parse(atob(msgData))
      } catch (e) {}
    }

    let rawRemoteJid =
      keyData?.remoteJid ||
      firstItem?.remoteJid ||
      data?.sender ||
      data?.from ||
      data?.number ||
      data?.data?.message?.key?.remoteJid ||
      data?.data?.key?.remoteJid ||
      ''

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

    // Fallback for some Evolution v2 payloads where data.key is missing
    if (!rawRemoteJid && data?.data?.remoteJid) {
      rawRemoteJid = data.data.remoteJid
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
      eventType === 'presence.update' ||
      eventType === 'presence_update' ||
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
    if (
      eventType === 'messages.update' ||
      eventType === 'messages-update' ||
      eventType === 'messages_update'
    ) {
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
      msgData?.message?.conversation ||
      msgData?.message?.extendedTextMessage?.text ||
      msgData?.conversation ||
      msgData?.extendedTextMessage?.text ||
      msgData?.text ||
      msgData?.textMessage?.text ||
      firstItem?.message?.message?.conversation ||
      firstItem?.message?.message?.extendedTextMessage?.text ||
      firstItem?.message?.conversation ||
      firstItem?.message?.extendedTextMessage?.text ||
      firstItem?.text ||
      firstItem?.textMessage?.text ||
      data?.data?.message?.message?.conversation ||
      data?.data?.message?.message?.extendedTextMessage?.text ||
      data?.data?.message?.conversation ||
      data?.data?.message?.extendedTextMessage?.text ||
      data?.data?.message?.text ||
      data?.data?.textMessage?.text ||
      data?.data?.text ||
      msgData?.message?.buttonsResponseMessage?.selectedDisplayText ||
      msgData?.message?.templateButtonReplyMessage?.selectedDisplayText ||
      msgData?.message?.listResponseMessage?.title ||
      msgData?.message?.interactiveResponseMessage?.body?.text ||
      msgData?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.name ||
      data?.body ||
      data?.text ||
      data?.content ||
      ''

    if (!text) {
      if (
        msgData?.message?.imageMessage ||
        msgData?.imageMessage ||
        data?.data?.message?.imageMessage
      )
        text =
          msgData?.message?.imageMessage?.caption ||
          msgData?.imageMessage?.caption ||
          data?.data?.message?.imageMessage?.caption ||
          '[Imagem]'
      else if (
        msgData?.message?.videoMessage ||
        msgData?.videoMessage ||
        data?.data?.message?.videoMessage
      )
        text =
          msgData?.message?.videoMessage?.caption ||
          msgData?.videoMessage?.caption ||
          data?.data?.message?.videoMessage?.caption ||
          '[Vídeo]'
      else if (
        msgData?.message?.audioMessage ||
        msgData?.audioMessage ||
        data?.data?.message?.audioMessage
      )
        text = '[Áudio]'
      else if (
        msgData?.message?.documentMessage ||
        msgData?.documentMessage ||
        data?.data?.message?.documentMessage
      )
        text =
          msgData?.message?.documentMessage?.fileName ||
          msgData?.documentMessage?.fileName ||
          data?.data?.message?.documentMessage?.fileName ||
          '[Documento]'
      else if (
        msgData?.message?.stickerMessage ||
        msgData?.stickerMessage ||
        data?.data?.message?.stickerMessage
      )
        text = '[Sticker]'
      else if (
        msgData?.message?.contactMessage ||
        msgData?.contactMessage ||
        data?.data?.message?.contactMessage
      )
        text = '[Contato]'
      else text = '[Mídia/Documento Recebido]'
    }

    let isFromMe = false
    if (keyData?.fromMe !== undefined) isFromMe = keyData.fromMe
    else if (firstItem?.message?.key?.fromMe !== undefined) isFromMe = firstItem.message.key.fromMe
    else if (firstItem?.fromMe !== undefined) isFromMe = firstItem.fromMe
    else if (data?.data?.fromMe !== undefined) isFromMe = data.data.fromMe
    else if (data?.fromMe !== undefined) isFromMe = data.fromMe
    else if (data?.data?.message?.key?.fromMe !== undefined) isFromMe = data.data.message.key.fromMe

    let messageId =
      keyData?.id ||
      firstItem?.message?.key?.id ||
      data?.messageId ||
      firstItem?.keyId ||
      firstItem?.id ||
      data?.data?.messageId ||
      data?.data?.message?.key?.id ||
      null

    console.log(
      `🔎 Extração de payload: isFromMe=${isFromMe}, id=${messageId}, text=${text?.substring(0, 30)}`,
    )

    const isUpsert =
      eventType === 'messages.upsert' ||
      eventType === 'messages-upsert' ||
      eventType === 'messages_upsert' ||
      eventType === 'messages.add'

    // Handle Webhook Verification from Evolution v2
    if (
      eventType === 'webhook.verify' ||
      eventType === 'webhook_verify' ||
      data?.event === 'webhook.verify' ||
      data?.webhook_verify
    ) {
      return new Response(JSON.stringify({ status: 'success', message: 'Webhook Verified' }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    if (isUpsert && text) {
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

        if (searchInstances.length > 0) {
          const { data: allIntegrations } = await supabaseAdmin
            .from('user_integrations')
            .select('user_id, whatsapp_instance_id')
            .not('whatsapp_instance_id', 'is', null)

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
                    (s === 'juliana' && dbInstance === 'ju') ||
                    (s === 'ju' && dbInstance === 'juliana') ||
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
            }
          }
        }

        if (!userId) {
          const { data: allConfigured } = await supabaseAdmin
            .from('user_integrations')
            .select('user_id')
            .not('whatsapp_instance_id', 'is', null)

          if (allConfigured && allConfigured.length === 1) {
            userId = allConfigured[0].user_id
          } else if (allConfigured && allConfigured.length > 1) {
            const { data: mainProfile } = await supabaseAdmin
              .from('profiles')
              .select('id')
              .eq('is_admin', true)
              .limit(1)
              .maybeSingle()
            if (mainProfile) userId = mainProfile.id
            else userId = allConfigured[0].user_id
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

          let searchPhones = [phone]

          if (phone.startsWith('55')) {
            searchPhones.push(phone.substring(2))
            const ddd = phone.substring(2, 4)
            const num = phone.substring(4)
            if (num.length === 9 && num.startsWith('9')) {
              searchPhones.push(`55${ddd}${num.substring(1)}`)
              searchPhones.push(`${ddd}${num.substring(1)}`)
            } else if (num.length === 8) {
              searchPhones.push(`55${ddd}9${num}`)
              searchPhones.push(`${ddd}9${num}`)
            }
          } else if (phone.length === 10 || phone.length === 11) {
            searchPhones.push(`55${phone}`)
            const ddd = phone.substring(0, 2)
            const num = phone.substring(2)
            if (num.length === 9 && num.startsWith('9')) {
              searchPhones.push(`55${ddd}${num.substring(1)}`)
              searchPhones.push(`${ddd}${num.substring(1)}`)
            } else if (num.length === 8) {
              searchPhones.push(`55${ddd}9${num}`)
              searchPhones.push(`${ddd}9${num}`)
            }
          }

          searchPhones = [...new Set(searchPhones)]

          const { data: matchedContacts } = await supabaseAdmin
            .from('contacts')
            .select('id')
            .eq('user_id', userId)
            .in('phone', searchPhones)
            .limit(1)
            .maybeSingle()

          if (matchedContacts) {
            contactId = matchedContacts.id
          }

          if (!contactId) {
            const pushName =
              firstItem?.pushName ||
              firstItem?.message?.pushName ||
              data?.data?.pushName ||
              data?.pushName ||
              data?.data?.message?.pushName ||
              `Contato (${phone})`
            console.log(`👤 Criando novo contato para o phone ${phone}... com nome: ${pushName}`)
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
      } catch (e: any) {
        console.error('❌ Erro interno processando mensagem:', e)
        try {
          await supabaseAdmin.from('whatsapp_events').insert({
            instance: String(
              data?.instance || data?.sessionId || data?.instanceId || 'unknown',
            ).trim(),
            message_type: 'processing.error',
            remote_jid: phone || 'system',
            message: { error: e.message, stack: e.stack, context: 'Error processing new message' },
          })
        } catch (err2) {}
      }
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
