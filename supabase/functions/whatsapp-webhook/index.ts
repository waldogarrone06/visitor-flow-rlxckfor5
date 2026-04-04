import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Health Check Endpoint (Diagnóstico para a VPS)
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
    // Leitura raw do body para logs detalhados e resiliência
    const rawBodyText = await req.text().catch(() => '')

    console.log('=== [WEBHOOK] NOVA REQUISIÇÃO RECEBIDA ===')
    console.log('Método:', req.method)
    console.log('URL:', req.url)
    console.log('Headers:', JSON.stringify(Object.fromEntries(req.headers.entries())))
    console.log('Raw Payload:', rawBodyText)

    let body: any = {}
    try {
      body = JSON.parse(rawBodyText || '{}')
    } catch (e) {
      console.warn('Payload recebido não é um JSON válido. Processando como objeto vazio.', e)
      body = {}
    }

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
      console.warn('Payload ignorado - impossível determinar telefone na requisição', body)
      return new Response(
        JSON.stringify({ success: true, warning: 'Missing phone', receivedPayload: body }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
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

    console.log('=== [WEBHOOK] PARSED DATA ===')
    console.log(`- SessionId: ${sessionId}`)
    console.log(`- Phone: ${phone}`)
    console.log(`- Text: ${text}`)
    console.log(`- IsFromMe: ${isFromMe}`)

    // 5. Remoção da Dependência de Sessão e Inicialização Resiliente do Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Variáveis de ambiente SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes.')
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: corsHeaders,
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Buscar usuário dono da integração
    let userId = null
    if (sessionId) {
      const { data: integration, error: intErr } = await supabaseAdmin
        .from('user_integrations')
        .select('user_id')
        .eq('whatsapp_instance_id', sessionId)
        .single()

      if (intErr) {
        console.warn(
          `Aviso: Instância '${sessionId}' não encontrada ou erro na busca:`,
          intErr.message,
        )
      } else if (integration) {
        userId = integration.user_id
      }
    }

    // Fallback de segurança
    if (!userId) {
      console.log(
        'Aplicando fallback para encontrar userId. Nenhuma instância correspondente encontrada.',
      )
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
      console.error('Nenhum usuário válido encontrado no sistema para registrar a mensagem.')
      return new Response(JSON.stringify({ error: 'Sistema não possui usuários configurados.' }), {
        status: 500,
        headers: corsHeaders,
      })
    }

    console.log(`Vinculando mensagem ao usuário ID: ${userId}`)

    // 6. Garantia de Persistência (Contatos e Mensagens)
    let { data: contact, error: contactErr } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('user_id', userId)
      .eq('phone', phone)
      .maybeSingle()

    if (contactErr) {
      console.error('Erro ao buscar contato:', contactErr)
    }

    let contactId = contact?.id

    if (!contactId) {
      console.log(`Criando novo contato para o telefone: ${phone}`)
      const { data: newContact, error: insertContactErr } = await supabaseAdmin
        .from('contacts')
        .insert({ user_id: userId, phone: phone, name: `Contato (${phone})` })
        .select('id')
        .single()

      if (insertContactErr) {
        console.error('Erro crítico ao inserir novo contato:', insertContactErr)
        throw insertContactErr
      }
      contactId = newContact.id
    }

    // Registrar mensagem
    console.log(`Inserindo mensagem na tabela messages...`)
    const { error: messageError } = await supabaseAdmin.from('messages').insert({
      user_id: userId,
      contact_id: contactId,
      content: text,
      direction: isFromMe ? 'outbound' : 'inbound',
      status: 'delivered',
    })

    if (messageError) {
      console.error('Erro crítico ao inserir mensagem:', messageError)
      throw messageError
    }

    console.log('=== [WEBHOOK] PROCESSAMENTO CONCLUÍDO COM SUCESSO ===')

    // 7. Retornar status message_received esperado pelo Visitor Flow
    return new Response(JSON.stringify({ success: true, status: 'message_received' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('=== [WEBHOOK] ERRO INTERNO ===')
    console.error(error)
    return new Response(JSON.stringify({ error: error.message || 'Erro interno no webhook' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
