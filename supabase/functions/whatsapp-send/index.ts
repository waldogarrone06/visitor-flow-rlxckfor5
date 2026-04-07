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
    console.log(
      'RECEBIDO DO VISITOR FLOW (whatsapp-send):',
      JSON.stringify({ ...body, testCredentials: body.testCredentials ? '[HIDDEN]' : undefined }),
    )

    const { to, text } = body

    if (!to || !text) {
      throw new Error('Parâmetros "to" e "text" são obrigatórios.')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

    const authHeader = req.headers.get('Authorization')
    let userId = body.userId

    // Resolve userId if coming via frontend authorization bearer
    if (authHeader && !userId) {
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

    let sessionId = body.sessionId || ''
    let apiKey = ''
    let apiUrl = ''
    let integrationFound = false

    // 0. Use test credentials se ativado (tela de Settings)
    if (body.testCredentials && body.testCredentials.apiUrl && body.testCredentials.instanceId) {
      apiUrl = body.testCredentials.apiUrl
      sessionId = body.testCredentials.instanceId
      apiKey = body.testCredentials.apiToken || ''
      integrationFound = true
      console.log(`Usando credenciais de teste fornecidas para instância ${sessionId}`)
    }
    // 1. Tenta buscar a integração do usuário logado
    else if (userId) {
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
        console.log(`Integração encontrada para o usuário ${userId} (Instância: ${sessionId})`)
      }
    }

    // 2. Fallback global: se o usuário atual não tem config, busca a primeira globalmente (ex: Waldo/Wal Werner)
    if (!integrationFound) {
      console.log('Integração direta não encontrada, buscando fallback global na base...')
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
        'Nenhuma URL de API (Evolution API) configurada. Vá em Configurações e conecte o WhatsApp.',
      )
    }

    // Normaliza número DDI/DDD
    let number = to.replace(/\D/g, '')
    if (number.length === 10 || number.length === 11) {
      number = '55' + number
    }

    // Payload limpo e altamente compatível com Evolution API v1 e v2
    const payload = {
      number: number,
      text: text,
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // Suporte universal a tokens
    if (apiKey) {
      headers['apikey'] = apiKey
      headers['Authorization'] = `Bearer ${apiKey}` // Maior resiliência contra proxies em VPS
    }

    // Limpa barras finais acidentais
    const baseUrl = apiUrl.replace(/\/+$/, '')
    const endpoint = `${baseUrl}/message/sendText/${encodeURIComponent(sessionId)}`

    console.log(`Disparando requisição para VPS: POST ${endpoint}`)
    console.log(`Payload: ${JSON.stringify(payload)}`)

    // Implementação de Timeout de 15 segundos para evitar bloqueios longos
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    let r: Response
    try {
      r = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } catch (e: any) {
      if (e.name === 'AbortError') {
        throw new Error(
          `Timeout de Conexão: A sua VPS (${baseUrl}) demorou mais de 15s para responder.`,
        )
      }
      throw new Error(
        `Falha de rede ao conectar com a VPS (${baseUrl}). Verifique CORS e Firewall. Erro: ${e.message}`,
      )
    } finally {
      clearTimeout(timeoutId)
    }

    const responseText = await r.text().catch(() => '')
    console.log(`VPS Response Status: ${r.status} | Text: ${responseText}`)

    if (!r.ok) {
      console.error(`Evolution API Error ${r.status}: ${responseText}`)

      if (r.status === 401 || r.status === 403) {
        throw new Error(
          `Erro de Autenticação (403): O Token Global (API Key) está incorreto para a instância '${sessionId}'.`,
        )
      }
      if (r.status === 404) {
        throw new Error(
          `Instância não encontrada (404): A instância '${sessionId}' não existe na sua Evolution API ou a URL (${baseUrl}) não possui a porta correta.`,
        )
      }
      if (r.status === 400) {
        throw new Error(
          `Erro de Validação (400): O número '${number}' pode ser inválido ou a estrutura do payload não é suportada pela sua versão da API. Detalhe: ${responseText}`,
        )
      }

      throw new Error(`Erro na VPS (${r.status}): ${responseText || r.statusText}`)
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
    console.error('Erro na Edge Function whatsapp-send:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
