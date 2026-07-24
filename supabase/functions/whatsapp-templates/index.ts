import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const { data: integration } = await supabaseAdmin
      .from('user_integrations')
      .select('whatsapp_official_waba_id, whatsapp_official_access_token')
      .eq('user_id', userId)
      .maybeSingle()

    if (!integration?.whatsapp_official_access_token) {
      return new Response(
        JSON.stringify({
          error: 'WhatsApp Official API not configured. Save your Access Token first.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!integration?.whatsapp_official_waba_id) {
      return new Response(
        JSON.stringify({
          error: 'WABA ID not configured. Save your WABA ID first.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const wabaId = integration.whatsapp_official_waba_id
    const accessToken = integration.whatsapp_official_access_token

    const url = `https://graph.facebook.com/v21.0/${wabaId}/message_templates`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    let response: Response
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      })
    } catch (e: any) {
      if (e.name === 'AbortError') throw new Error('Timeout fetching templates from Meta API.')
      throw new Error(`Network error: ${e.message}`)
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      const errText = await response.text()
      return new Response(
        JSON.stringify({
          error: `Meta API error (${response.status}): ${errText}`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const data = await response.json()

    const templates = (data.data || [])
      .filter((t: any) => t.status === 'APPROVED')
      .map((t: any) => {
        const bodyComponent = t.components?.find((c: any) => c.type === 'BODY')
        const parameters: { name: string; type: string }[] = []

        if (bodyComponent?.text) {
          const format = t.parameter_format || 'POSITIONAL'
          if (format === 'NAMED') {
            const namedMatches = bodyComponent.text.match(/\{\{([^}]+)\}\}/g)
            if (namedMatches) {
              for (const match of namedMatches) {
                const name = match.replace(/[{}]/g, '')
                parameters.push({ name, type: 'text' })
              }
            }
          } else {
            const positionalMatches = bodyComponent.text.match(/\{\{(\d+)\}\}/g)
            if (positionalMatches) {
              for (const match of positionalMatches) {
                const num = match.match(/\d+/)[0]
                parameters.push({ name: `param_${num}`, type: 'text' })
              }
            }
          }
        }

        return {
          id: t.id,
          name: t.name,
          language: t.language,
          parameter_format: t.parameter_format || 'POSITIONAL',
          parameters,
          status: t.status,
          category: t.category,
          components: t.components,
        }
      })

    return new Response(JSON.stringify({ templates }), {
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
