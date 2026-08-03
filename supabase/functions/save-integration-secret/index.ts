import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    const authHeader = req.headers.get('Authorization') || ''
    let userId: string | null = null

    if (authHeader) {
      const tmpClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const {
        data: { user },
      } = await tmpClient.auth.getUser()
      if (user) userId = user.id
    }

    const body = await req.json().catch(() => ({}))
    if (!userId && body.userId) userId = body.userId

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { accessToken, clear } = body

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    if (clear === true) {
      const { error: clearError } = await supabaseAdmin
        .from('integration_secrets')
        .update({ whatsapp_official_access_token: null, updated_at: new Date().toISOString() })
        .eq('user_id', userId)

      if (clearError) throw clearError

      await supabaseAdmin
        .from('user_integrations')
        .update({ whatsapp_official_configured: false })
        .eq('user_id', userId)

      return new Response(JSON.stringify({ success: true, configured: false }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!accessToken || typeof accessToken !== 'string' || !accessToken.trim()) {
      return new Response(JSON.stringify({ error: 'accessToken is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error: secretError } = await supabaseAdmin.from('integration_secrets').upsert(
      {
        user_id: userId,
        whatsapp_official_access_token: accessToken.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

    if (secretError) throw secretError

    const { error: indicatorError } = await supabaseAdmin
      .from('user_integrations')
      .update({ whatsapp_official_configured: true })
      .eq('user_id', userId)

    if (indicatorError) throw indicatorError

    return new Response(JSON.stringify({ success: true, configured: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[save-integration-secret] Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
