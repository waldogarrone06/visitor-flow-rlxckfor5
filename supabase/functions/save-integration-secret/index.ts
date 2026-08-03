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

    const rawKey =
      body.key || body.credentialKey || (body.accessToken ? 'whatsapp_official_access_token' : null)
    const isClear = !!body.clear
    const rawValue = isClear
      ? null
      : (body.value ?? body.credentialValue ?? body.accessToken ?? null)
    const targetUserId = body.userId || null

    if (!rawKey || !isAllowedKey(rawKey)) {
      return new Response(JSON.stringify({ error: 'Invalid credential key' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let effectiveUserId = user.id
    if (targetUserId && targetUserId !== user.id) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle()
      if (profile?.is_admin) {
        effectiveUserId = targetUserId
      }
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('integration_secrets')
      .select('user_id')
      .eq('user_id', effectiveUserId)
      .maybeSingle()

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: `Failed to check existing credentials: ${fetchError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    let upsertError: any = null
    if (existing) {
      const { error } = await supabaseAdmin
        .from('integration_secrets')
        .update({ [rawKey]: rawValue, updated_at: new Date().toISOString() })
        .eq('user_id', effectiveUserId)
      upsertError = error
    } else {
      const { error } = await supabaseAdmin
        .from('integration_secrets')
        .insert({ user_id: effectiveUserId, [rawKey]: rawValue })
      upsertError = error
    }

    if (upsertError) {
      return new Response(
        JSON.stringify({ error: `Failed to save credential: ${upsertError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    await updateIndicator(
      supabaseAdmin,
      effectiveUserId,
      rawKey,
      !!rawValue && String(rawValue).trim() !== '',
    )

    let redeployResult: any = null
    if (WHATSAPP_KEYS.includes(rawKey)) {
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/whatsapp-redeploy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
            apikey: supabaseAnonKey,
          },
          body: JSON.stringify({ userId: effectiveUserId }),
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
