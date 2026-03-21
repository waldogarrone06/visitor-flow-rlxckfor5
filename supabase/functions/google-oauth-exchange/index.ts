import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code, redirectUri, targetUserId } = await req.json()

    if (!code || !redirectUri || !targetUserId) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros ausentes (code, redirectUri, targetUserId)' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Nenhum cabeçalho de autorização (Authorization header)' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: authErr,
    } = await supabaseUserClient.auth.getUser()
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado. Sessão inválida.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (user.id !== targetUserId) {
      const { data: profile } = await supabaseUserClient
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()
      if (!profile?.is_admin) {
        return new Response(
          JSON.stringify({
            error: 'Acesso negado: Apenas administradores podem configurar outros usuários',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

    // Handle Mock Code early to avoid failing on Google API
    if (
      code.startsWith('mock_code_') ||
      !clientId ||
      !clientSecret ||
      clientId === 'your-client-id'
    ) {
      console.warn('Using mock tokens due to missing credentials or mock code in request.')
      await supabaseAdmin.from('user_integrations').upsert(
        {
          user_id: targetUserId,
          google_access_token: `mock_access_token_${code.substring(0, 8)}`,
          google_refresh_token: `mock_refresh_token_${code.substring(0, 8)}`,
          google_email: 'demo.integration@empresa.com',
          sync_enabled: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      return new Response(JSON.stringify({ success: true, mocked: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const tokenData = await tokenResponse.json()

    if (!tokenResponse.ok) {
      console.error('Google Token Exchange Error:', tokenData)
      return new Response(
        JSON.stringify({
          error: `Erro retornado pelo Google: ${tokenData.error_description || tokenData.error || 'Falha na troca do código de autorização.'}`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { access_token, refresh_token } = tokenData

    if (!access_token) {
      return new Response(
        JSON.stringify({ error: 'Google não retornou um access_token válido.' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    })

    const userInfo = await userInfoResponse.json()

    if (!userInfoResponse.ok) {
      console.error('Google UserInfo Error:', userInfo)
      return new Response(
        JSON.stringify({ error: 'Falha ao buscar dados do usuário (e-mail) no Google.' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const payload: any = {
      user_id: targetUserId,
      google_access_token: access_token,
      google_email: userInfo.email || 'unknown@example.com',
      sync_enabled: true,
      updated_at: new Date().toISOString(),
    }

    if (refresh_token) {
      payload.google_refresh_token = refresh_token
    }

    const { error: dbError } = await supabaseAdmin
      .from('user_integrations')
      .upsert(payload, { onConflict: 'user_id' })

    if (dbError) {
      return new Response(
        JSON.stringify({ error: `Erro no banco de dados ao salvar tokens: ${dbError.message}` }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Google OAuth Exchange Caught Error:', error.message)
    return new Response(JSON.stringify({ error: `Falha interna no servidor: ${error.message}` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
