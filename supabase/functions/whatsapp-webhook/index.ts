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
    const rawBodyText = await req.text().catch(() => '')
    let body: any = {}
    try {
      body = JSON.parse(rawBodyText || '{}')
    } catch (e) {}

    // Sanitizar log para evitar circular refs (como sugerido)
    const safeLog = JSON.stringify(body, (_, value) =>
      typeof value === 'object' && value !== null ? value : value,
    )

    console.log('📥 Webhook recebido da Evolution API:')
    console.log(safeLog)

    let sessionId = body.sessionId || body.instance || body.instanceId || 'unknown'
    let eventType = body.event || body.messageType || 'unknown'

    let phone = body.from || body.number || body.remoteJid || body.sender || ''
    if (!phone && body.data) {
      phone =
        body.data.key?.remoteJid || body.data.remoteJid || body.data.from || body.data.sender || ''
    }

    if (typeof phone === 'string') phone = phone.split('@')[0]
    phone = String(phone).replace(/\D/g, '')

    const isSystemEvent =
      eventType.startsWith('connection') || eventType.startsWith('qrcode') || !phone

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    })

    // ALWAYS log to whatsapp_events safely
    if (sessionId && eventType) {
      const { error: insertErr } = await supabaseAdmin.from('whatsapp_events').insert({
        instance: sessionId,
        remote_jid: phone || 'system',
        message_type: eventType,
        message: body || {},
      })
      if (insertErr) console.error('Failed to insert whatsapp_event:', insertErr)
    }

    // If it's a system event (like connection.update), skip contacts logic
    if (isSystemEvent) {
      return new Response(JSON.stringify({ success: true, handled: 'system_event' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Manage session_state
    const { data: session } = await supabaseAdmin
      .from('session_state')
      .select('current_step')
      .eq('phone', phone)
      .maybeSingle()
    if (!session) {
      await supabaseAdmin
        .from('session_state')
        .insert({
          phone: phone,
          current_step: 'start',
          context: { first_interaction: new Date().toISOString() },
        })
        .catch(() => {})
    } else {
      await supabaseAdmin
        .from('session_state')
        .update({
          last_interaction: new Date().toISOString(),
        })
        .eq('phone', phone)
        .catch(() => {})
    }

    let text = body.body || body.text || body.content || ''
    if (!text && body.data?.message?.conversation) text = body.data.message.conversation
    if (!text && body.data?.message?.extendedTextMessage?.text)
      text = body.data.message.extendedTextMessage.text

    if (eventType === 'messages.upsert' || eventType === 'messages.update' || body.data?.message) {
      let isFromMe = body.data?.key?.fromMe || body.data?.message?.key?.fromMe || false

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
          // Use maybeSingle to prevent crashing if insert fails
          const { data: newContact } = await supabaseAdmin
            .from('contacts')
            .insert({ user_id: userId, phone: phone, name: `Contato (${phone})` })
            .select('id')
            .maybeSingle()
          if (newContact) contactId = newContact.id
        }

        if (contactId) {
          await supabaseAdmin
            .from('messages')
            .insert({
              user_id: userId,
              contact_id: contactId,
              content: text,
              direction: isFromMe ? 'outbound' : 'inbound',
              status: 'delivered',
            })
            .catch(() => {})

          await supabaseAdmin
            .from('interaction_log')
            .insert({
              user_id: userId,
              contact_id: contactId,
              type: 'whatsapp_receive',
              details: { text: text.substring(0, 50), isFromMe },
            })
            .catch(() => {})
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('❌ ERRO NA EDGE FUNCTION:', error.message)

    // CRITICAL: Always return 200 to Evolution API so it doesn't enter a retry loop
    return new Response(
      JSON.stringify({
        error: true,
        message: error?.message,
        note: 'Error caught but returning 200 to prevent retries',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
