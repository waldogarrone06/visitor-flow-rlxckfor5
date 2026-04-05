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
    console.log('RECEBIDO DO VISITOR FLOW:', body)

    const { to, text } = body

    if (!to || !text) {
      throw new Error('Parâmetros "to" e "text" são obrigatórios.')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

    const authHeader = req.headers.get('Authorization')
    let userId = body.userId

    if (authHeader) {
      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      })

      const {
        data: { user },
        error: authError,
      } = await supabaseClient.auth.getUser()
      if (!authError && user) {
        userId = user.id
      }
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    let sessionId = body.sessionId || 'Jr'
    let apiKey = ''
    let apiUrl = 'http://129.121.44.86:8080'

    if (userId) {
      const { data: integration } = await supabaseAdmin
        .from('user_integrations')
        .select('whatsapp_instance_id, whatsapp_api_token, whatsapp_api_url')
        .eq('user_id', userId)
        .single()

      if (integration) {
        if (integration.whatsapp_instance_id) sessionId = integration.whatsapp_instance_id
        if (integration.whatsapp_api_token) apiKey = integration.whatsapp_api_token
        if (integration.whatsapp_api_url) apiUrl = integration.whatsapp_api_url
      }
    } else if (body.sessionId) {
      const { data: integration } = await supabaseAdmin
        .from('user_integrations')
        .select('whatsapp_api_token, whatsapp_api_url')
        .eq('whatsapp_instance_id', body.sessionId)
        .single()

      if (integration) {
        if (integration.whatsapp_api_token) apiKey = integration.whatsapp_api_token
        if (integration.whatsapp_api_url) apiUrl = integration.whatsapp_api_url
      }
    }
    let number = to.replace(/\D/g, '')

    if (number.length === 10 || number.length === 11) {
      number = '55' + number
    }

    console.log(`Enviando para VPS - API: ${apiUrl}, Instância: ${sessionId}, Numero: ${number}`)

    const payload = {
      number: number,
      text: text,
      // Propriedades adicionais para compatibilidade retroativa
      session: sessionId,
      sessionId: sessionId,
      instance: sessionId,
      to: number,
      message: text,
      content: text,
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
      headers['apikey'] = apiKey
    }

    const baseUrl = apiUrl.replace(/\/$/, '')
    let r: Response | undefined
    let lastError = ''

    // 1. Tenta envio direto via padrão Evolution API
    try {
      r = await fetch(`${baseUrl}/message/sendText/${sessionId}`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
      })
    } catch (e: any) {
      lastError = e.message
    }

    // 2. Fallbacks para endpoints customizados caso não seja Evolution padrão
    if (!r || (!r.ok && r.status === 404)) {
      console.log(`Fallback para ${baseUrl}/messages/send`)
      try {
        r = await fetch(`${baseUrl}/messages/send`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload),
        })
      } catch (e: any) {
        lastError = e.message
      }
    }

    if (!r || (!r.ok && r.status === 404)) {
      console.log(`Fallback para ${baseUrl}/send`)
      try {
        r = await fetch(`${baseUrl}/send`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload),
        })
      } catch (e: any) {
        lastError = e.message
      }
    }

    if (!r) {
      throw new Error(`Falha ao conectar com a VPS (${baseUrl}): ${lastError}`)
    }

    const responseText = await r.text().catch(() => '')
    console.log('VPS Response status:', r.status, 'text:', responseText)

    if (!r.ok) {
      throw new Error(`Falha na API externa (${r.status}): ${responseText}`)
    }

    let parsedResult
    try {
      parsedResult = JSON.parse(responseText)
    } catch (e) {
      parsedResult = { rawText: responseText }
    }

    return new Response(JSON.stringify({ success: true, result: parsedResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Erro no processamento:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
