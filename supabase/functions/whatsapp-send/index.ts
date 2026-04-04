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
    const { to, text } = await req.json()

    if (!to || !text) {
      throw new Error('Parâmetros "to" e "text" são obrigatórios.')
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Acesso não autorizado. Token ausente.')
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
      throw new Error('Acesso não autorizado. Sessão inválida.')
    }

    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '')
    const { data: integration } = await supabaseAdmin
      .from('user_integrations')
      .select('whatsapp_api_token, whatsapp_instance_id')
      .eq('user_id', user.id)
      .single()

    if (!integration?.whatsapp_api_token) {
      throw new Error('URL da API do WhatsApp não configurada. Verifique as configurações.')
    }

    const apiUrl = integration.whatsapp_api_token.replace(/\/$/, '')
    const sessionId = integration.whatsapp_instance_id || 'FourLab' // fallback

    // Dispara a inicialização da sessão para garantir que está ativa
    try {
      await fetch(`${apiUrl}/sessions/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
    } catch (e) {
      console.log('Aviso: falha ao iniciar sessão, tentando enviar mensagem mesmo assim.', e)
    }

    const digits = to.replace(/\D/g, '')
    const payload = {
      sessionId,
      number: to.includes('+') ? to.replace(/[^\d+]/g, '') : `+${digits}`,
      message: text,
    }

    const response = await fetch(`${apiUrl}/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`Falha na API externa (${response.status}): ${errText}`)
    }

    const result = await response.json().catch(() => ({ success: true }))

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
