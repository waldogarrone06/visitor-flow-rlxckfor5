import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

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

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Authorization header is required')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      throw new Error('Usuário não autenticado.')
    }

    const { data: integration } = await supabaseClient
      .from('user_integrations')
      .select('whatsapp_instance_id, whatsapp_api_token')
      .eq('user_id', user.id)
      .single()

    const sessionId = integration?.whatsapp_instance_id || 'Jr'
    const apiKey = integration?.whatsapp_api_token || ''
    const number = to.replace(/\D/g, '')

    console.log(`Enviando para VPS - Session: ${sessionId}, Number: ${number}`)

    const payload = {
      session: sessionId,
      sessionId: sessionId,
      instance: sessionId,
      number: number,
      to: number,
      text: text,
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

    const baseUrl = 'http://129.121.44.86:3000'
    let r: Response | undefined
    let lastError = ''

    try {
      r = await fetch(`${baseUrl}/messages/send`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
      })
    } catch (e: any) {
      lastError = e.message
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

    if (!r || (!r.ok && r.status === 404)) {
      console.log(`Fallback para ${baseUrl}/message/sendText/${sessionId}`)
      try {
        r = await fetch(`${baseUrl}/message/sendText/${sessionId}`, {
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
