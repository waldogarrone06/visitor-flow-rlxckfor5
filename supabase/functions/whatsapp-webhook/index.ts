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

    // 1. Extrair sessionId (necessário para vincular ao usuário correto)
    let sessionId = body.sessionId || body.instance || body.session || body.instanceId || 'Jr'

    // 2. Extrair phone (from) ignorando estruturas complexas
    let phone = body.from || body.number || body.remoteJid || body.sender || ''
    if (!phone && body.data) {
      phone = body.data.remoteJid || body.data.from || body.data.sender || ''
    }
    if (!phone && body.message) {
      phone = body.message.from || ''
    }

    // 3. Normalização de Identificação (from)
    if (typeof phone === 'string') {
      // Remove @c.us, @g.us, etc. para garantir número limpo
      phone = phone.split('@')[0]
    }

    // Remove tudo que não for dígito
    phone = String(phone).replace(/\D/g, '')

    if (!phone) {
      console.warn('Payload ignorado - impossível determinar telefone', body)
      return new Response(JSON.stringify({ success: true, warning: 'Missing phone' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Adiciona 55 se for número BR sem DDI para evitar contatos duplicados
    if (phone.length === 10 || phone.length === 11) {
      phone = '55' + phone
    }

    // 4. Extrair conteúdo da mensagem (text/body)
    let text = body.body || body.text || body.content || ''
    if (!text && typeof body.message === 'string') {
      text = body.message
    }

    // Tratamento específico para payload de listeners externos (ex: listener-growth)
    if (!text && body.classification) {
      text = `[Mensagem ${body.classification}]`
    }

    // Extração profunda (mídias, botoes, conversa) caso ainda não tenha texto
    const extractDeep = (msg: any): string => {
      if (!msg) return ''
      if (typeof msg === 'string') return msg
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

    // Fallback final para garantir a persistência da mensagem mesmo vazia
    if (!text || text.trim() === '') {
      text = '[mensagem sem texto]'
    }

    const isFromMe = body.fromMe === true || body.direction === 'outbound' || false

    // 5. Remoção da Dependência de Sessão (Usando Service Role)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Buscar usuário dono da integração
    let userId = null
    if (sessionId) {
      const { data: integration } = await supabaseAdmin
        .from('user_integrations')
        .select('user_id')
        .eq('whatsapp_instance_id', sessionId)
        .single()

      if (integration) userId = integration.user_id
    }

    // Fallback de segurança
    if (!userId) {
      const { data: fallbackInteg } = await supabaseAdmin
        .from('user_integrations')
        .select('user_id')
        .not('whatsapp_instance_id', 'is', null)
        .limit(1)
      if (fallbackInteg && fallbackInteg.length > 0) {
        userId = fallbackInteg[0].user_id
      } else {
        const { data: admin } = await supabaseAdmin.from('profiles').select('id').limit(1)
        if (admin && admin.length > 0) userId = admin[0].id
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Sistema não possui usuários configurados.' }), {
        status: 500,
        headers: corsHeaders,
      })
    }

    // 6. Garantia de Persistência (Contatos e Mensagens)
    let { data: contact } = await supabaseAdmin
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

    // Registrar mensagem
    const { error: messageError } = await supabaseAdmin.from('messages').insert({
      user_id: userId,
      contact_id: contactId,
      content: text,
      direction: isFromMe ? 'outbound' : 'inbound',
      status: 'delivered',
    })

    if (messageError) throw messageError

    // 7. Retornar status message_received esperado pelo Visitor Flow
    return new Response(JSON.stringify({ success: true, status: 'message_received' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Erro interno no webhook:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
