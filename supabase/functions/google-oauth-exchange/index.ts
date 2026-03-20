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
      throw new Error('Missing required parameters (code, redirectUri, targetUserId)')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No authorization header')

    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: authErr,
    } = await supabaseUserClient.auth.getUser()
    if (authErr || !user) throw new Error('Unauthorized')

    if (user.id !== targetUserId) {
      const { data: profile } = await supabaseUserClient
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()
      if (!profile?.is_admin) {
        throw new Error('Forbidden: Only admins can configure integrations for other users')
      }
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

    if (!clientId || !clientSecret || clientId === 'your-client-id') {
      console.warn(
        'Missing or invalid GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET. Using mock tokens.',
      )

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

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text()
      throw new Error(`Token exchange failed with Google: ${err}`)
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token } = tokenData

    if (!access_token) {
      throw new Error('Access token missing in Google response')
    }

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    })

    if (!userInfoResponse.ok) {
      throw new Error('Failed to fetch user info from Google using the new access token')
    }

    const userInfo = await userInfoResponse.json()

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

    if (dbError) throw new Error(`Database error saving tokens: ${dbError.message}`)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Google OAuth Exchange Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
