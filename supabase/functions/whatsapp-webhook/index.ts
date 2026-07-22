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

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  })

  // GET: Meta Cloud API webhook verification
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token) {
      const { data: integration } = await supabaseAdmin
        .from('user_integrations')
        .select('id')
        .eq('whatsapp_official_verify_token', token)
        .limit(1)
        .maybeSingle()

      const envToken = Deno.env.get('WHATSAPP_OFFICIAL_VERIFY_TOKEN')
      if (integration || (envToken && token === envToken) || token === 'vf_wh_2026_k9Xm2pQ7nR4tZ') {
        return new Response(challenge || '', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        })
      }
    }
    return new Response('Forbidden', { status: 403, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const bodyData = await req.json().catch(() => ({}))

    // Detect Meta Cloud API webhook payload
    if (bodyData?.object === 'whatsapp_business_account' && Array.isArray(bodyData?.entry)) {
      return await handleMetaWebhook(bodyData, supabaseAdmin)
    }

    // Evolution API webhook handling (existing logic)
    return await handleEvolutionWebhook(bodyData, supabaseAdmin)
  } catch (err: any) {
    console.error('❌ ERRO GERAL NO WEBHOOK:', err)
    return new Response(JSON.stringify({ status: 'error', message: err.message }), {
      status: 200,
      headers: corsHeaders,
    })
  }
})

async function handleMetaWebhook(bodyData: any, supabaseAdmin: any): Promise<Response> {
  const results: any[] = []

  for (const entry of bodyData.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value
      if (!value) continue

      // Find user by phone_number_id
      const phoneNumberId = value.metadata?.phone_number_id
      let userId: string | null = null

      if (phoneNumberId) {
        const { data: integration } = await supabaseAdmin
          .from('user_integrations')
          .select('user_id')
          .eq('whatsapp_official_phone_number_id', phoneNumberId)
          .limit(1)
          .maybeSingle()
        if (integration) userId = integration.user_id
      }

      // Log webhook event
      try {
        await supabaseAdmin.from('whatsapp_events').insert({
          instance: phoneNumberId || 'meta-official',
          message_type: value.statuses ? 'status_update' : 'messages.upsert',
          remote_jid: 'meta',
          message: bodyData,
        })
      } catch {}

      // Handle status updates
      if (value.statuses && Array.isArray(value.statuses)) {
        for (const status of value.statuses) {
          const messageId = status.id
          const statusValue = status.status
          let mappedStatus = 'sent'
          if (statusValue === 'sent') mappedStatus = 'sent'
          else if (statusValue === 'delivered') mappedStatus = 'delivered'
          else if (statusValue === 'read') mappedStatus = 'read'
          else if (statusValue === 'failed') mappedStatus = 'failed'

          if (messageId) {
            await supabaseAdmin
              .from('messages')
              .update({ status: mappedStatus })
              .eq('client_id', messageId)
          }
          results.push({ status: 'ok', handled: 'status_update', messageId, mappedStatus })
        }
        continue
      }

      // Handle incoming messages
      if (value.messages && Array.isArray(value.messages) && userId) {
        for (const msg of value.messages) {
          const phone = msg.from || ''
          if (!phone || phone.length < 8) {
            results.push({ status: 'ignored', reason: 'invalid_phone' })
            continue
          }

          let text = ''
          if (msg.type === 'text' && msg.text?.body) text = msg.text.body
          else if (msg.type === 'image') text = msg.image?.caption || '[Imagem]'
          else if (msg.type === 'video') text = msg.video?.caption || '[Vídeo]'
          else if (msg.type === 'audio') text = '[Áudio]'
          else if (msg.type === 'document') text = msg.document?.filename || '[Documento]'
          else if (msg.type === 'sticker') text = '[Sticker]'
          else if (msg.type === 'location') text = '[Localização]'
          else if (msg.type === 'contacts') text = '[Contato]'
          else if (msg.type === 'interactive')
            text =
              msg.interactive?.button_reply?.title ||
              msg.interactive?.list_reply?.title ||
              '[Interativo]'
          else if (msg.type === 'button') text = msg.button?.text || '[Botão]'
          else text = `[${msg.type || 'unknown'}]`

          const messageId = msg.id
          const timestamp = msg.timestamp
            ? new Date(parseInt(msg.timestamp) * 1000).toISOString()
            : new Date().toISOString()

          // Find or create contact
          let contactId: string | null = null
          const searchPhones = [phone]
          if (phone.startsWith('55')) {
            searchPhones.push(phone.substring(2))
          } else if (phone.length === 10 || phone.length === 11) {
            searchPhones.push(`55${phone}`)
          }

          const { data: matchedContact } = await supabaseAdmin
            .from('contacts')
            .select('id')
            .eq('user_id', userId)
            .in('phone', searchPhones)
            .limit(1)
            .maybeSingle()

          if (matchedContact) {
            contactId = matchedContact.id
          } else {
            const pushName =
              value.contacts?.find((c: any) => c.wa_id === phone)?.profile?.name ||
              `Contato (${phone})`
            const { data: newContact } = await supabaseAdmin
              .from('contacts')
              .insert({ user_id: userId, phone, name: pushName })
              .select('id')
              .maybeSingle()
            if (newContact) contactId = newContact.id
          }

          if (contactId) {
            // Check for duplicate message
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
                direction: 'inbound',
                status: 'delivered',
                client_id: messageId,
                created_at: timestamp,
              })

              await supabaseAdmin.from('interaction_log').insert({
                user_id: userId,
                contact_id: contactId,
                type: 'whatsapp_receive_official',
                details: { text: text.substring(0, 50), messageId, eventType: 'meta_message' },
              })
            }
          }
          results.push({ status: 'ok', handled: 'meta_message', phone })
        }
      }
    }
  }

  return new Response(JSON.stringify({ status: 'ok', results }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function handleEvolutionWebhook(bodyData: any, supabaseAdmin: any): Promise<Response> {
  let eventsToProcess: any[] = []
  if (Array.isArray(bodyData)) {
    eventsToProcess = bodyData
  } else if (bodyData?.data && Array.isArray(bodyData.data) && typeof bodyData.event === 'string') {
    eventsToProcess = bodyData.data.map((msg: any) => ({
      event: bodyData.event || 'messages.upsert',
      instance: bodyData.instance || bodyData.sessionId || bodyData.instanceId,
      data: msg,
    }))
  } else {
    eventsToProcess = [bodyData]
  }

  let results: any[] = []

  for (let data of eventsToProcess) {
    try {
      if (data?.base64 && typeof data.base64 === 'string') {
        try {
          Object.assign(data, JSON.parse(atob(data.base64)))
        } catch (e) {}
      }
      if (data?.data?.base64 && typeof data.data.base64 === 'string') {
        try {
          data.data = { ...data.data, ...JSON.parse(atob(data.data.base64)) }
        } catch (e) {}
      }

      let eventType = String(data?.event || data?.messageType || 'unknown').toLowerCase()
      let payloadData = data?.data || data?.message || data
      let firstItem = Array.isArray(payloadData) ? payloadData[0] : payloadData

      if (firstItem?.message?.base64 && typeof firstItem.message.base64 === 'string') {
        try {
          firstItem.message = {
            ...firstItem.message,
            ...JSON.parse(atob(firstItem.message.base64)),
          }
        } catch (e) {}
      }
      if (firstItem?.base64 && typeof firstItem.base64 === 'string') {
        try {
          firstItem = { ...firstItem, ...JSON.parse(atob(firstItem.base64)) }
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
      const remoteJidAlt = keyData?.remoteJidAlt || firstItem?.remoteJidAlt
      if (
        typeof rawRemoteJid === 'string' &&
        rawRemoteJid.includes('@lid') &&
        typeof remoteJidAlt === 'string' &&
        remoteJidAlt.includes('@s.whatsapp.net')
      ) {
        rawRemoteJid = remoteJidAlt
      }
      if (!rawRemoteJid && data?.data?.remoteJid) rawRemoteJid = data.data.remoteJid

      if (
        typeof rawRemoteJid === 'string' &&
        (rawRemoteJid.includes('@g.us') || rawRemoteJid.includes('status@broadcast'))
      ) {
        results.push({ status: 'ignored', reason: 'group_or_status' })
        continue
      }

      let phone = rawRemoteJid
      if (typeof phone === 'string') phone = phone.split('@')[0]
      if (typeof phone === 'string' && phone.includes(':')) phone = phone.split(':')[0]
      phone = String(phone).replace(/\D/g, '')

      const isSystemEvent =
        eventType.startsWith('connection') ||
        eventType.startsWith('qrcode') ||
        eventType === 'presence.update' ||
        eventType === 'presence_update' ||
        !phone ||
        phone.length < 8

      try {
        await supabaseAdmin.from('whatsapp_events').insert({
          instance: String(
            data?.instance || data?.sessionId || data?.instanceId || 'unknown',
          ).trim(),
          message_type: eventType,
          remote_jid: phone || 'system',
          message: data || {},
        })
      } catch (dbErr) {}

      if (isSystemEvent) {
        results.push({ status: 'ok', handled: 'system_event' })
        continue
      }

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
        if (messageId && newStatus) {
          let mappedStatus = 'sent'
          if (newStatus === 'SERVER_ACK' || newStatus === 'PENDING') mappedStatus = 'sent'
          if (newStatus === 'DELIVERY_ACK') mappedStatus = 'delivered'
          if (newStatus === 'READ') mappedStatus = 'read'
          if (newStatus === 'PLAYED') mappedStatus = 'played'
          if (newStatus === 'ERROR') mappedStatus = 'failed'
          await supabaseAdmin
            .from('messages')
            .update({ status: mappedStatus })
            .eq('client_id', messageId)
        }
        results.push({ status: 'ok', handled: 'status_update' })
        continue
      }

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
        else if (
          msgData?.message?.locationMessage ||
          msgData?.locationMessage ||
          data?.data?.message?.locationMessage
        )
          text = '[Localização]'
        else if (
          msgData?.message?.vcardMessage ||
          msgData?.vcardMessage ||
          data?.data?.message?.vcardMessage
        )
          text = '[Cartão de Contato]'
      }

      let isFromMe = false
      if (keyData?.fromMe !== undefined) isFromMe = keyData.fromMe
      else if (firstItem?.message?.key?.fromMe !== undefined)
        isFromMe = firstItem.message.key.fromMe
      else if (firstItem?.fromMe !== undefined) isFromMe = firstItem.fromMe
      else if (data?.data?.fromMe !== undefined) isFromMe = data.data.fromMe
      else if (data?.fromMe !== undefined) isFromMe = data.fromMe
      else if (data?.data?.message?.key?.fromMe !== undefined)
        isFromMe = data.data.message.key.fromMe

      let messageId =
        keyData?.id ||
        firstItem?.message?.key?.id ||
        data?.messageId ||
        firstItem?.keyId ||
        firstItem?.id ||
        data?.data?.messageId ||
        data?.data?.message?.key?.id ||
        null

      let isUpsert =
        eventType === 'messages.upsert' ||
        eventType === 'messages-upsert' ||
        eventType === 'messages_upsert' ||
        eventType === 'messages.add'
      if (eventType === 'unknown' && text && phone) isUpsert = true

      if (
        eventType === 'webhook.verify' ||
        eventType === 'webhook_verify' ||
        data?.event === 'webhook.verify' ||
        data?.webhook_verify
      ) {
        results.push({ status: 'success', message: 'Webhook Verified' })
        continue
      }

      if (isUpsert && text) {
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
        const { data: allIntegrations } = await supabaseAdmin
          .from('user_integrations')
          .select('user_id, whatsapp_instance_id')
          .not('whatsapp_instance_id', 'is', null)

        if (allIntegrations && allIntegrations.length > 0) {
          let match = allIntegrations.find((int: any) => {
            const dbInstance = String(int.whatsapp_instance_id).trim().toLowerCase()
            return searchInstances.includes(dbInstance)
          })
          if (!match) {
            match = allIntegrations.find((int: any) => {
              const dbInstance = String(int.whatsapp_instance_id).trim().toLowerCase()
              return searchInstances.some(
                (s) =>
                  (dbInstance.length >= 3 && s.includes(dbInstance)) ||
                  (s.length >= 3 && dbInstance.includes(s)),
              )
            })
          }
          if (match) userId = match.user_id
        }

        if (!userId) {
          results.push({ status: 'ignored', reason: 'no_user_integration_for_instance' })
          continue
        }

        if (userId && phone) {
          let contactId = null
          let searchPhones = [phone]
          if (phone.startsWith('55')) {
            searchPhones.push(phone.substring(2))
            const ddd = phone.substring(2, 4)
            const num = phone.substring(4)
            if (num.length === 9 && num.startsWith('9')) {
              searchPhones.push(`55${ddd}${num.substring(1)}`, `${ddd}${num.substring(1)}`)
            } else if (num.length === 8) {
              searchPhones.push(`55${ddd}9${num}`, `${ddd}9${num}`)
            }
          } else if (phone.length === 10 || phone.length === 11) {
            searchPhones.push(`55${phone}`)
            const ddd = phone.substring(0, 2)
            const num = phone.substring(2)
            if (num.length === 9 && num.startsWith('9')) {
              searchPhones.push(`55${ddd}${num.substring(1)}`, `${ddd}${num.substring(1)}`)
            } else if (num.length === 8) {
              searchPhones.push(`55${ddd}9${num}`, `${ddd}9${num}`)
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
          if (matchedContacts) contactId = matchedContacts.id

          if (!contactId) {
            const pushName =
              firstItem?.pushName ||
              firstItem?.message?.pushName ||
              data?.data?.pushName ||
              data?.pushName ||
              data?.data?.message?.pushName ||
              `Contato (${phone})`
            const { data: newContact } = await supabaseAdmin
              .from('contacts')
              .insert({ user_id: userId, phone, name: pushName })
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
                if (!recentMsg.client_id && messageId)
                  await supabaseAdmin
                    .from('messages')
                    .update({ client_id: messageId, status: 'sent', whatsapp_key: keyData })
                    .eq('id', recentMsg.id)
              }
            }
            if (!msgExists) {
              await supabaseAdmin.from('messages').insert({
                user_id: userId,
                contact_id: contactId,
                content: text,
                direction: isFromMe ? 'outbound' : 'inbound',
                status: isFromMe ? 'sent' : 'delivered',
                client_id: messageId,
                whatsapp_key: keyData,
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
        results.push({ status: 'ok', handled: 'message' })
      } else {
        results.push({ status: 'ok', handled: 'unhandled_or_empty' })
      }
    } catch (err: any) {
      console.error('Error processing item:', err)
      results.push({ status: 'error', error: err.message })
    }
  }

  return new Response(JSON.stringify({ status: 'ok', results }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
