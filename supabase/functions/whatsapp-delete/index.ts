import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

    const authHeader = req.headers.get('Authorization')

    const body = await req.json().catch(() => ({}))
    const { messageId, whatsappKey } = body

    if (!messageId || !whatsappKey) {
      throw new Error('Missing required parameters')
    }

    let userId = body.userId

    if (authHeader && !userId) {
      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const {
        data: { user },
      } = await supabaseClient.auth.getUser()
      if (user) userId = user.id
    }

    if (!userId) {
      throw new Error('Unauthorized')
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    let sessionId = body.instanceId || body.sessionId || ''
    let apiKey = body.apiToken || ''
    let apiUrl = body.apiUrl || ''

    const { data: integration } = await supabaseAdmin
      .from('user_integrations')
      .select('whatsapp_instance_id, whatsapp_api_token, whatsapp_api_url')
      .eq('user_id', userId)
      .single()

    if (integration?.whatsapp_api_url && integration?.whatsapp_instance_id) {
      sessionId = integration.whatsapp_instance_id
      apiKey = integration.whatsapp_api_token || ''
      apiUrl = integration.whatsapp_api_url
    } else {
      throw new Error('Você não possui uma integração do WhatsApp configurada.')
    }

    apiKey = apiKey.trim()
    sessionId = sessionId.trim()

    let baseUrl = apiUrl.replace(/^(POST|GET|PUT|DELETE)\s+/i, '').trim()

    if (!baseUrl) {
      throw new Error('URL da API não configurada.')
    }

    baseUrl = baseUrl.replace(/\/+$/, '')
    baseUrl = `${baseUrl}/chat/deleteMessage/${encodeURIComponent(sessionId)}`

    console.log(`[delete_whatsapp] POST ${baseUrl} for instance ${sessionId}`)

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
        GlobalApiKey: apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        key: whatsappKey,
        deleteMediaMessage: false,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Evolution API delete error:', errorText)
      throw new Error(`Failed to delete message on WhatsApp. Details: ${errorText}`)
    }

    const { error: deleteError } = await supabaseAdmin
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('user_id', userId)

    if (deleteError) {
      console.error('Database delete error:', deleteError)
    }

    await supabaseAdmin.from('interaction_log').insert({
      user_id: userId,
      type: 'whatsapp_delete',
      details: { messageId, whatsappKey, instance: sessionId, success: true },
    })

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('Erro na Edge Function whatsapp-delete:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
