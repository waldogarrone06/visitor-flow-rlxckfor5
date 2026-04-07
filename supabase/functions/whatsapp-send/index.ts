import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { to, text } = body

    if (!to || !text) {
      throw new Error('Parâmetros "to" e "text" são obrigatórios.')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

    const authHeader = req.headers.get('Authorization')
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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    let sessionId = body.sessionId || ''
    let apiKey = ''
    let apiUrl = ''

    if (body.testCredentials?.apiUrl && body.testCredentials?.instanceId) {
      apiUrl = body.testCredentials.apiUrl
      sessionId = body.testCredentials.instanceId
      apiKey = body.testCredentials.apiToken || ''
    } else if (userId) {
      const { data: integration } = await supabaseAdmin
        .from('user_integrations')
        .select('whatsapp_instance_id, whatsapp_api_token, whatsapp_api_url')
        .eq('user_id', userId)
        .single()

      if (integration?.whatsapp_api_url && integration?.whatsapp_instance_id) {
        sessionId = integration.whatsapp_instance_id
        apiKey = integration.whatsapp_api_token || ''
        apiUrl = integration.whatsapp_api_url
      }
    }

    if (!apiUrl || !sessionId) {
      const { data: fallback } = await supabaseAdmin
        .from('user_integrations')
        .select('whatsapp_instance_id, whatsapp_api_token, whatsapp_api_url')
        .not('whatsapp_api_url', 'is', null)
        .not('whatsapp_instance_id', 'is', null)
        .limit(1)
        .maybeSingle()

      if (fallback) {
        sessionId = fallback.whatsapp_instance_id
        apiKey = fallback.whatsapp_api_token || ''
        apiUrl = fallback.whatsapp_api_url
      }
    }

    let baseUrl = (apiUrl || 'http://129.121.44.86:8080').replace(/\/+$/, '')

    let number = to.replace(/\D/g, '')
    if (number.length === 10 || number.length === 11) {
      number = '55' + number
    }

    // Evolution API v2.2.3 expected payload format
    const payload = {
      number: number,
      textMessage: {
        text: text,
      },
      options: {
        delay: 1200,
        presence: 'composing',
      },
    }

    // STRICT HEADERS FOR EVOLUTION API
    // We do NOT send any Supabase JWT tokens here to avoid 401 Unauthorized from VPS
    const fetchHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (apiKey) {
      fetchHeaders['apikey'] = apiKey
      // Many VPS setups require Bearer format for Evolution API v2.x
      fetchHeaders['Authorization'] = `Bearer ${apiKey}`
    }

    const endpoint = `${baseUrl}/message/sendText/${encodeURIComponent(sessionId)}`

    console.log(`[send_whatsapp] POST ${endpoint} for instance ${sessionId}`)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    let r: Response
    try {
      r = await fetch(endpoint, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } catch (e: any) {
      if (e.name === 'AbortError') {
        throw new Error(`Timeout de Conexão na VPS (${baseUrl}). Servidor demorou a responder.`)
      }
      throw new Error(`Falha de rede VPS (${baseUrl}). Erro: ${e.message}`)
    } finally {
      clearTimeout(timeoutId)
    }

    const responseText = await r.text().catch(() => '')

    if (!r.ok) {
      throw new Error(`Erro na VPS (${r.status}): ${responseText || r.statusText}`)
    }

    let parsedResult
    try {
      parsedResult = JSON.parse(responseText)
    } catch (e) {
      parsedResult = { rawText: responseText }
    }

    // Log Interaction
    if (userId) {
      await supabaseAdmin
        .from('interaction_log')
        .insert({
          user_id: userId,
          type: 'whatsapp_send',
          details: { to: number, instance: sessionId, success: true },
        })
        .catch((err) => console.warn('Failed to insert interaction log:', err))
    }

    return new Response(JSON.stringify({ success: true, result: parsedResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Erro na Edge Function whatsapp-send:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
