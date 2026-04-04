import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

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

    // Extrair dados baseados em formatos comuns de API (Evolution, Z-API, Custom)
    let sessionId = body.instance || body.sessionId || body.session
    let phone = body.from || body.number || body.remoteJid || body.sender
    let text = body.text || body.message || body.body || body.content || ''
    let isFromMe = body.fromMe || false

    // Formato específico Evolution API / Baileys (messages.upsert)
    if (body.event === 'messages.upsert' && body.data?.messages?.length > 0) {
      const msg = body.data.messages[0]
      sessionId = body.instance
      phone = msg.key.remoteJid?.split('@')[0]
      isFromMe = msg.key.fromMe
      text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || text
    }

    if (!sessionId || !phone || !text) {
      console.warn('Payload ignorado - campos ausentes:', body)
      return new Response(JSON.stringify({ success: true, warning: 'Missing fields' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Limpar o número para manter apenas os dígitos
    phone = String(phone).replace(/\D/g, '')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    // Bypass RLS para inserção via webhook usando service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Buscar usuário associado a essa sessão
    const { data: integration, error: intError } = await supabaseAdmin
      .from('user_integrations')
      .select('user_id')
      .eq('whatsapp_instance_id', sessionId)
      .single()

    if (intError || !integration) {
      console.error(`Instância ${sessionId} não encontrada.`)
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userId = integration.user_id

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
