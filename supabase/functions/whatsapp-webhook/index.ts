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

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    console.log('WEBHOOK RECEBIDO:', JSON.stringify(body, null, 2))

    // Ignorar eventos que não são de mensagens se identificáveis (para evitar poluir o banco e logs)
    if (body.event && body.event !== 'messages.upsert' && !body.event.includes('message')) {
      console.warn(`Payload ignorado - evento não é de mensagem (${body.event})`)
      return new Response(JSON.stringify({ success: true, warning: 'Non-message event ignored' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Extrair dados baseados em formatos comuns de API (Evolution, Z-API, Custom, WAPI)
    let sessionId =
      body.instance ||
      body.sessionId ||
      body.session ||
      body.instanceId ||
      body.instance_name ||
      'Jr'

    let phone = body.from || body.number || body.remoteJid || body.sender || body.phone || ''
    if (!phone && body.data) {
      phone =
        body.data.remoteJid ||
        body.data.from ||
        body.data.sender ||
        body.data.key?.remoteJid ||
        body.data.message?.key?.remoteJid ||
        ''
    }
    if (!phone && body.message) {
      phone = body.message.from || body.message.key?.remoteJid || ''
    }
    if (!phone && body.messages && body.messages.length > 0) {
      phone = body.messages[0].from || body.messages[0].key?.remoteJid || ''
    }

    let text = body.text || body.body || body.content || ''
    let isFromMe =
      body.fromMe === true ||
      body.isFromMe === true ||
      body.direction === 'outbound' ||
      body.key?.fromMe ||
      body.data?.key?.fromMe ||
      body.data?.fromMe ||
      false

    const extractTextFromMessage = (msg: any): string => {
      if (!msg) return ''
      if (typeof msg === 'string') return msg

      if (msg.text)
        return typeof msg.text === 'string' ? msg.text : extractTextFromMessage(msg.text)
      if (msg.body)
        return typeof msg.body === 'string' ? msg.body : extractTextFromMessage(msg.body)
      if (msg.content)
        return typeof msg.content === 'string' ? msg.content : extractTextFromMessage(msg.content)

      if (msg.conversation) return msg.conversation
      if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text
      if (msg.imageMessage) return msg.imageMessage.caption || '[Imagem]'
      if (msg.videoMessage) return msg.videoMessage.caption || '[Vídeo]'
      if (msg.audioMessage) return '[Áudio]'
      if (msg.documentMessage)
        return msg.documentMessage.title || msg.documentMessage.fileName || '[Documento]'
      if (msg.stickerMessage) return '[Sticker]'
      if (msg.contactMessage) return '[Contato]'
      if (msg.locationMessage) return '[Localização]'
      if (msg.protocolMessage) return '[Mensagem Apagada/Protocolo]'
      if (
        msg.buttonsResponseMessage ||
        msg.templateButtonReplyMessage ||
        msg.interactiveResponseMessage ||
        msg.listResponseMessage
      )
        return '[Resposta Interativa]'

      return ''
    }

    let msgObj = body.message || body.data?.message || (body.messages && body.messages[0]?.message)

    // Formato específico Evolution API / Baileys (messages.upsert)
    if (body.event === 'messages.upsert' && body.data) {
      const msg = body.data.message || (body.data.messages && body.data.messages[0])
      if (msg) {
        sessionId = body.instance || sessionId
        phone = msg.key?.remoteJid || phone
        isFromMe = msg.key?.fromMe ?? isFromMe
        msgObj = msg.message || msgObj
      }
    } else if (body.data && body.data.key) {
      sessionId = body.instance || sessionId
      phone = body.data.key.remoteJid || phone
      isFromMe = body.data.key.fromMe ?? isFromMe
      msgObj = body.data.message || msgObj
    }

    if (!text && msgObj) {
      text = extractTextFromMessage(msgObj)
    }

    // Fallbacks baseados em 'type' genérico
    if (!text && body.type) {
      if (body.type === 'chat' || body.type === 'text') text = body.body || body.text || ''
      else if (body.type === 'image' || body.type === 'photo') text = body.caption || '[Imagem]'
      else if (body.type === 'video') text = body.caption || '[Vídeo]'
      else if (body.type === 'audio' || body.type === 'ptt') text = '[Áudio]'
      else if (body.type === 'document') text = body.fileName || '[Documento]'
      else if (body.type === 'sticker') text = '[Sticker]'
      else if (body.type === 'location') text = '[Localização]'
      else if (body.type === 'vcard' || body.type === 'contact') text = '[Contato]'
    }

    if (!text && typeof body === 'object') {
      if (body.message && typeof body.message === 'string') text = body.message
    }

    // Se ainda não houver texto, mas for uma mensagem identificada
    if (!text && phone) {
      text = '[Mídia/Outros]'
    }

    // Remover sufixo @s.whatsapp.net se vier no from ou remoteJid
    if (typeof phone === 'string' && phone.includes('@')) {
      if (phone.includes('@g.us')) {
        console.log('Mensagem de grupo ignorada:', phone)
        return new Response(JSON.stringify({ success: true, warning: 'Group message ignored' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (phone.includes('status@broadcast')) {
        console.log('Mensagem de status ignorada:', phone)
        return new Response(JSON.stringify({ success: true, warning: 'Status message ignored' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      phone = phone.split('@')[0]
    }

    if (!phone || !text) {
      console.warn('Payload ignorado - campos ausentes (não é mensagem reconhecida):', {
        sessionId,
        phone,
        text,
        body: JSON.stringify(body).substring(0, 200),
      })
      return new Response(JSON.stringify({ success: true, warning: 'Missing fields' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Limpar o número para manter apenas os dígitos
    phone = String(phone).replace(/\D/g, '')

    // Garantir DDI consistente (assumindo 55 para números BR sem DDI)
    if (phone.length === 10 || phone.length === 11) {
      phone = '55' + phone
    }

    // Tratar possível ausência do 9º dígito em números BR para evitar contatos duplicados
    let alternativePhone = phone
    if (phone.startsWith('55') && phone.length === 13) {
      // De 55 11 99999 9999 para 55 11 9999 9999
      alternativePhone = phone.substring(0, 4) + phone.substring(5)
    } else if (phone.startsWith('55') && phone.length === 12) {
      // De 55 11 9999 9999 para 55 11 9 9999 9999
      alternativePhone = phone.substring(0, 4) + '9' + phone.substring(4)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    // Bypass RLS para inserção via webhook usando service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    let userId = null

    // Buscar usuário associado a essa sessão
    if (sessionId) {
      const { data: integration } = await supabaseAdmin
        .from('user_integrations')
        .select('user_id')
        .eq('whatsapp_instance_id', sessionId)
        .single()

      if (integration) {
        userId = integration.user_id
      }
    }

    // Fallback: se não encontrar pela sessionId exata ou se não vier sessionId,
    // como a maioria dos usuários só tem 1 instância conectada, vamos tentar buscar a primeira ativa
    // para não perder a mensagem em caso de falha de nomenclatura no webhook.
    if (!userId) {
      const { data: activeIntegrations } = await supabaseAdmin
        .from('user_integrations')
        .select('user_id')
        .not('whatsapp_instance_id', 'is', null)
        .limit(1)

      if (activeIntegrations && activeIntegrations.length > 0) {
        userId = activeIntegrations[0].user_id
        console.log(
          `Fallback ativado: Usando o primeiro usuário com integração WhatsApp configurada: ${userId}`,
        )
      }
    }

    if (!userId) {
      console.warn(`Nenhuma instância de WhatsApp configurada no sistema. Ignorando mensagem.`)
      return new Response(
        JSON.stringify({ error: 'Sistema não possui integrações de WhatsApp configuradas.' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // Buscar contato pelo número (considerando variações do 9º dígito)
    let { data: contacts } = await supabaseAdmin
      .from('contacts')
      .select('id, phone')
      .eq('user_id', userId)
      .in('phone', [phone, alternativePhone])
      .order('created_at', { ascending: true })
      .limit(1)

    let contact = contacts && contacts.length > 0 ? contacts[0] : null

    // Se contato não existe, vamos criá-lo
    if (!contact) {
      const { data: newContact, error: createError } = await supabaseAdmin
        .from('contacts')
        .insert({
          user_id: userId,
          phone: phone, // Usa o número original que chegou no webhook
          name: `Novo Contato (${phone})`,
        })
        .select()
        .single()

      if (createError) {
        console.error('Erro ao criar contato:', createError)
        throw createError
      }
      contact = newContact
    }

    // Identificador único da mensagem originada na API (para evitar duplicidade de webhooks ou conciliação)
    const clientId =
      body.data?.messages?.[0]?.key?.id ||
      body.data?.message?.key?.id ||
      body.data?.key?.id ||
      body.messageId ||
      body.id ||
      null

    if (contact) {
      let isDuplicate = false

      if (clientId) {
        const { data: existingMsg } = await supabaseAdmin
          .from('messages')
          .select('id')
          .eq('client_id', clientId)
          .single()

        if (existingMsg) isDuplicate = true
      }

      if (!isDuplicate && isFromMe) {
        // Para mensagens outbound (enviadas por nós), verificar se já salvamos nos últimos 15 segundos (via UI/API)
        // para evitar eco do provedor duplicando a mensagem
        const fifteenSecondsAgo = new Date(Date.now() - 15000).toISOString()
        const { data: recentOutbound } = await supabaseAdmin
          .from('messages')
          .select('id')
          .eq('contact_id', contact.id)
          .eq('direction', 'outbound')
          .eq('content', text)
          .gte('created_at', fifteenSecondsAgo)
          .limit(1)

        if (recentOutbound && recentOutbound.length > 0) {
          isDuplicate = true
          // Podemos apenas atualizar o status ou client_id da existente
          await supabaseAdmin
            .from('messages')
            .update({ client_id: clientId, status: 'delivered' })
            .eq('id', recentOutbound[0].id)
        }
      }

      if (!isDuplicate) {
        const { error: insertError } = await supabaseAdmin.from('messages').insert({
          user_id: userId,
          contact_id: contact.id,
          content: text,
          direction: isFromMe ? 'outbound' : 'inbound',
          client_id: clientId,
          status: 'delivered',
        })

        if (insertError) {
          console.error('Erro ao salvar mensagem:', insertError)
          throw insertError
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Erro interno no webhook:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
