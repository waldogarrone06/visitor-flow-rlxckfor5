import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing environment variables')
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: req.headers.get('Authorization')! },
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

    const body = await req.json().catch(() => ({}))
    const { messageId, whatsappKey } = body

    if (!messageId || !whatsappKey) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('whatsapp_instance_id, whatsapp_api_token, whatsapp_api_url')
      .eq('user_id', user.id)
      .single()

    if (
      !integration?.whatsapp_instance_id ||
      !integration?.whatsapp_api_token ||
      !integration?.whatsapp_api_url
    ) {
      return new Response(JSON.stringify({ error: 'WhatsApp integration not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiUrl = integration.whatsapp_api_url.replace(/\/+$/, '')
    const instanceId = integration.whatsapp_instance_id

    const response = await fetch(`${apiUrl}/chat/deleteMessage/${instanceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: integration.whatsapp_api_token,
        Authorization: `Bearer ${integration.whatsapp_api_token}`,
      },
      body: JSON.stringify({
        key: whatsappKey,
        deleteMediaMessage: false,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Evolution API delete error:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to delete message on WhatsApp', details: errorText }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { error: deleteError } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Database delete error:', deleteError)
    }

    await supabase.from('interaction_log').insert({
      user_id: user.id,
      type: 'whatsapp_delete',
      details: { messageId, whatsappKey, success: true },
    })

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
