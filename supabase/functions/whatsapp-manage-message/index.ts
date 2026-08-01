import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing environment variables')
    }

    const authHeader = req.headers.get('Authorization') || ''
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    })

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const { data: integration } = await supabaseAdmin
      .from('user_integrations')
      .select(
        'whatsapp_instance_id, whatsapp_api_token, whatsapp_api_url, primary_provider, whatsapp_provider_type, whatsapp_official_phone_number_id, whatsapp_official_waba_id, whatsapp_official_access_token',
      )
      .eq('user_id', user.id)
      .maybeSingle()

    if (!integration?.whatsapp_instance_id || !integration?.whatsapp_api_token) {
      return new Response(JSON.stringify({ error: 'WhatsApp not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { action, id, fromMe, remoteJid, text, to, messageId, newContent } = body

    const apiUrl = integration.whatsapp_api_url || 'https://api.evolution.com'

    if (action === 'delete') {
      const payloadId = id || messageId
      if (!payloadId || fromMe === undefined || !remoteJid) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields for deletion (id, fromMe, remoteJid)' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      const evolutionPayload = {
        key: {
          id: payloadId,
          fromMe: fromMe,
          remoteJid: remoteJid,
        },
      }

      const response = await fetch(
        `${apiUrl}/chat/deleteMessage/${integration.whatsapp_instance_id}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: integration.whatsapp_api_token,
          },
          body: JSON.stringify(evolutionPayload),
        },
      )

      if (!response.ok) {
        const err = await response.text()
        console.error('Evolution API error:', err)
        return new Response(JSON.stringify({ error: 'Failed to delete message on WhatsApp' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'edit') {
      const payloadId = id || messageId
      const targetPhone = remoteJid?.split('@')[0] || to
      const contentToUpdate = newContent || text

      const response = await fetch(
        `${apiUrl}/chat/editMessage/${integration.whatsapp_instance_id}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: integration.whatsapp_api_token,
          },
          body: JSON.stringify({
            number: targetPhone,
            messageId: payloadId,
            text: contentToUpdate,
            key: {
              id: payloadId,
              remoteJid: remoteJid || `${targetPhone}@s.whatsapp.net`,
              fromMe: fromMe !== undefined ? fromMe : true,
            },
            message: {
              conversation: contentToUpdate,
            },
          }),
        },
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Evolution API edit error:', errorText)
        let parsedError = errorText
        try {
          parsedError = JSON.parse(errorText)
        } catch (e) {}
        return new Response(
          JSON.stringify({ error: 'Failed to edit message on WhatsApp', details: parsedError }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
