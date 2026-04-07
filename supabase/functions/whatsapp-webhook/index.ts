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
    return new Response(
      JSON.stringify({
        success: true,
        status: 'online',
        message: 'Webhook is alive and reachable from VPS',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const rawBodyText = await req.text().catch(() => '')

    console.log('=== [WEBHOOK] NOVA REQUISIÇÃO RECEBIDA ===')
    console.log('Raw Payload:', rawBodyText)

    let body: any = {}
    try {
      body = JSON.parse(rawBodyText || '{}')
    } catch (e) {
      console.warn('Payload não é JSON válido.')
      body = {}
    }

    let sessionId = body.sessionId || body.instance || body.session || body.instanceId

    let phone = body.from || body.number || body.remoteJid || body.sender || ''
    if (!phone && body.data) {
      phone =
        body.data.key?.remoteJid || body.data.remoteJid || body.data.from || body.data.sender || ''
      if (!phone && body.data.message?.key?.remoteJid) {
        phone = body.data.message.key.remoteJid
      }
      if (!phone && body.data.message?.remoteJid) {
        phone = body.data.message.remoteJid
      }
    }
    if (!phone && body.message) {
      phone = body.message.from || body.message.key?.remoteJid || ''
    }

    if (typeof phone === 'string') {
      phone = phone.split('@')[0]
    }

    phone = String(phone).replace(/\D/g, '')

    if (!phone) {
      console.warn('Payload ignorado - sem telefone', body)
      return new Response(JSON.stringify({ success: true, warning: 'Missing phone' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (phone.length === 10 || phone.length === 11) {
      phone = '55' + phone
    }

    let text = body.body || body.text || body.content || ''
    if (!text && typeof body.message === 'string') {
      text = body.message
    }

    if (!text && body.classification) {
      text = `[Mensagem ${body.classification}]`
    }

    const extractDeep = (msg: any): string => {
      if (!msg) return ''
      if (typeof msg === 'string') return msg
      if (msg.message) return extractDeep(msg.message)
      if (msg.text) return typeof msg.text === 'string' ? msg.text : extractDeep(msg.text)
      if (msg.body) return typeof msg.body === 'string' ? msg.body : extractDeep(msg.body)
      if (msg.conversation) return msg.conversation
      if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text
      if (msg.imageMessage) return msg.imageMessage.caption || '[Imagem]'
      if (msg.videoMessage) return msg.videoMessage.caption || '[Vídeo]'
      if (msg.audioMessage) return '[Áudio]'
      if (msg.documentMessage) return msg.documentMessage.title || '[Documento]'
      if (msg.stickerMessage) return '[Sticker]'
      return ''
    }

    if (!text) {
      text = extractDeep(body.message || body.data?.message)
    }

    if (!text || text.trim() === '') {
      text = '[mensagem sem texto ou mídia não identificada]'
    }

    if (
      body.action === 'echo' ||
      body.type === 'echo' ||
      body.event === 'connection.update' ||
      body.event === 'presence.update' ||
      body.event === 'contacts.update' ||
      body.event === 'messages.update' ||
      body.echo === true ||
      text.trim().toLowerCase() === '/echo'
    ) {
      console.log('=== [WEBHOOK] EVENTO DE SISTEMA/ECHO IGNORADO ===')
      return new Response(
        JSON.stringify({
          success: true,
          message: 'System event ignored or Echo test successful.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    let isFromMe =
      body.fromMe === true ||
      body.id?.fromMe === true ||
      body.message?.fromMe === true ||
      body.message?.key?.fromMe === true ||
      body.data?.key?.fromMe === true ||
      body.data?.message?.key?.fromMe === true ||
      body.direction === 'outbound' ||
      false

    if (body.data?.key?.fromMe !== undefined) {
      isFromMe = body.data.key.fromMe
    } else if (body.data?.message?.key?.fromMe !== undefined) {
      isFromMe = body.data.message.key.fromMe
    } else if (body.data?.fromMe !== undefined) {
      isFromMe = body.data.fromMe
    }

    console.log('=== [WEBHOOK] PARSED DATA ===')
    console.log(`- SessionId: ${sessionId}`)
    console.log(`- Phone: ${phone}`)
    console.log(`- Text: ${text}`)
    console.log(`- IsFromMe: ${isFromMe}`)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Variáveis de ambiente ausentes.')
      return new Response(JSON.stringify({ error: 'Server config error' }), {
        status: 500,
        headers: corsHeaders,
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Localiza o usuário específico mapeado com base na Instância que recebeu o evento
    let userId = null
    if (sessionId) {
      const { data: integration } = await supabaseAdmin
        .from('user_integrations')
        .select('user_id')
        .eq('whatsapp_instance_id', sessionId)
        .maybeSingle()

      if (integration) {
        userId = integration.user_id
      }
    }

    // Fallback: Se não encontrou por sessionId, atrela ao admin ou a primeira conta disponível
    if (!userId) {
      const { data: mainProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', 'wal@fourlabnutri.com.br')
        .maybeSingle()

      if (mainProfile) {
        userId = mainProfile.id
      } else {
        const { data: anyProfile } = await supabaseAdmin.from('profiles').select('id').limit(1)
        if (anyProfile && anyProfile.length > 0) {
          userId = anyProfile[0].id
        }
      }
    }

    if (!userId) {
      console.error('Nenhum usuário válido encontrado para registrar mensagem.')
      return new Response(JSON.stringify({ error: 'No user configured' }), {
        status: 500,
        headers: corsHeaders,
      })
    }

    let { data: contact, error: contactErr } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('user_id', userId)
      .eq('phone', phone)
      .maybeSingle()

    let contactId = contact?.id

    if (!contactId) {
      const { data: newContact, error: insertContactErr } = await supabaseAdmin
        .from('contacts')
        .insert({ user_id: userId, phone: phone, name: `Contato (${phone})` })
        .select('id')
        .single()

      if (insertContactErr) throw insertContactErr
      contactId = newContact.id
    }

    const messagePayload: any = {
      user_id: userId,
      contact_id: contactId,
      content: text,
      direction: isFromMe ? 'outbound' : 'inbound',
      status: 'delivered',
    }

    const msgTimestamp =
      body.timestamp ||
      body.message?.timestamp ||
      body.data?.messageTimestamp ||
      body.data?.message?.messageTimestamp
    if (msgTimestamp) {
      try {
        let parsedDate: Date
        if (typeof msgTimestamp === 'number') {
          parsedDate = new Date(msgTimestamp * (msgTimestamp < 10000000000 ? 1000 : 1))
        } else {
          parsedDate = new Date(msgTimestamp)
        }
        if (!isNaN(parsedDate.getTime())) {
          messagePayload.created_at = parsedDate.toISOString()
        }
      } catch (e) {}
    }

    const { error: messageError } = await supabaseAdmin.from('messages').insert(messagePayload)

    if (messageError) throw messageError

    return new Response(JSON.stringify({ success: true, status: 'message_received' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('=== [WEBHOOK] ERRO INTERNO ===', error)
    return new Response(JSON.stringify({ error: error.message || 'Erro interno no webhook' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
