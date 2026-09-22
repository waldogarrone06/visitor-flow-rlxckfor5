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

// Normalize discount type to Yampi format (common formats are "percentage" | "fixed" / "percent" | "value")
function normalizeDiscountType(type?: string): { yampiType: string; isPercent: boolean } {
  const clean = (type || '').toLowerCase()
  if (clean === 'percent' || clean === 'percentage' || clean === '%') {
    return { yampiType: 'percentage', isPercent: true }
  }
  return { yampiType: 'fixed', isPercent: false }
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

    const storeAlias = (userIntegration?.yampi_alias || '').trim()

    // Read secrets EXCLUSIVELY from integration_secrets via service_role admin client
    // No fallback to Deno.env
    const yampiToken = await getSecret(supabaseAdmin, effectiveUserId, 'yampi_token')
    const yampiSecret = await getSecret(supabaseAdmin, effectiveUserId, 'yampi_secret')

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

    // Build standard Yampi Coupon payload according to Yampi REST API documentation
    // Yampi uses: code, type ("percentage" | "fixed"), value, active, limit_usage, limit_usage_per_customer, min_purchase_value, etc.
    const yampiPayload: Record<string, unknown> = {
      code: rawCode,
      type: yampiType,
      value: discountValue,
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

    // Prepare Yampi API authentication headers
    // Yampi v1/v2 accepts User-Token and optional User-Secret or Bearer
    const yampiHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Token': yampiToken,
    }
    if (yampiSecret) {
      yampiHeaders['User-Secret'] = yampiSecret
    }

    // Yampi API base URL resolution:
    // 1) If store alias is provided, endpoint is https://api.yampi.com.br/v2/{alias}/promotions/coupons or https://api.yampi.com.br/v1/{alias}/coupons
    // 2) Default Yampi API endpoint: https://api.yampi.com.br/v2/{alias}/promotions/coupons
    const targetAlias = storeAlias || 'store'
    const primaryUrl = `https://api.yampi.com.br/v2/${targetAlias}/promotions/coupons`
    const fallbackUrl = `https://api.yampi.com.br/v1/coupons`

    let yampiResponse: Response | null = null
    let responseText = ''
    let jsonResponse: any = null
    let attemptedUrl = primaryUrl

    try {
      yampiResponse = await fetch(primaryUrl, {
        method: 'POST',
        headers: yampiHeaders,
        body: JSON.stringify(yampiPayload),
      })
      responseText = await yampiResponse.text()
      try {
        jsonResponse = JSON.parse(responseText)
      } catch {
        jsonResponse = null
      }

      // If store alias was missing or 404 was returned on v2 alias route, try fallback v1/coupons endpoint
      if (yampiResponse.status === 404 && (!storeAlias || primaryUrl.includes('/store/'))) {
        attemptedUrl = fallbackUrl
        const retryRes = await fetch(fallbackUrl, {
          method: 'POST',
          headers: yampiHeaders,
          body: JSON.stringify(yampiPayload),
        })
        const retryText = await retryRes.text()
        let retryJson: any = null
        try {
          retryJson = JSON.parse(retryText)
        } catch {
          retryJson = null
        }
        if (retryRes.ok) {
          yampiResponse = retryRes
          responseText = retryText
          jsonResponse = retryJson
        }
      }
    } catch (fetchErr: any) {
      console.error('[yampi-create-coupon] Network fetch error to Yampi API:', fetchErr.message)
      return new Response(
        JSON.stringify({
          success: false,
          error: `Falha de conexão com a API da Yampi: ${fetchErr.message}`,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Handle Yampi response
    if (!yampiResponse.ok) {
      const statusCode = yampiResponse.status
      console.warn(`[yampi-create-coupon] Yampi responded with HTTP ${statusCode}`)

      let errorMessage = 'Erro ao criar cupom na Yampi'
      if (jsonResponse) {
        if (typeof jsonResponse.message === 'string') {
          errorMessage = jsonResponse.message
        } else if (jsonResponse.error) {
          errorMessage =
            typeof jsonResponse.error === 'string'
              ? jsonResponse.error
              : jsonResponse.error.message || JSON.stringify(jsonResponse.error)
        } else if (jsonResponse.errors) {
          errorMessage = Array.isArray(jsonResponse.errors)
            ? jsonResponse.errors.map((e: any) => e.message || e).join(', ')
            : JSON.stringify(jsonResponse.errors)
        }
      } else if (responseText) {
        errorMessage = responseText.substring(0, 200)
      }

      const lowerErr = errorMessage.toLowerCase()
      const isDuplicate =
        statusCode === 409 ||
        (statusCode === 422 &&
          (lowerErr.includes('já existe') ||
            lowerErr.includes('duplicado') ||
            lowerErr.includes('already exists') ||
            lowerErr.includes('code has already been taken')))

      return new Response(
        JSON.stringify({
          success: false,
          isDuplicate,
          httpStatus: statusCode,
          endpoint: attemptedUrl,
          code: rawCode,
          error: isDuplicate
            ? `O cupom ${rawCode} já existe na sua loja Yampi.`
            : `Erro da Yampi (${statusCode}): ${errorMessage}`,
        }),
        {
          status: statusCode === 409 || isDuplicate ? 409 : 400,
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
