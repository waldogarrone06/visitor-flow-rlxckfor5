import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  })

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

    if (bodyData?.object !== 'whatsapp_business_account' || !Array.isArray(bodyData?.entry)) {
      return new Response(JSON.stringify({ status: 'ignored' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results: any[] = []

    for (const entry of bodyData.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value
        if (!value) continue

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

        try {
          await supabaseAdmin.from('whatsapp_events').insert({
            instance: phoneNumberId || 'meta-official',
            message_type: value.statuses ? 'message_status' : 'messages',
            remote_jid: 'meta',
            message: bodyData,
          })
        } catch {}

        if (value.statuses && Array.isArray(value.statuses)) {
          for (const status of value.statuses) {
            const messageId = status.id
            const statusValue = status.status
            let mappedStatus = 'sent'
            if (statusValue === 'delivered') mappedStatus = 'delivered'
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

            const searchPhones = [phone]
            if (phone.startsWith('55')) searchPhones.push(phone.substring(2))
            else if (phone.length === 10 || phone.length === 11) searchPhones.push(`55${phone}`)

            const { data: matchedContact } = await supabaseAdmin
              .from('contacts')
              .select('id')
              .eq('user_id', userId)
              .in('phone', searchPhones)
              .limit(1)
              .maybeSingle()

            let contactId: string | null = null

            if (matchedContact) {
              contactId = matchedContact.id
              await supabaseAdmin
                .from('contacts')
                .update({ last_inbound_at: timestamp })
                .eq('id', contactId)
            } else {
              const pushName =
                value.contacts?.find((c: any) => c.wa_id === phone)?.profile?.name ||
                `Contato (${phone})`
              const { data: newContact } = await supabaseAdmin
                .from('contacts')
                .insert({
                  user_id: userId,
                  phone,
                  name: pushName,
                  last_inbound_at: timestamp,
                })
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
                  details: {
                    text: text.substring(0, 50),
                    messageId,
                    eventType: 'meta_message',
                  },
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
  } catch (err: any) {
    console.error('Error in meta-webhook:', err)
    return new Response(JSON.stringify({ status: 'error', message: err.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
