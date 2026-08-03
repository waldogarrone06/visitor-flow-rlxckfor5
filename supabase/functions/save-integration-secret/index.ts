import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { isAllowedKey, updateIndicator } from '../_shared/integration-secrets.ts'

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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const { credentialKey, credentialValue, clear, credentials, accessToken } = body

    if (credentials && typeof credentials === 'object') {
      const updates: Record<string, string> = {}
      for (const [key, value] of Object.entries(credentials)) {
        if (isAllowedKey(key) && typeof value === 'string' && value.trim()) {
          updates[key] = value.trim()
        }
      }

      if (Object.keys(updates).length > 0) {
        updates['updated_at'] = new Date().toISOString()
        const { error: secretError } = await supabaseAdmin
          .from('integration_secrets')
          .upsert({ user_id: userId, ...updates }, { onConflict: 'user_id' })

        if (secretError) throw secretError

        for (const key of Object.keys(updates)) {
          if (key !== 'updated_at') {
            await updateIndicator(supabaseAdmin, userId, key, true)
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let resolvedKey = credentialKey
    let resolvedValue = credentialValue

    if (!resolvedKey && accessToken !== undefined) {
      resolvedKey = 'whatsapp_official_access_token'
      resolvedValue = accessToken
    }

    if (!resolvedKey || !isAllowedKey(resolvedKey)) {
      return new Response(JSON.stringify({ error: 'Invalid or missing credentialKey' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (clear === true) {
      const { error: clearError } = await supabaseAdmin
        .from('integration_secrets')
        .update({ [resolvedKey]: null, updated_at: new Date().toISOString() })
        .eq('user_id', userId)

      if (clearError) throw clearError

      await updateIndicator(supabaseAdmin, userId, resolvedKey, false)

      return new Response(JSON.stringify({ success: true, configured: false }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!resolvedValue || typeof resolvedValue !== 'string' || !resolvedValue.trim()) {
      return new Response(JSON.stringify({ error: 'credentialValue is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error: secretError } = await supabaseAdmin.from('integration_secrets').upsert(
      {
        user_id: userId,
        [resolvedKey]: resolvedValue.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

    if (secretError) throw secretError

    await updateIndicator(supabaseAdmin, userId, resolvedKey, true)

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
