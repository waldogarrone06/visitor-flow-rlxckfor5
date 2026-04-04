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

    // Extrair dados baseados em formatos comuns de API (Evolution, Z-API, Custom, WAPI)
    let sessionId = body.instance || body.sessionId || body.session || body.instanceId
    let phone =
      body.from || body.number || body.remoteJid || body.sender || body.data?.key?.remoteJid
    let text = body.text || body.body || body.content || ''
    let isFromMe = body.fromMe || false

    // Se "message" vier como string
    if (typeof body.message === 'string') {
      text = body.message
    } else if (body.message?.conversation) {
      text = body.message.conversation
    } else if (body.message?.extendedTextMessage?.text) {
      text = body.message.extendedTextMessage.text
    }

    // Formato específico Evolution API / Baileys (messages.upsert)
    if (body.event === 'messages.upsert' && body.data?.messages?.length > 0) {
      const msg = body.data.messages[0]
      sessionId = body.instance || sessionId
      phone = msg.key?.remoteJid?.split('@')[0] || phone
      isFromMe = msg.key?.fromMe || isFromMe
      text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || text
    } else if (body.data && body.data.key) {
      // Outro formato com data.key
      sessionId = body.instance || sessionId
      phone = body.data.key.remoteJid?.split('@')[0] || phone
      isFromMe = body.data.key.fromMe || isFromMe
      text = body.data.message?.conversation || body.data.message?.extendedTextMessage?.text || text
    }

    // Remover sufixo @s.whatsapp.net se vier no from
    if (typeof phone === 'string' && phone.includes('@')) {
      phone = phone.split('@')[0]
    }

    if (!phone || !text) {
      console.warn('Payload ignorado - campos ausentes:', { sessionId, phone, text, body })
      return new Response(
        JSON.stringify({
          success: true,
          warning: 'Missing fields',
          parsed: { sessionId, phone, text },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // Limpar o número para manter apenas os dígitos
    phone = String(phone).replace(/\D/g, '')

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

    // Fallback: se não achar a instância, ou ela não vier, tentar achar a primeira instância configurada
    // já que o cliente pode ter esquecido de configurar a instância igual na VPS e no painel.
    if (!userId) {
      console.warn(
        `Instância '${sessionId}' não encontrada ou não informada. Tentando fallback para primeira integração válida...`,
      )
      const { data: fallbackIntegration } = await supabaseAdmin
        .from('user_integrations')
        .select('user_id')
        .not('whatsapp_instance_id', 'is', null)
        .limit(1)
        .single()

      if (fallbackIntegration) {
        userId = fallbackIntegration.user_id
      } else {
        // Se nem isso, pega o primeiro usuário que tem alguma integração
        const { data: anyIntegration } = await supabaseAdmin
          .from('user_integrations')
          .select('user_id')
          .limit(1)
          .single()
        if (anyIntegration) {
          userId = anyIntegration.user_id
        } else {
          return new Response(
            JSON.stringify({
              error: 'Nenhum usuário configurado no sistema para associar a mensagem.',
            }),
            {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          )
        }
      }
    }

    // Buscar contato pelo número
    let { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('user_id', userId)
      .eq('phone', phone)
      .single()

    // Se contato não existe, vamos criá-lo
    if (!contact) {
      const { data: newContact, error: createError } = await supabaseAdmin
        .from('contacts')
        .insert({
          user_id: userId,
          phone: phone,
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

    // Inserir a mensagem no histórico
    if (contact) {
      const { error: insertError } = await supabaseAdmin.from('messages').insert({
        user_id: userId,
        contact_id: contact.id,
        content: text,
        direction: isFromMe ? 'outbound' : 'inbound',
      })

      if (insertError) {
        console.error('Erro ao salvar mensagem:', insertError)
        throw insertError
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
