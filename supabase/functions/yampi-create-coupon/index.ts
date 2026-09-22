import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { getSecret } from '../_shared/integration-secrets.ts'

interface CreateCouponPayload {
  userId?: string
  code?: string
  type?: 'fixed' | 'percent' | 'percentage' | 'value' | 'promotional'
  value?: number
  min_order_value?: number | null
  max_discount_value?: number | null
  usage_limit?: number | null
  usage_limit_per_user?: number | null
  expires_at?: string | null
  start_at?: string | null
  active?: boolean
  free_shipping?: boolean
  description?: string
  name?: string
  lead_id?: string
  appointment_id?: string
  context?: Record<string, unknown>
}

// Generate an automatic human-readable coupon code if none was provided
function generateCouponCode(leadName?: string): string {
  const sanitized = (leadName || 'LEAD')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 5)
    .toUpperCase()
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `VIP-${sanitized || 'VF'}-${randomSuffix}`
}

// Normalize discount type to Yampi format (percentage | fixed)
function normalizeDiscountType(type?: string): {
  yampiType: 'percentage' | 'fixed'
  isPercent: boolean
} {
  const clean = (type || '').toLowerCase()
  if (clean === 'percent' || clean === 'percentage' || clean === '%') {
    return { yampiType: 'percentage', isPercent: true }
  }
  return { yampiType: 'fixed', isPercent: false }
}

function isHtmlResponse(contentType: string, text: string): boolean {
  if (contentType.toLowerCase().includes('text/html')) return true
  const trimmed = text.trim().toLowerCase()
  return (
    trimmed.startsWith('<!doctype html') ||
    trimmed.startsWith('<html') ||
    trimmed.includes('<title>access denied') ||
    trimmed.includes('<title>just a moment') ||
    (trimmed.includes('cloudflare') && trimmed.includes('error code'))
  )
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Supabase configuration missing in environment.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Authenticate caller (either via JWT user or verify service_role)
    const authHeader = req.headers.get('Authorization') || ''
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    })

    const body: CreateCouponPayload = await req.json().catch(() => ({}))

    // Determine target user
    let effectiveUserId = body.userId
    if (!effectiveUserId && authHeader) {
      const {
        data: { user },
      } = await supabaseClient.auth.getUser()
      if (user) effectiveUserId = user.id
    }

    if (!effectiveUserId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Identificador do usuário (userId) não fornecido ou não autenticado.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Read store alias from user_integrations
    const { data: userIntegration, error: integrationError } = await supabaseAdmin
      .from('user_integrations')
      .select('yampi_alias')
      .eq('user_id', effectiveUserId)
      .maybeSingle()

    if (integrationError) {
      console.error(
        '[yampi-create-coupon] Error querying user_integrations:',
        integrationError.message,
      )
    }

    const rawAlias = (userIntegration?.yampi_alias || '').trim()
    const storeAlias = rawAlias.toLowerCase().replace(/[^a-z0-9_-]/g, '')

    // Read secrets EXCLUSIVELY from integration_secrets via service_role admin client
    // No fallback to Deno.env, never expose secrets in response/logs
    const yampiToken = (await getSecret(supabaseAdmin, effectiveUserId, 'yampi_token')).trim()
    const yampiSecret = (await getSecret(supabaseAdmin, effectiveUserId, 'yampi_secret')).trim()

    if (!yampiToken) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'YAMPI_NOT_CONFIGURED',
          error:
            'A integração com a Yampi não está configurada para este usuário. Configure o Token da Yampi nas Configurações.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Target coupon code
    const rawCode = (body.code || generateCouponCode(body.name)).trim().toUpperCase()
    const { yampiType, isPercent } = normalizeDiscountType(body.type)
    const discountValue = Number(body.value ?? 10)

    // Check if an appointment or lead was specified and already has this coupon or coupon_verified
    if (body.appointment_id) {
      const { data: existingApp } = await supabaseAdmin
        .from('appointments')
        .select('coupon_code, coupon_verified')
        .eq('id', body.appointment_id)
        .eq('user_id', effectiveUserId)
        .maybeSingle()

      if (existingApp?.coupon_verified && existingApp.coupon_code) {
        return new Response(
          JSON.stringify({
            success: true,
            isExisting: true,
            code: existingApp.coupon_code,
            couponCode: existingApp.coupon_code,
            message: 'Cupom já emitido para este agendamento/prescritor.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    // Build standard Yampi Coupon payload according to official Yampi (dooki) REST API documentation
    // Fields sent include both primary schema names and aliases accepted across v2/promotions/coupons
    const yampiPayload: Record<string, unknown> = {
      code: rawCode,
      type: yampiType, // 'percentage' | 'fixed'
      discount_type: yampiType,
      value: discountValue,
      discount_value: discountValue,
      active: body.active !== undefined ? body.active : true,
    }

    if (body.usage_limit != null && body.usage_limit > 0) {
      yampiPayload.limit_usage = body.usage_limit
      yampiPayload.usage_limit = body.usage_limit
    }
    if (body.usage_limit_per_user != null && body.usage_limit_per_user > 0) {
      yampiPayload.limit_usage_per_customer = body.usage_limit_per_user
      yampiPayload.usage_limit_per_user = body.usage_limit_per_user
    }
    if (body.min_order_value != null && body.min_order_value > 0) {
      yampiPayload.min_purchase_value = body.min_order_value
      yampiPayload.min_order_value = body.min_order_value
    }
    if (body.max_discount_value != null && body.max_discount_value > 0) {
      yampiPayload.max_discount_value = body.max_discount_value
    }
    if (body.expires_at) {
      yampiPayload.end_at = body.expires_at
      yampiPayload.expires_at = body.expires_at
    }
    if (body.start_at) {
      yampiPayload.start_at = body.start_at
    }
    if (body.description) {
      yampiPayload.description = body.description
    }
    if (body.free_shipping) {
      yampiPayload.free_shipping = true
    }

    // Prepare Yampi API authentication and browser/client headers
    // Yampi v1/v2 accepts User-Token and User-Secret headers
    // Official domain: api.dooki.com.br
    // Cloudflare blocks requests with missing/bot User-Agent or absent Accept headers
    const yampiHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 VisitorFlow/1.0',
      Accept: 'application/json',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Content-Type': 'application/json',
      'User-Token': yampiToken,
    }
    if (yampiSecret) {
      yampiHeaders['User-Secret'] = yampiSecret
    }

    // Official Yampi API domain is api.dooki.com.br
    // Build resilient endpoint list prioritizing api.dooki.com.br, then fallback paths
    const targetAlias = storeAlias || 'store'
    const candidateUrls: string[] = [
      // 1. Primary official Yampi (dooki) v2 promotions/coupons endpoint
      `https://api.dooki.com.br/v2/${targetAlias}/promotions/coupons`,
      // 2. v2 direct coupons endpoint
      `https://api.dooki.com.br/v2/${targetAlias}/coupons`,
    ]

    if (storeAlias) {
      // 3. v1 alias endpoint on dooki
      candidateUrls.push(`https://api.dooki.com.br/v1/${targetAlias}/coupons`)
    }
    // 4. Global v1 coupons on dooki
    candidateUrls.push('https://api.dooki.com.br/v1/coupons')

    // 5. Fallbacks to api.yampi.com.br in case legacy routing is specifically configured
    candidateUrls.push(`https://api.yampi.com.br/v2/${targetAlias}/promotions/coupons`)
    candidateUrls.push(`https://api.yampi.com.br/v1/coupons`)

    interface AttemptLog {
      endpoint: string
      status: number
      isHtml: boolean
      outcome: string
      message?: string
    }

    const attempts: AttemptLog[] = []
    let yampiResponse: Response | null = null
    let responseText = ''
    let jsonResponse: any = null
    let lastUrl = candidateUrls[0]
    let lastStatus = 0
    let lastContentType = ''
    let sawHtmlBlock = false

    for (let i = 0; i < candidateUrls.length; i++) {
      const url = candidateUrls[i]
      const isLastUrl = i === candidateUrls.length - 1
      lastUrl = url

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: yampiHeaders,
          body: JSON.stringify(yampiPayload),
        })

        lastStatus = res.status
        lastContentType = res.headers.get('content-type') || ''
        const text = await res.text()
        let parsed: any = null
        try {
          parsed = JSON.parse(text)
        } catch {
          parsed = null
        }

        const isHtml = isHtmlResponse(lastContentType, text)
        if (isHtml) {
          sawHtmlBlock = true
        }

        // Case A: 2xx success
        if (res.ok) {
          attempts.push({
            endpoint: url,
            status: res.status,
            isHtml: false,
            outcome: 'success',
          })
          yampiResponse = res
          responseText = text
          jsonResponse = parsed
          break
        }

        // Case B: Non-OK with valid JSON body from Yampi API (NOT HTML)
        if (parsed !== null && !isHtml) {
          // If Yampi API returned 401 or 403 as JSON, this is an AUTH/PERMISSION error.
          // NEVER proceed to next fallback routes (which leads to legacy/blocked routes).
          // Stop immediately and report real Yampi credentials/permission issue.
          if (res.status === 401 || res.status === 403) {
            attempts.push({
              endpoint: url,
              status: res.status,
              isHtml: false,
              outcome: res.status === 401 ? 'unauthorized' : 'forbidden',
              message: parsed.message || parsed.error || 'Credenciais inválidas ou sem permissão',
            })
            yampiResponse = res
            responseText = text
            jsonResponse = parsed
            console.warn(
              `[yampi-create-coupon] Route ${url} responded with JSON HTTP ${res.status} (auth/permission). Halting chain immediately.`,
            )
            break
          }

          // If it was a 404 or 405 on this specific route and more fallbacks exist, continue trying
          if ((res.status === 404 || res.status === 405) && !isLastUrl) {
            attempts.push({
              endpoint: url,
              status: res.status,
              isHtml: false,
              outcome: 'route_not_found',
              message: parsed.message || parsed.error || `HTTP ${res.status}`,
            })
            console.warn(
              `[yampi-create-coupon] Route ${url} returned JSON HTTP ${res.status}, trying next fallback...`,
            )
            continue
          }

          // Case B2: Other JSON error (e.g. 422 validation, 409 duplicate) - Stop and return
          attempts.push({
            endpoint: url,
            status: res.status,
            isHtml: false,
            outcome: 'validation_error',
            message: parsed.message || parsed.error || `HTTP ${res.status}`,
          })
          yampiResponse = res
          responseText = text
          jsonResponse = parsed
          break
        }

        // Case C: HTML or non-JSON response (Cloudflare 403 / 502 / 503)
        attempts.push({
          endpoint: url,
          status: res.status,
          isHtml: true,
          outcome: 'html_blocked',
          message: isHtml ? 'Bloqueio Cloudflare/WAF (HTML)' : `HTTP ${res.status}`,
        })
        yampiResponse = res
        responseText = text
        jsonResponse = null

        if (!isLastUrl) {
          console.warn(
            `[yampi-create-coupon] Route ${url} returned HTML/non-JSON HTTP ${res.status}, trying fallback...`,
          )
          continue
        }

        // If last url, break and let error handler report
        break
      } catch (fetchErr: any) {
        attempts.push({
          endpoint: url,
          status: 0,
          isHtml: false,
          outcome: 'network_error',
          message: fetchErr.message,
        })
        console.error(`[yampi-create-coupon] Fetch error on ${url}:`, fetchErr.message)
        if (isLastUrl) {
          return new Response(
            JSON.stringify({
              success: false,
              code: 'NETWORK_ERROR',
              error: `Falha de conexão com a API da Yampi: ${fetchErr.message}`,
              attempts,
              endpoint: lastUrl,
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }
      }
    }

    if (!yampiResponse) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'NO_RESPONSE',
          error: 'Nenhuma resposta obtida da API da Yampi.',
          attempts,
          endpoint: lastUrl,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Handle non-OK responses
    if (!yampiResponse.ok) {
      const statusCode = yampiResponse.status
      console.warn(`[yampi-create-coupon] Final Yampi status: ${statusCode} on ${lastUrl}`)

      const isHtml = isHtmlResponse(lastContentType, responseText)

      let friendlyError = 'Erro ao criar cupom na Yampi'
      let isDuplicate = false

      if (jsonResponse) {
        // Structured JSON from Yampi API
        if (typeof jsonResponse.message === 'string') {
          friendlyError = jsonResponse.message
        } else if (jsonResponse.error) {
          friendlyError =
            typeof jsonResponse.error === 'string'
              ? jsonResponse.error
              : jsonResponse.error.message || JSON.stringify(jsonResponse.error)
        } else if (jsonResponse.errors) {
          friendlyError = Array.isArray(jsonResponse.errors)
            ? jsonResponse.errors.map((e: any) => e.message || JSON.stringify(e)).join(', ')
            : typeof jsonResponse.errors === 'object'
              ? Object.entries(jsonResponse.errors)
                  .map(
                    ([field, errs]) => `${field}: ${Array.isArray(errs) ? errs.join(', ') : errs}`,
                  )
                  .join('; ')
              : JSON.stringify(jsonResponse.errors)
        }

        const lowerErr = friendlyError.toLowerCase()
        isDuplicate =
          statusCode === 409 ||
          (statusCode === 422 &&
            (lowerErr.includes('já existe') ||
              lowerErr.includes('duplicado') ||
              lowerErr.includes('already exists') ||
              lowerErr.includes('code has already been taken')))

        if (statusCode === 401) {
          friendlyError =
            'Credenciais da Yampi inválidas. Verifique o User-Token e User-Secret salvos nas Configurações da loja.'
        } else if (statusCode === 403) {
          friendlyError = `Acesso negado pela API da Yampi: o token configurado não tem permissão para criar cupons de desconto nesta loja (${storeAlias || 'alias'}). Verifique as permissões de API na sua conta Yampi.`
        }
      } else if (isHtml || (sawHtmlBlock && !jsonResponse)) {
        // Explicit friendly message for Cloudflare or CDN HTML blocking
        if (statusCode === 403) {
          friendlyError =
            'A Yampi bloqueou a requisição (Firewall/Cloudflare). Verifique se as credenciais (Token e Secret) estão corretas, se o alias da loja está exato ou contate o suporte da Yampi para autorização de IP da API.'
        } else if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
          friendlyError = `Servidor da Yampi temporariamente indisponível (HTTP ${statusCode}). Tente novamente em instantes.`
        } else {
          friendlyError = `A Yampi retornou uma página de erro (HTTP ${statusCode}) em vez de JSON. Verifique as credenciais e o alias da loja.`
        }
      } else {
        // Plain text fallback (capped and cleaned)
        const cleanSnippet = responseText
          .replace(/<[^>]*>?/gm, '')
          .replace(/\s+/g, ' ')
          .trim()
        friendlyError =
          cleanSnippet.length > 0
            ? cleanSnippet.substring(0, 160)
            : `Erro na API da Yampi (HTTP ${statusCode})`
      }

      return new Response(
        JSON.stringify({
          success: false,
          isDuplicate,
          httpStatus: statusCode,
          endpoint: lastUrl,
          code: rawCode,
          attempts,
          error: isDuplicate ? `O cupom ${rawCode} já existe na sua loja Yampi.` : friendlyError,
          yampiResponse: jsonResponse || undefined,
        }),
        {
          status: isDuplicate ? 409 : 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // Success response parsing
    const yampiData = jsonResponse?.data || jsonResponse || {}
    const createdId = yampiData.id || yampiData.coupon_id || null
    const finalCode = yampiData.code || rawCode

    // Update appointment if appointment_id was provided
    if (body.appointment_id) {
      await supabaseAdmin
        .from('appointments')
        .update({
          coupon_code: finalCode,
          coupon_verified: true,
        })
        .eq('id', body.appointment_id)
        .eq('user_id', effectiveUserId)
    }

    // Update contacts if lead_id was provided
    if (body.lead_id) {
      const updateData: Record<string, any> = {}
      if (body.type === 'percent' || isPercent) {
        updateData.patient_coupon = finalCode
      } else {
        updateData.nutritionist_coupon = finalCode
      }
      await supabaseAdmin
        .from('contacts')
        .update(updateData)
        .eq('id', body.lead_id)
        .eq('user_id', effectiveUserId)
    }

    // Log interaction in interaction_log table
    await supabaseAdmin.from('interaction_log').insert({
      user_id: effectiveUserId,
      type: 'yampi_coupon_created',
      details: {
        coupon_id: createdId,
        coupon_code: finalCode,
        value: discountValue,
        discount_type: yampiType,
        source: 'yampi-create-coupon',
        endpoint: lastUrl,
        appointment_id: body.appointment_id || null,
        lead_id: body.lead_id || null,
        created_at: new Date().toISOString(),
      },
    })

    return new Response(
      JSON.stringify({
        success: true,
        id: createdId,
        code: finalCode,
        couponCode: finalCode,
        discountType: yampiType,
        value: discountValue,
        endpoint: lastUrl,
        attempts,
        yampiResponse: yampiData,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('[yampi-create-coupon] Uncaught error:', error.message)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erro interno ao processar criação de cupom.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
