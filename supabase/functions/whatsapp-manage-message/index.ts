import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { action, messageId, to, text } = body

    if (!action || !messageId || !to) {
      throw new Error('Parâmetros action, messageId e to são obrigatórios.')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Não autenticado')

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('Usuário não encontrado')

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const { data: integration } = await supabaseAdmin
      .from('user_integrations')
      .select('whatsapp_instance_id, whatsapp_api_token, whatsapp_api_url')
      .eq('user_id', user.id)
      .single()

    if (!integration?.whatsapp_api_url || !integration?.whatsapp_instance_id) {
      throw new Error('Você não possui uma integração do WhatsApp configurada.')
    }

    let apiUrl = integration.whatsapp_api_url.replace(/\/+$/, '')
    const apiKey = integration.whatsapp_api_token || ''
    const sessionId = integration.whatsapp_instance_id

    apiUrl = apiUrl.replace(/^(POST|GET|PUT|DELETE)\s+/i, '').trim()

    if (apiUrl.includes('/message/sendText')) {
      apiUrl = apiUrl.split('/message/sendText')[0]
    } else if (apiUrl.includes('/v1/messages')) {
      apiUrl = apiUrl.split('/v1/messages')[0]
    }

    let number = to.replace(/\D/g, '')
    if (number.length === 10 || number.length === 11) {
      number = '55' + number
    }

    let endpoint = ''
    let method = ''
    let payload: any = {}

    if (action === 'delete') {
      endpoint = `${apiUrl}/chat/deleteMessageForEveryone/${encodeURIComponent(sessionId)}`
      method = 'DELETE'
      payload = {
        number,
        messageId,
      }
    } else if (action === 'edit') {
      endpoint = `${apiUrl}/chat/updateMessage/${encodeURIComponent(sessionId)}`
      method = 'POST'
      payload = {
        number,
        messageId,
        text,
      }
    }

    const fetchHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: apiKey,
      GlobalApiKey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    }

    let r = await fetch(endpoint, {
      method,
      headers: fetchHeaders,
      body: JSON.stringify(payload),
    })

    if (!r.ok && r.status === 404 && action === 'edit') {
      const fallbackEndpoint = `${apiUrl}/message/edit/${encodeURIComponent(sessionId)}`
      r = await fetch(fallbackEndpoint, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify(payload),
      })
    }

    const responseText = await r.text().catch(() => '')

    if (!r.ok) {
      throw new Error(`Erro na API (${r.status}): ${responseText || r.statusText}`)
    }

    let parsedResult
    try {
      parsedResult = JSON.parse(responseText)
    } catch (e) {
      parsedResult = { rawText: responseText }
    }

    return new Response(JSON.stringify({ success: true, evolutionResponse: parsedResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
