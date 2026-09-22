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

export interface AttemptLog {
  step?: string
  endpoint: string
  method?: string
  status: number
  isHtml: boolean
  outcome: string
  message?: string
  responseSnippet?: string
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
    // No fallback to Deno.env, never expose secrets in response/logs
    const yampiToken = (await getSecret(supabaseAdmin, effectiveUserId, 'yampi_token')).trim()
    const yampiSecret = (await getSecret(supabaseAdmin, effectiveUserId, 'yampi_secret')).trim()

    if (!yampiToken) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'YAMPI_NOT_CONFIGURED',
          error:
            'A integração com a Yampi não está configurada para este usuário. Configure o User-Token da Yampi nas Configurações.',
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

    // Build standard Yampi Coupon payload according to official Yampi (Dooki) REST API documentation
    const yampiPayload: Record<string, unknown> = {
      code: rawCode,
      type: yampiType, // 'percentage' | 'fixed'
      value: discountValue,
      active: body.active !== undefined ? body.active : true,
    }

    // Also include discount_type & discount_value as compatible aliases
    yampiPayload.discount_type = yampiType
    yampiPayload.discount_value = discountValue

    if (body.usage_limit != null && body.usage_limit > 0) {
      yampiPayload.limit_usage = body.usage_limit
    }
    if (body.usage_limit_per_user != null && body.usage_limit_per_user > 0) {
      yampiPayload.limit_usage_per_customer = body.usage_limit_per_user
    }
    if (body.min_order_value != null && body.min_order_value > 0) {
      yampiPayload.min_purchase_value = body.min_order_value
    }
    if (body.max_discount_value != null && body.max_discount_value > 0) {
      yampiPayload.max_discount_value = body.max_discount_value
    }
    if (body.expires_at) {
      yampiPayload.end_at = body.expires_at
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
    // Yampi v1/v2 accepts User-Token and User-Secret headers
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

    const attempts: AttemptLog[] = []

    // =========================================================================
    // PASSO DE VALIDAÇÃO PRÉVIA (Pre-flight Check)
    // =========================================================================
    // Antes de tentar emitir cupons, testa um endpoint estável e padrão da loja
    // (GET /v2/{alias}/orders?page=1 ou /v2/{alias}/catalog/products?page=1).
    // Isso permite diagnosticar com 100% de precisão:
    // 1) Se o alias existe e a loja responde;
    // 2) Se o User-Token e User-Secret são autênticos (401 se errados);
    // 3) Se o alias é inexistente (404 na rota de pedidos/produtos);
    // 4) Se a loja e credenciais estão OK (200), permitindo isolar qualquer 404
    //    posterior como falta de módulo/permissão de cupons ou endpoint específico.
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
        // Credenciais inválidas confirmadas pelo endpoint de pedidos
        const errMsg =
          preflightJson?.message ||
          'Credenciais da Yampi inválidas. O User-Token ou User-Secret informados estão incorretos.'
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
            code: 'INVALID_CREDENTIALS',
            httpStatus: 401,
            endpoint: preflightUrl,
            error:
              'Credenciais da Yampi inválidas. Verifique se o User-Token e o User-Secret salvos nas Configurações estão exatamente iguais aos gerados no painel da Yampi (Configurações > Credenciais de API).',
            attempts,
            preflight: { ok: false, status: 401, message: errMsg },
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      } else if (preflightStatus === 404) {
        // Alias inexistente confirmado (nem orders responde para este alias)
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
        // Outro status no preflight (ex: 429 rate limit, 500, etc.)
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
    // TENTATIVAS DE CRIAÇÃO DO CUPOM (POST)
    // =========================================================================
    // Endpoints candidatos no gateway oficial api.dooki.com.br:
    // 1. POST https://api.dooki.com.br/v2/{alias}/marketing/coupons
    // 2. POST https://api.dooki.com.br/v2/{alias}/promotions/coupons
    // 3. POST https://api.dooki.com.br/v2/{alias}/coupons
    // =========================================================================
    const candidateUrls: string[] = [
      `https://api.dooki.com.br/v2/${storeAlias}/marketing/coupons`,
      `https://api.dooki.com.br/v2/${storeAlias}/promotions/coupons`,
      `https://api.dooki.com.br/v2/${storeAlias}/coupons`,
    ]

    let yampiResponse: Response | null = null
    let responseText = ''
    let jsonResponse: any = null
    let lastUrl = candidateUrls[0]
    let lastStatus = 0
    let lastContentType = ''
    let sawHtmlBlock = false
    let haltedOn404Json = false

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
            step: 'coupon_creation',
            endpoint: url,
            method: 'POST',
            status: res.status,
            isHtml: false,
            outcome: 'success',
            message: 'Cupom criado com sucesso',
          })
          yampiResponse = res
          responseText = text
          jsonResponse = parsed
          break
        }

        // Case B: Non-OK with valid JSON body from Dooki/Yampi API (NOT HTML)
        if (parsed !== null && !isHtml) {
          const summaryMsg =
            parsed.message ||
            parsed.error ||
            (parsed.errors
              ? typeof parsed.errors === 'string'
                ? parsed.errors
                : JSON.stringify(parsed.errors)
              : `HTTP ${res.status}`)

          // B.1: Auth/Permission error (401 or 403 JSON) -> Stop immediately
          if (res.status === 401 || res.status === 403) {
            attempts.push({
              step: 'coupon_creation',
              endpoint: url,
              method: 'POST',
              status: res.status,
              isHtml: false,
              outcome: res.status === 401 ? 'unauthorized' : 'forbidden',
              message: summaryMsg,
              responseSnippet: text.substring(0, 200),
            })
            yampiResponse = res
            responseText = text
            jsonResponse = parsed
            console.warn(
              `[yampi-create-coupon] Rota ${url} retornou JSON HTTP ${res.status} (autenticação/permissão). Interrompendo tentativas.`,
            )
            break
          }

          // B.2: 404 Not Found on api.dooki.com.br
          if (res.status === 404 || res.status === 405) {
            attempts.push({
              step: 'coupon_creation',
              endpoint: url,
              method: 'POST',
              status: res.status,
              isHtml: false,
              outcome: 'route_not_found',
              message: summaryMsg,
              responseSnippet: text.substring(0, 200),
            })

            // If there are other dooki routes left, try them
            if (!isLastUrl) {
              console.warn(
                `[yampi-create-coupon] Rota ${url} retornou 404 JSON ("${summaryMsg}"), testando próxima alternativa Dooki...`,
              )
              continue
            }

            // All candidate routes on api.dooki.com.br returned 404 JSON.
            haltedOn404Json = true
            yampiResponse = res
            responseText = text
            jsonResponse = parsed
            console.warn(
              `[yampi-create-coupon] Todas as rotas api.dooki.com.br retornaram 404 Not Found para o alias "${storeAlias}".`,
            )
            break
          }

          // B.3: Validation error (e.g. 422 Unprocessable Entity, 409 Conflict)
          attempts.push({
            step: 'coupon_creation',
            endpoint: url,
            method: 'POST',
            status: res.status,
            isHtml: false,
            outcome: res.status === 409 ? 'duplicate' : 'validation_error',
            message: summaryMsg,
            responseSnippet: text.substring(0, 200),
          })
          yampiResponse = res
          responseText = text
          jsonResponse = parsed
          break
        }

        // Case C: HTML or non-JSON response (Cloudflare WAF block or CDN page)
        attempts.push({
          step: 'coupon_creation',
          endpoint: url,
          method: 'POST',
          status: res.status,
          isHtml: true,
          outcome: 'html_blocked',
          message: isHtml ? 'Bloqueio Cloudflare/WAF (HTML)' : `HTTP ${res.status}`,
          responseSnippet: text.substring(0, 150),
        })
        yampiResponse = res
        responseText = text
        jsonResponse = null

        if (!isLastUrl) {
          console.warn(
            `[yampi-create-coupon] Rota ${url} retornou resposta HTML/não-JSON HTTP ${res.status}, tentando alternativa...`,
          )
          continue
        }

        break
      } catch (fetchErr: any) {
        attempts.push({
          step: 'coupon_creation',
          endpoint: url,
          method: 'POST',
          status: 0,
          isHtml: false,
          outcome: 'network_error',
          message: fetchErr.message,
        })
        console.error(`[yampi-create-coupon] Erro de rede em ${url}:`, fetchErr.message)
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
      console.warn(
        `[yampi-create-coupon] Resposta Yampi final: HTTP ${statusCode} na rota ${lastUrl}`,
      )

      const isHtml = isHtmlResponse(lastContentType, responseText)
      let friendlyError = 'Erro ao criar cupom na Yampi'
      let isDuplicate = false

      if (haltedOn404Json) {
        // Distingue com base no pre-flight anterior:
        if (preflightSuccess) {
          friendlyError =
            `A loja '${storeAlias}' e as credenciais foram validadas com sucesso na API da Yampi (GET /orders respondeu OK), ` +
            `porém todas as rotas de criação de cupons retornaram 404 Not Found. ` +
            `Isso indica que o plano atual da loja Yampi ou as permissões desta chave de API não incluem o módulo de cupons/marketing. ` +
            `Verifique no painel da Yampi (Marketing > Cupons) se a criação manual de cupons está disponível para este plano e se a chave de API tem permissão de criação em Cupons.`
        } else {
          friendlyError =
            `A API da Yampi respondeu 404 Not Found para a loja '${storeAlias}'. ` +
            `Verifique se o alias da loja está exatamente igual ao indicado no painel da Yampi (o subdomínio que aparece na URL do painel administrativo, ex: https://admin.yampi.com.br/{alias}) ` +
            `e se a sua conta Yampi possui o módulo de cupons habilitado.`
        }
      } else if (jsonResponse) {
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
            'Credenciais da Yampi inválidas. Verifique se o User-Token e o User-Secret salvos nas Configurações da loja estão corretos.'
        } else if (statusCode === 403) {
          friendlyError = `Acesso negado pela API da Yampi: o token configurado não tem permissão para gerenciar cupons na loja (${storeAlias}). Verifique as permissões da chave de API no painel da Yampi.`
        }
      } else if (isHtml || (sawHtmlBlock && !jsonResponse)) {
        if (statusCode === 403) {
          friendlyError =
            'A Yampi bloqueou a requisição via Firewall/Cloudflare. As rotas oficiais devem ser acessadas via api.dooki.com.br. Verifique o alias da loja e credenciais no painel.'
        } else if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
          friendlyError = `Servidor da Yampi temporariamente indisponível (HTTP ${statusCode}). Tente novamente em alguns instantes.`
        } else {
          friendlyError = `A Yampi retornou uma página de erro (HTTP ${statusCode}) em vez de JSON. Verifique as credenciais e o alias da loja.`
        }
      } else {
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
          preflight: {
            ok: preflightSuccess,
            status: preflightStatus,
            message: preflightMessage,
          },
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
