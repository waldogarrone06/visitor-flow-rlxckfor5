import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { getSecret } from '../_shared/integration-secrets.ts'

interface CreateCouponPayload {
  userId?: string
  code?: string
  type?: 'fixed' | 'percent' | 'percentage' | 'value' | 'p' | 'v' | 'f' | string
  discount_type?: 'p' | 'v' | 'f' | 'percentage' | 'fixed' | string
  value?: number
  quantity?: number
  min_value?: number
  min_order_value?: number | null
  max_discount_value?: number | null
  usage_limit?: number | null
  usage_limit_per_user?: number | null
  once_per_customer?: boolean
  accumulate?: boolean
  free_shipment?: boolean
  free_shipping?: boolean
  expires_at?: string | null
  end_at?: string | null
  start_at?: string | null
  active?: boolean
  description?: string
  name?: string
  prescritor?: string
  lead_id?: string
  appointment_id?: string
  context?: Record<string, unknown>
}

export interface AttemptLog {
  step?: string
  endpoint: string
  method?: string
  status: number
  isHtml: boolean
  outcome: string
  message?: string
  responseSnippet?: string
  codeTried?: string
}

/**
 * Format a Date to Yampi required format: YYYY-MM-DD HH:MM:SS
 */
function formatYampiDate(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const yyyy = date.getFullYear()
  const mm = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const hh = pad(date.getHours())
  const mi = pad(date.getMinutes())
  const ss = pad(date.getSeconds())
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

/**
 * Parse any date string / ISO into YYYY-MM-DD HH:MM:SS
 */
function toYampiDateString(val?: string | null): string | null {
  if (!val) return null
  const trimmed = val.trim()
  if (!trimmed) return null

  // If already in YYYY-MM-DD HH:MM:SS
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed
  }

  const parsed = new Date(trimmed)
  if (isNaN(parsed.getTime())) {
    return null
  }
  return formatYampiDate(parsed)
}

/**
 * Slugify a prescriber / lead name into a valid, clean coupon code:
 * uppercase, remove accents, keep only [A-Z0-9], max 40 chars.
 */
function slugifyCode(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 40)
}

/**
 * Generate a clean base code if none provided
 */
function generateBaseCode(nameOrPrescriber?: string): string {
  const base = slugifyCode(nameOrPrescriber || 'LEAD')
  const cleanBase = (base || 'VF').substring(0, 15)
  return cleanBase
}

/**
 * Check if response body is HTML (e.g. Cloudflare WAF block or error page)
 */
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

/**
 * Check if the 422 error is due to a duplicate coupon code
 */
function isDuplicateCodeError(status: number, text: string, json: any): boolean {
  if (status === 409) return true
  if (status !== 422) return false

  const combined = (text + ' ' + JSON.stringify(json || {})).toLowerCase()

  const hasCode =
    combined.includes('code') || combined.includes('código') || combined.includes('cupom')
  const hasTaken =
    combined.includes('já') ||
    combined.includes('taken') ||
    combined.includes('unique') ||
    combined.includes('existe') ||
    combined.includes('utiliz') ||
    combined.includes('cadastrado') ||
    combined.includes('duplic') ||
    combined.includes('already')

  return hasCode && hasTaken
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Quick healthcheck / version check via GET
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({
        status: 'active',
        version: 'v2-pricing-promocodes',
        primaryRoute: 'POST https://api.dooki.com.br/v2/{alias}/pricing/promocodes',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Configuração do Supabase ausente no ambiente.',
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
        '[yampi-create-coupon] Erro ao consultar user_integrations:',
        integrationError.message,
      )
    }

    const rawAlias = (userIntegration?.yampi_alias || '').trim()
    const storeAlias = rawAlias.toLowerCase().replace(/[^a-z0-9_-]/g, '')

    // Read secrets EXCLUSIVELY from integration_secrets via service_role admin client
    const yampiToken = (await getSecret(supabaseAdmin, effectiveUserId, 'yampi_token')).trim()
    const yampiSecret = (await getSecret(supabaseAdmin, effectiveUserId, 'yampi_secret')).trim()

    if (!yampiToken) {
      console.warn(
        `[yampi-create-coupon] User-Token da Yampi não encontrado para o usuário ${effectiveUserId}`,
      )
      return new Response(
        JSON.stringify({
          success: false,
          code: 'YAMPI_TOKEN_MISSING',
          error:
            'O User-Token da Yampi não está preenchido. Acesse Configurações > Integração Yampi e salve o User-Token gerado no painel da Yampi.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!yampiSecret) {
      console.warn(
        `[yampi-create-coupon] User-Secret-Key da Yampi não encontrado ou vazio para o usuário ${effectiveUserId}`,
      )
      return new Response(
        JSON.stringify({
          success: false,
          code: 'YAMPI_SECRET_MISSING',
          error:
            'A chave secreta da Yampi (User-Secret-Key) não está configurada ou está vazia. A API da Yampi exige obrigatoriamente os dois cabeçalhos juntos (User-Token e User-Secret-Key). Acesse Configurações > Integração Yampi e preencha o campo User-Secret-Key da Yampi.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!storeAlias) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'YAMPI_ALIAS_REQUIRED',
          error:
            'O alias da loja Yampi não foi preenchido. Salve o alias da sua loja nas Configurações (ex: o subdomínio em https://admin.yampi.com.br/{alias}).',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Check if an appointment was specified and already has verified coupon
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

    // Determine base code
    let baseCode = ''
    if (body.code && body.code.trim()) {
      // User or caller specified code explicitly: slugify and uppercase
      // Also allow hyphens/underscores if present in custom codes, but normalize accents
      baseCode = body.code
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '')
        .substring(0, 40)
    } else {
      // Derive from prescritor / name
      const nameSource = body.prescritor || body.name || 'CUPOM'
      baseCode = generateBaseCode(nameSource)
    }

    if (!baseCode) {
      baseCode = `VIP${Math.floor(1000 + Math.random() * 9000)}`
    }

    // Discount type: Yampi expects 'p' for percentage, or 'v'/'f' for fixed value.
    // Default to 'p'
    const rawType = (body.discount_type || body.type || 'p').toString().toLowerCase()
    let discountType = 'p'
    if (rawType === 'fixed' || rawType === 'v' || rawType === 'f' || rawType === 'value') {
      discountType = 'v'
    } else {
      discountType = 'p'
    }

    const discountValue = Number(body.value ?? 10)
    const quantity = Number(body.quantity ?? 100000)
    const minValue = Number(body.min_value ?? body.min_order_value ?? 0)
    const oncePerCustomer =
      body.once_per_customer !== undefined
        ? Boolean(body.once_per_customer)
        : body.usage_limit_per_user === 1
          ? true
          : true
    const accumulate = Boolean(body.accumulate ?? false)
    const freeShipment = Boolean(body.free_shipment ?? body.free_shipping ?? false)
    const active = body.active !== undefined ? Boolean(body.active) : true

    // Dates formatted as YYYY-MM-DD HH:MM:SS
    const startAt = toYampiDateString(body.start_at) || formatYampiDate(new Date())
    const endAt = toYampiDateString(body.end_at || body.expires_at)

    // Prepare Yampi API authentication headers
    const yampiHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 VisitorFlow/1.0',
      Accept: 'application/json',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Content-Type': 'application/json',
      'User-Token': yampiToken,
      'User-Secret-Key': yampiSecret,
    }

    const attempts: AttemptLog[] = []

    // =========================================================================
    // PASSO DE VALIDAÇÃO PRÉVIA (Pre-flight Check)
    // =========================================================================
    // GET /v2/{alias}/orders?page=1
    // =========================================================================
    const preflightUrl = `https://api.dooki.com.br/v2/${storeAlias}/orders?page=1`
    let preflightSuccess = false
    let preflightStatus = 0
    let preflightMessage = ''

    try {
      const preflightRes = await fetch(preflightUrl, {
        method: 'GET',
        headers: yampiHeaders,
      })

      preflightStatus = preflightRes.status
      const preflightContentType = preflightRes.headers.get('content-type') || ''
      const preflightText = await preflightRes.text()

      let preflightJson: any = null
      try {
        preflightJson = JSON.parse(preflightText)
      } catch {
        preflightJson = null
      }

      const preflightIsHtml = isHtmlResponse(preflightContentType, preflightText)
      const snippet = preflightText.substring(0, 200)

      if (preflightRes.ok) {
        preflightSuccess = true
        preflightMessage = 'Loja e credenciais autenticadas com sucesso na Yampi'
        attempts.push({
          step: 'preflight',
          endpoint: preflightUrl,
          method: 'GET',
          status: preflightRes.status,
          isHtml: false,
          outcome: 'preflight_success',
          message: 'Loja acessível e credenciais válidas (GET orders OK)',
          responseSnippet: snippet,
        })
      } else if (preflightStatus === 401) {
        const rawPreflightMsg = String(preflightJson?.message || '').trim()
        const lowerPreflightMsg = rawPreflightMsg.toLowerCase()

        let specificCode = 'INVALID_CREDENTIALS'
        let userOrientedError =
          'Credenciais da Yampi inválidas. Verifique se o User-Token e o User-Secret-Key salvos nas Configurações estão exatamente iguais aos gerados no painel da Yampi (Configurações > Credenciais de API).'

        if (
          lowerPreflightMsg.includes('missing user-secret-key header') ||
          lowerPreflightMsg.includes('missing user-secret') ||
          lowerPreflightMsg.includes('secret-key header')
        ) {
          specificCode = 'MISSING_USER_SECRET_KEY'
          userOrientedError =
            'A API da Yampi reportou que a chave secreta (User-Secret-Key) não foi enviada ou está ausente. Acesse Configurações > Integração Yampi e preencha o campo User-Secret-Key da Yampi com a chave secreta gerada no painel da Yampi.'
        } else if (lowerPreflightMsg.includes('missing user-token header')) {
          specificCode = 'MISSING_USER_TOKEN'
          userOrientedError =
            'A API da Yampi reportou que o User-Token não foi enviado ou está ausente. Acesse Configurações > Integração Yampi e salve o User-Token.'
        }

        const errMsg = rawPreflightMsg || userOrientedError
        attempts.push({
          step: 'preflight',
          endpoint: preflightUrl,
          method: 'GET',
          status: 401,
          isHtml: false,
          outcome: 'unauthorized',
          message: errMsg,
          responseSnippet: snippet,
        })

        return new Response(
          JSON.stringify({
            success: false,
            code: specificCode,
            httpStatus: 401,
            endpoint: preflightUrl,
            error: userOrientedError,
            attempts,
            preflight: { ok: false, status: 401, message: errMsg },
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      } else if (preflightStatus === 404) {
        const errMsg =
          preflightJson?.message || `A loja '${storeAlias}' não foi encontrada na API da Yampi.`
        attempts.push({
          step: 'preflight',
          endpoint: preflightUrl,
          method: 'GET',
          status: 404,
          isHtml: false,
          outcome: 'store_not_found',
          message: errMsg,
          responseSnippet: snippet,
        })

        return new Response(
          JSON.stringify({
            success: false,
            code: 'STORE_ALIAS_NOT_FOUND',
            httpStatus: 404,
            endpoint: preflightUrl,
            error:
              `A loja com o alias '${storeAlias}' não foi encontrada na API da Yampi (HTTP 404 na validação prévia). ` +
              `Confirme o alias exato da sua loja Yampi (é o subdomínio que aparece no painel administrativo, ex: https://admin.yampi.com.br/{alias}).`,
            attempts,
            preflight: { ok: false, status: 404, message: errMsg },
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      } else if (preflightStatus === 403) {
        const errMsg =
          preflightJson?.message ||
          `Chave de API sem permissão para acessar os dados da loja '${storeAlias}'.`
        attempts.push({
          step: 'preflight',
          endpoint: preflightUrl,
          method: 'GET',
          status: 403,
          isHtml: preflightIsHtml,
          outcome: 'forbidden',
          message: errMsg,
          responseSnippet: snippet,
        })

        return new Response(
          JSON.stringify({
            success: false,
            code: 'FORBIDDEN',
            httpStatus: 403,
            endpoint: preflightUrl,
            error:
              `Acesso negado pela API da Yampi para a loja '${storeAlias}' (HTTP 403). ` +
              `Verifique as permissões da sua chave de API no painel da Yampi (se possui permissão de leitura e escrita).`,
            attempts,
            preflight: { ok: false, status: 403, message: errMsg },
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      } else {
        attempts.push({
          step: 'preflight',
          endpoint: preflightUrl,
          method: 'GET',
          status: preflightStatus,
          isHtml: preflightIsHtml,
          outcome: 'preflight_warning',
          message: preflightJson?.message || `Pre-flight respondeu HTTP ${preflightStatus}`,
          responseSnippet: snippet,
        })
      }
    } catch (preflightErr: any) {
      console.warn('[yampi-create-coupon] Falha no preflight:', preflightErr.message)
      attempts.push({
        step: 'preflight',
        endpoint: preflightUrl,
        method: 'GET',
        status: 0,
        isHtml: false,
        outcome: 'preflight_network_error',
        message: `Falha de conexão com api.dooki.com.br: ${preflightErr.message}`,
      })
    }

    // =========================================================================
    // ENDPOINTS CANDIDATOS
    // 1. ROTA PRINCIPAL (Correta Yampi): POST https://api.dooki.com.br/v2/{alias}/pricing/promocodes
    // 2. Fallbacks secundários: /marketing/coupons, /coupons
    // =========================================================================
    const candidateUrls: string[] = [
      `https://api.dooki.com.br/v2/${storeAlias}/pricing/promocodes`,
      `https://api.dooki.com.br/v2/${storeAlias}/marketing/coupons`,
      `https://api.dooki.com.br/v2/${storeAlias}/coupons`,
    ]

    let finalSuccessData: any = null
    let finalCodeUsed = baseCode
    let finalUrlUsed = candidateUrls[0]
    let lastStatus = 0
    let lastErrorText = ''
    let lastParsedJson: any = null
    let lastIsHtml = false
    let exhaustedDuplicates = false

    // We will test the routes. For the primary route (and fallbacks),
    // if duplicate code error occurs (422 code taken), we retry with suffixes 2, 3, 4... up to 20!
    // (Edge function version: v2-promocodes-verified)
    routeLoop: for (let r = 0; r < candidateUrls.length; r++) {
      const endpoint = candidateUrls[r]
      finalUrlUsed = endpoint
      const isPrimaryRoute = r === 0
      const maxCodeAttempts = 20

      for (let attemptIdx = 0; attemptIdx < maxCodeAttempts; attemptIdx++) {
        // Compute code to try: baseCode on first attempt, then baseCode + suffix
        const currentCode =
          attemptIdx === 0 ? baseCode : `${baseCode.substring(0, 36)}${attemptIdx + 1}`

        finalCodeUsed = currentCode

        // Build exact Yampi payload according to reference:
        // {
        //   "code": "<codigo>",
        //   "discount_type": "p",
        //   "value": 10,
        //   "quantity": 100000,
        //   "min_value": 0,
        //   "active": true,
        //   "once_per_customer": true,
        //   "accumulate": false,
        //   "free_shipment": false,
        //   "start_at": "YYYY-MM-DD HH:MM:SS"
        // }
        const payload: Record<string, unknown> = {
          code: currentCode,
          discount_type: discountType,
          value: discountValue,
          quantity: quantity,
          min_value: minValue,
          active: active,
          once_per_customer: oncePerCustomer,
          accumulate: accumulate,
          free_shipment: freeShipment,
          start_at: startAt,
        }

        if (endAt) {
          payload.end_at = endAt
        }

        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: yampiHeaders,
            body: JSON.stringify(payload),
          })

          lastStatus = res.status
          const cType = res.headers.get('content-type') || ''
          const text = await res.text()
          lastErrorText = text
          lastIsHtml = isHtmlResponse(cType, text)

          let parsed: any = null
          try {
            parsed = JSON.parse(text)
          } catch {
            parsed = null
          }
          lastParsedJson = parsed

          // SUCCESS
          if (res.ok) {
            attempts.push({
              step: 'coupon_creation',
              endpoint,
              method: 'POST',
              status: res.status,
              isHtml: false,
              outcome: 'success',
              message: `Cupom criado com sucesso (${currentCode})`,
              codeTried: currentCode,
            })
            finalSuccessData = parsed
            break routeLoop
          }

          // AUTH ERROR (401 / 403 JSON) -> Stop immediately
          if ((res.status === 401 || res.status === 403) && !lastIsHtml) {
            const summary = parsed?.message || parsed?.error || `HTTP ${res.status}`
            attempts.push({
              step: 'coupon_creation',
              endpoint,
              method: 'POST',
              status: res.status,
              isHtml: false,
              outcome: res.status === 401 ? 'unauthorized' : 'forbidden',
              message: summary,
              codeTried: currentCode,
              responseSnippet: text.substring(0, 200),
            })
            break routeLoop
          }

          // DUPLICATE CODE CHECK
          if (isDuplicateCodeError(res.status, text, parsed)) {
            attempts.push({
              step: 'coupon_creation',
              endpoint,
              method: 'POST',
              status: res.status,
              isHtml: false,
              outcome: 'duplicate_retry',
              message: `Código '${currentCode}' já existe. Tentando próximo sufixo...`,
              codeTried: currentCode,
              responseSnippet: text.substring(0, 200),
            })

            if (attemptIdx === maxCodeAttempts - 1) {
              exhaustedDuplicates = true
              console.warn(
                `[yampi-create-coupon] Esgotadas ${maxCodeAttempts} tentativas de sufixo para ${baseCode}`,
              )
            }
            // Loop continues to attemptIdx + 1
            continue
          }

          // 404 / 405 ROUTE NOT FOUND
          if (res.status === 404 || res.status === 405) {
            attempts.push({
              step: 'coupon_creation',
              endpoint,
              method: 'POST',
              status: res.status,
              isHtml: lastIsHtml,
              outcome: 'route_not_found',
              message: parsed?.message || `HTTP ${res.status} Rota não encontrada`,
              codeTried: currentCode,
              responseSnippet: text.substring(0, 200),
            })
            // If route not found, no need to retry suffixes on this route — go to next candidate route!
            break
          }

          // OTHER 4xx / 5xx VALIDATION OR SERVER ERROR
          attempts.push({
            step: 'coupon_creation',
            endpoint,
            method: 'POST',
            status: res.status,
            isHtml: lastIsHtml,
            outcome: lastIsHtml ? 'html_blocked' : 'validation_error',
            message:
              parsed?.message ||
              (parsed?.errors ? JSON.stringify(parsed.errors) : `HTTP ${res.status}`),
            codeTried: currentCode,
            responseSnippet: text.substring(0, 200),
          })

          // Do not retry suffixes on non-duplicate errors
          break
        } catch (fetchErr: any) {
          attempts.push({
            step: 'coupon_creation',
            endpoint,
            method: 'POST',
            status: 0,
            isHtml: false,
            outcome: 'network_error',
            message: fetchErr.message,
            codeTried: currentCode,
          })
          console.error(`[yampi-create-coupon] Erro de rede em ${endpoint}:`, fetchErr.message)
          break
        }
      }
    }

    // Check if we failed
    if (!finalSuccessData) {
      console.warn(
        `[yampi-create-coupon] Falha ao criar cupom. Último status: ${lastStatus} na rota ${finalUrlUsed}`,
      )

      let friendlyError = 'Erro ao criar cupom na Yampi'
      let isDuplicate = false

      if (exhaustedDuplicates) {
        isDuplicate = true
        friendlyError = `O código base '${baseCode}' e todos os sufixos incrementais (até +${20}) já foram utilizados na sua loja Yampi. Escolha outro código base.`
      } else if (lastStatus === 401) {
        friendlyError =
          'Credenciais da Yampi inválidas ou ausentes (HTTP 401). Verifique se o User-Token e o User-Secret-Key salvos nas Configurações estão preenchidos e válidos.'
      } else if (lastStatus === 403 && !lastIsHtml) {
        friendlyError = `Acesso negado pela API da Yampi (HTTP 403): suas credenciais de API não possuem permissão para gerenciar cupons/pricing na loja '${storeAlias}'. Verifique as permissões de leitura/escrita no painel da Yampi.`
      } else if (lastIsHtml) {
        if (lastStatus === 403) {
          friendlyError =
            'A requisição foi bloqueada pelo Firewall/Cloudflare da Yampi (HTML 403). Verifique se as credenciais e o alias da loja estão corretos.'
        } else {
          friendlyError = `A Yampi retornou uma página HTML (HTTP ${lastStatus}) em vez de JSON. Verifique a URL e o alias da loja.`
        }
      } else if (lastStatus === 404) {
        if (preflightSuccess) {
          friendlyError = `A loja '${storeAlias}' foi validada com sucesso na API da Yampi (GET /orders respondeu 200 OK), porém a rota de cupons (${finalUrlUsed}) retornou 404 Not Found. Verifique se o módulo de cupons/pricing está ativo no seu plano da Yampi.`
        } else {
          friendlyError = `A loja com o alias '${storeAlias}' não foi encontrada na API da Yampi (HTTP 404). Verifique o alias salvo nas Configurações.`
        }
      } else if (lastParsedJson) {
        if (typeof lastParsedJson.message === 'string') {
          friendlyError = lastParsedJson.message
        } else if (lastParsedJson.error) {
          friendlyError =
            typeof lastParsedJson.error === 'string'
              ? lastParsedJson.error
              : lastParsedJson.error.message || JSON.stringify(lastParsedJson.error)
        } else if (lastParsedJson.errors) {
          friendlyError = Array.isArray(lastParsedJson.errors)
            ? lastParsedJson.errors.map((e: any) => e.message || JSON.stringify(e)).join(', ')
            : typeof lastParsedJson.errors === 'object'
              ? Object.entries(lastParsedJson.errors)
                  .map(
                    ([field, errs]) => `${field}: ${Array.isArray(errs) ? errs.join(', ') : errs}`,
                  )
                  .join('; ')
              : JSON.stringify(lastParsedJson.errors)
        }
      }

      return new Response(
        JSON.stringify({
          success: false,
          isDuplicate,
          httpStatus: lastStatus,
          endpoint: finalUrlUsed,
          code: finalCodeUsed,
          attempts,
          error: friendlyError,
          yampiResponse: lastParsedJson || undefined,
          preflight: {
            ok: preflightSuccess,
            status: preflightStatus,
            message: preflightMessage,
          },
        }),
        {
          status: isDuplicate ? 409 : lastStatus >= 400 && lastStatus < 500 ? 400 : 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // Success response parsing
    const yampiData = finalSuccessData?.data || finalSuccessData || {}
    const createdId = yampiData.id || yampiData.promocode_id || yampiData.coupon_id || null
    const finalCode = yampiData.code || finalCodeUsed

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
      if (discountType === 'p') {
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
        discount_type: discountType,
        source: 'yampi-create-coupon',
        endpoint: finalUrlUsed,
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
        discountType,
        value: discountValue,
        endpoint: finalUrlUsed,
        attempts,
        preflight: {
          ok: preflightSuccess,
          status: preflightStatus,
          message: preflightMessage,
        },
        yampiResponse: yampiData,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('[yampi-create-coupon] Erro não tratado:', error.message)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erro interno ao processar criação de cupom.',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
