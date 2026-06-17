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
    const { messageId, newText, whatsappKey } = body

    if (!messageId || !newText || !whatsappKey) {
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

    let sessionId = ''
    let apiKey = ''
    let apiUrl = ''

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
    sessionId = sessionId.trim() // removido regex que quebrava nomes com espaços

    let baseUrl = apiUrl.replace(/^(POST|GET|PUT|DELETE)\s+/i, '').trim()

    if (!baseUrl) {
      throw new Error('URL da API não configurada.')
    }

    baseUrl = baseUrl.replace(/\/+$/, '')
    // limpa qualquer path que possa ter vindo na URL
    if (baseUrl.includes('/message/')) {
      baseUrl = baseUrl.split('/message/')[0]
    } else if (baseUrl.includes('/chat/')) {
      baseUrl = baseUrl.split('/chat/')[0]
    }
    baseUrl = `${baseUrl}/message/updateMessage/${encodeURIComponent(sessionId)}`

    console.log(`[edit_whatsapp] PUT ${baseUrl} for instance ${sessionId}`)

    const response = await fetch(baseUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
        GlobalApiKey: apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        key: whatsappKey,
        text: newText,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Evolution API edit error:', errorText)
      throw new Error(`Failed to edit message on WhatsApp. Details: ${errorText}`)
    }

    const { data: updatedMessage, error: updateError } = await supabaseAdmin
      .from('messages')
      .update({ content: newText, is_edited: true })
      .eq('id', messageId)
      .eq('user_id', userId)
      .select()
      .single()

    if (updateError) {
      console.error('Database update error:', updateError)
    }

    await supabaseAdmin.from('interaction_log').insert({
      user_id: userId,
      type: 'whatsapp_edit',
      details: { messageId, whatsappKey, newText, instance: sessionId, success: true },
    })

    return new Response(JSON.stringify({ success: true, message: updatedMessage }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('Erro na Edge Function whatsapp-edit:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
