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

  // Rota de Health Check para a Evolution API validar o webhook
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ success: true, status: 'online', mode: 'work-exchange' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
    }

    const data = await req.json().catch(() => ({}))

    console.log('📥 Work Exchange Event Recebido:', {
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

    // Usamos o Service Role Key para garantir gravação independente de sessão do usuário
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    })

    // 1. Salvar o evento bruto no Supabase para histórico e debug (Work Exchange Sync)
    try {
      const { error: insertErr } = await supabaseAdmin.from('whatsapp_events').insert({
        instance: sessionId,
        message_type: eventType,
        remote_jid: phone || 'system',
        message: data || {},
      })
      if (insertErr) console.error('Erro ao inserir whatsapp_event:', insertErr)
    } catch (dbErr) {
      console.error('Erro DB (whatsapp_events):', dbErr)
    }

    // Se for evento de sistema (qrcode, connection, etc), podemos encerrar aqui
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

    // 2. Gerenciamento de Sessão de Contato (Work Exchange State)
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

    // 3. Atualização de Status de Mensagem (Delivery, Read) - Atualização do Work Exchange
    if (eventType === 'messages.update') {
      let messageId = data?.data?.[0]?.key?.id || data?.data?.key?.id || null
      let newStatus = data?.data?.[0]?.update?.status || data?.data?.update?.status

      if (messageId && newStatus) {
        let mappedStatus = 'sent'
        if (newStatus === 'SERVER_ACK' || newStatus === 'PENDING') mappedStatus = 'sent'
        if (newStatus === 'DELIVERY_ACK') mappedStatus = 'delivered'
        if (newStatus === 'READ') mappedStatus = 'read'
        if (newStatus === 'PLAYED') mappedStatus = 'played'
        if (newStatus === 'ERROR') mappedStatus = 'failed'

        try {
          await supabaseAdmin
            .from('messages')
            .update({ status: mappedStatus })
            .eq('client_id', messageId)
        } catch (e) {
          console.error('Erro ao atualizar status da mensagem:', e)
        }
      }
    }

    // 4. Recebimento de Nova Mensagem ou Disparo Enviado
    let text = data?.body || data?.text || data?.content || ''
    if (!text && data?.data?.message?.conversation) text = data.data.message.conversation
    if (!text && data?.data?.message?.extendedTextMessage?.text)
      text = data.data.message.extendedTextMessage.text

    if ((eventType === 'messages.upsert' || data?.data?.message) && text) {
      let isFromMe = data?.data?.key?.fromMe || data?.data?.message?.key?.fromMe || false
      let messageId = data?.data?.key?.id || data?.data?.message?.key?.id || null

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

        if (userId && phone) {
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
            // Verifica se a mensagem já existe para não duplicar no upsert
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
                direction: isFromMe ? 'outbound' : 'inbound',
                status: isFromMe ? 'sent' : 'delivered',
                client_id: messageId,
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
      } catch (e) {
        console.error('Erro na lógica de contatos/mensagens:', e)
      }
    }

    // ❗ RETORNO OBRIGATÓRIO — sem isso a Evolution API entra em Retry (Loop Infinito)
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
