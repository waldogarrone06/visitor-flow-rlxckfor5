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
    return new Response(JSON.stringify({ success: true, status: 'online' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // Apenas POST é permitido a partir daqui
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
    }

    // Ler body UMA única vez
    const data = await req.json().catch(() => ({}))

    // Log rápido (evita circular references)
    console.log('📥 Webhook recebido da Evolution API:', {
      event: data?.event || data?.messageType,
      instance: data?.instance || data?.sessionId || data?.instanceId,
      sender: data?.sender || data?.from || data?.remoteJid || data?.data?.key?.remoteJid,
    })

    let sessionId = data?.instance || data?.sessionId || data?.instanceId || 'unknown'
    let eventType = data?.event || data?.messageType || 'unknown'

    let phone = data?.sender || data?.from || data?.number || data?.remoteJid || ''
    if (!phone && data?.data) {
      phone =
        data.data.key?.remoteJid || data.data.remoteJid || data.data.from || data.data.sender || ''
    }

    if (typeof phone === 'string') phone = phone.split('@')[0]
    phone = String(phone).replace(/\D/g, '')

    const isSystemEvent =
      eventType.startsWith('connection') || eventType.startsWith('qrcode') || !phone

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    // Exemplo: salvar no Supabase via fetch (conforme sugerido)
    try {
      const insert = await fetch(`${supabaseUrl}/rest/v1/whatsapp_events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          instance: sessionId,
          message_type: eventType,
          remote_jid: phone || 'system',
          message: data || {},
        }),
      })

      if (!insert.ok) {
        console.error('Erro ao inserir whatsapp_event no banco:', await insert.text())
      }
    } catch (dbErr) {
      console.error('Erro DB (whatsapp_events):', dbErr)
    }

    // Se for evento do sistema, não roda lógica de contatos
    if (isSystemEvent) {
      return new Response(
        JSON.stringify({
          status: 'ok',
          handled: 'system_event',
          receivedAt: new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    })

    // Manage session_state
    try {
      const { data: session } = await supabaseAdmin
        .from('session_state')
        .select('current_step')
        .eq('phone', phone)
        .maybeSingle()
      if (!session) {
        await supabaseAdmin.from('session_state').insert({
          phone: phone,
          current_step: 'start',
          context: { first_interaction: new Date().toISOString() },
        })
      } else {
        await supabaseAdmin
          .from('session_state')
          .update({
            last_interaction: new Date().toISOString(),
          })
          .eq('phone', phone)
      }
    } catch (e) {
      console.error('Erro ao gerenciar session_state:', e)
    }

    let text = data?.body || data?.text || data?.content || ''
    if (!text && data?.data?.message?.conversation) text = data.data.message.conversation
    if (!text && data?.data?.message?.extendedTextMessage?.text)
      text = data.data.message.extendedTextMessage.text

    if (eventType === 'messages.upsert' || eventType === 'messages.update' || data?.data?.message) {
      let isFromMe = data?.data?.key?.fromMe || data?.data?.message?.key?.fromMe || false

      try {
        let userId = null
        const { data: integration } = await supabaseAdmin
          .from('user_integrations')
          .select('user_id')
          .eq('whatsapp_instance_id', sessionId)
          .maybeSingle()
        if (integration) userId = integration.user_id
        else {
          const { data: mainProfile } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .limit(1)
            .maybeSingle()
          if (mainProfile) userId = mainProfile.id
        }

        if (userId && text) {
          let { data: contact } = await supabaseAdmin
            .from('contacts')
            .select('id')
            .eq('user_id', userId)
            .eq('phone', phone)
            .maybeSingle()
          let contactId = contact?.id

          if (!contactId) {
            const { data: newContact } = await supabaseAdmin
              .from('contacts')
              .insert({ user_id: userId, phone: phone, name: `Contato (${phone})` })
              .select('id')
              .maybeSingle()
            if (newContact) contactId = newContact.id
          }

          if (contactId) {
            await supabaseAdmin.from('messages').insert({
              user_id: userId,
              contact_id: contactId,
              content: text,
              direction: isFromMe ? 'outbound' : 'inbound',
              status: 'delivered',
            })

            await supabaseAdmin.from('interaction_log').insert({
              user_id: userId,
              contact_id: contactId,
              type: 'whatsapp_receive',
              details: { text: text.substring(0, 50), isFromMe },
            })
          }
        }
      } catch (e) {
        console.error('Erro na lógica de contatos/mensagens:', e)
      }
    }

    // ❗ RETORNO OBRIGATÓRIO — sem isso → erro 500
    return new Response(JSON.stringify({ status: 'ok', receivedAt: new Date().toISOString() }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('❌ ERRO GERAL NA EDGE FUNCTION:', err)

    // Mesmo com erro, RETORNAR 200 evita retry infinito da Evolution
    return new Response(JSON.stringify({ status: 'error', message: String(err) }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
