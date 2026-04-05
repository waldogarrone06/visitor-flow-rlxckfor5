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
    console.log('RECEBIDO DO VISITOR FLOW (whatsapp-send):', JSON.stringify(body))

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
        userId = userId || user.id
      }
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    let sessionId = body.sessionId || ''
    let apiKey = ''
    let apiUrl = ''
    let integrationFound = false

    // 1. Tenta buscar a integração do usuário logado ou passado no body
    if (userId) {
      const { data: integration } = await supabaseAdmin
        .from('user_integrations')
        .select('whatsapp_instance_id, whatsapp_api_token, whatsapp_api_url')
        .eq('user_id', userId)
        .single()

      if (integration && integration.whatsapp_api_url && integration.whatsapp_instance_id) {
        sessionId = integration.whatsapp_instance_id
        apiKey = integration.whatsapp_api_token || ''
        apiUrl = integration.whatsapp_api_url
        integrationFound = true
        console.log(`Integração encontrada para o usuário ${userId}`)
      }
    }

    // 2. Se não achou (ex: admin logado testando), busca fallback global
    if (!integrationFound) {
      console.log('Integração direta não encontrada, buscando fallback global...')
      const { data: fallbackIntegration } = await supabaseAdmin
        .from('user_integrations')
        .select('whatsapp_instance_id, whatsapp_api_token, whatsapp_api_url')
        .not('whatsapp_api_url', 'is', null)
        .not('whatsapp_instance_id', 'is', null)
        .limit(1)
        .maybeSingle()

      if (fallbackIntegration) {
        sessionId = fallbackIntegration.whatsapp_instance_id
        apiKey = fallbackIntegration.whatsapp_api_token || ''
        apiUrl = fallbackIntegration.whatsapp_api_url
        integrationFound = true
        console.log(`Fallback global encontrado: Instância ${sessionId}`)
      }
    }

    if (!apiUrl) {
      throw new Error(
        'Nenhuma URL de API (Evolution API) configurada. Vá em Configurações e configure o WhatsApp.',
      )
    }

    let number = to.replace(/\D/g, '')

    if (number.length === 10 || number.length === 11) {
      number = '55' + number
    }

    console.log(`Enviando para VPS - API: ${apiUrl}, Instância: ${sessionId}, Numero: ${number}`)

    // Payload otimizado com suporte duplo para Evolution API v1 e v2
    const payload = {
      number: number,
      text: text,
      textMessage: { text: text },
      options: {
        delay: 0,
        presence: 'composing',
        linkPreview: false,
      },
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // Suporte universal Evolution API
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
      headers['apikey'] = apiKey
    }

    const baseUrl = apiUrl.replace(/\/$/, '')
    let r: Response | undefined
    let lastError = ''
    let usedEndpoint = ''

    const endpoints = [
      `${baseUrl}/message/sendText/${encodeURIComponent(sessionId)}`,
      `${baseUrl}/messages/send`,
    ]

    for (const endpoint of endpoints) {
      try {
        console.log(`Tentando POST ${endpoint}...`)
        r = await fetch(endpoint, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload),
        })

        usedEndpoint = endpoint

        // Se funcionou ou se falhou por auth/not found (que não são erros de rede), paramos
        if (r.ok || r.status === 401 || r.status === 403 || r.status === 404) {
          break
        }
      } catch (e: any) {
        lastError = e.message
        console.log(`Falha fetch ${endpoint}: ${lastError}`)
      }
    }

    if (!r) {
      throw new Error(
        `Falha de rede ao conectar com a VPS (${baseUrl}). Verifique CORS e conectividade. Erro: ${lastError}`,
      )
    }

    const responseText = await r.text().catch(() => '')
    console.log(`VPS Response status: ${r.status} (${usedEndpoint}) - Text: ${responseText}`)

    if (!r.ok) {
      console.error(`Evolution API Error ${r.status} na rota ${usedEndpoint}: ${responseText}`)
      if (r.status === 403 || r.status === 401) {
        throw new Error(
          `Erro de Autenticação (${r.status}): Verifique se o Token/API Key está correto para a instância ${sessionId}. Detalhe: ${responseText}`,
        )
      }
      if (r.status === 404) {
        throw new Error(
          `Instância não encontrada (404): A instância '${sessionId}' não existe ou a URL '${baseUrl}' está incorreta. Detalhe: ${responseText}`,
        )
      }
      throw new Error(`Erro na Evolution API (${r.status}): ${responseText || r.statusText}`)
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
    console.error('Erro no whatsapp-send:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
