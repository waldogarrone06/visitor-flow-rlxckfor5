import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { isAllowedKey, updateIndicator } from '../_shared/integration-secrets.ts'

const WHATSAPP_KEYS = [
  'whatsapp_official_access_token',
  'whatsapp_app_secret',
  'whatsapp_api_token',
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    const authHeader = req.headers.get('Authorization') || ''
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    })
    const body = await req.json().catch(() => ({}))
    const { key, value } = body

    if (!key || !isAllowedKey(key)) {
      return new Response(JSON.stringify({ error: 'Invalid credential key' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: existing } = await supabaseAdmin
      .from('integration_secrets')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      await supabaseAdmin
        .from('integration_secrets')
        .update({ [key]: value || null, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
    } else {
      await supabaseAdmin
        .from('integration_secrets')
        .insert({ user_id: user.id, [key]: value || null })
    }

    await updateIndicator(supabaseAdmin, user.id, key, !!value && String(value).trim() !== '')

    let redeployResult: any = null
    if (WHATSAPP_KEYS.includes(key)) {
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/whatsapp-redeploy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
            apikey: supabaseAnonKey,
          },
          body: JSON.stringify({ userId: user.id }),
        })
        redeployResult = await r.json()
      } catch (e: any) {
        redeployResult = { error: e.message, overall: 'incomplete' }
      }
    }

    return new Response(JSON.stringify({ success: true, redeploy: redeployResult }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
