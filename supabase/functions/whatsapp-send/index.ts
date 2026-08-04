import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getOfficialAccessToken, getSecret } from '../_shared/integration-secrets.ts'
import { normalizePhoneVariants } from '../_shared/whatsapp-security.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const {
      to,
      text,
      isTemplate,
      templateName,
      templateLanguage,
      templateComponents,
      parameters,
      parameterFormat,
      contactId,
      dbMessageId,
    } = body

    if (!to) throw new Error('Parâmetro "to" é obrigatório.')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

    let userId = body.userId
    const authHeader = req.headers.get('Authorization')
    if (authHeader && !userId) {
      const tmpClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const {
        data: { user },
      } = await tmpClient.auth.getUser()
      if (user) userId = user.id
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    let providerType: string = body.providerType || 'evolution'
    let cfg: Record<string, string> = {}

    if (body.testCredentials?.providerType) {
      providerType = body.testCredentials.providerType
      cfg = body.testCredentials

      if (providerType === 'official' && userId && !cfg.officialAccessToken && !cfg.accessToken) {
        const { data: fallbackIntegration } = await supabaseAdmin
          .from('user_integrations')
          .select('whatsapp_official_phone_number_id, whatsapp_official_waba_id')
          .eq('user_id', userId)
          .maybeSingle()

        const fallbackToken = await getOfficialAccessToken(supabaseAdmin, userId)
        if (fallbackToken) {
          cfg.officialAccessToken = fallbackToken
        }
        if (!cfg.officialPhoneNumberId && fallbackIntegration?.whatsapp_official_phone_number_id) {
          cfg.officialPhoneNumberId = fallbackIntegration.whatsapp_official_phone_number_id
        }
        if (!cfg.officialWabaId && fallbackIntegration?.whatsapp_official_waba_id) {
          cfg.officialWabaId = fallbackIntegration.whatsapp_official_waba_id
        }
      }

      if (providerType === 'evolution' && userId && !cfg.apiToken) {
        const fallbackToken = await getSecret(supabaseAdmin, userId, 'whatsapp_api_token')
        if (fallbackToken) {
          cfg.apiToken = fallbackToken
        }
        if (!cfg.apiUrl || !cfg.instanceId) {
          const { data: fallbackEvoIntegration } = await supabaseAdmin
            .from('user_integrations')
            .select('whatsapp_api_url, whatsapp_instance_id')
            .eq('user_id', userId)
            .maybeSingle()
          if (!cfg.apiUrl && fallbackEvoIntegration?.whatsapp_api_url) {
            cfg.apiUrl = fallbackEvoIntegration.whatsapp_api_url
          }
          if (!cfg.instanceId && fallbackEvoIntegration?.whatsapp_instance_id) {
            cfg.instanceId = fallbackEvoIntegration.whatsapp_instance_id
          }
        }
      }
    } else if (userId) {
      const { data: integration } = await supabaseAdmin
        .from('user_integrations')
        .select(
          'primary_provider, whatsapp_provider_type, whatsapp_official_phone_number_id, whatsapp_official_waba_id, whatsapp_api_url, whatsapp_instance_id',
        )
        .eq('user_id', userId)
        .maybeSingle()

      if (!integration) {
        throw new Error('Integração não encontrada. Configure nas Configurações.')
      }

      const officialToken = await getOfficialAccessToken(supabaseAdmin, userId)
      const apiTokenSecret = await getSecret(supabaseAdmin, userId, 'whatsapp_api_token')
      const primaryProvider =
        integration.primary_provider || integration.whatsapp_provider_type || 'evolution'

      providerType = primaryProvider
      cfg = {
        officialAccessToken: officialToken,
        officialPhoneNumberId: integration.whatsapp_official_phone_number_id || '',
        officialWabaId: integration.whatsapp_official_waba_id || '',
        apiUrl: integration.whatsapp_api_url || '',
        instanceId: integration.whatsapp_instance_id || '',
        apiToken: apiTokenSecret || '',
      }
    } else {
      throw new Error('Usuário não autenticado e credenciais de teste não fornecidas.')
    }

    let number = to.replace(/\D/g, '')
    if (number.length === 10 || number.length === 11) number = '55' + number

    let resolvedContactId = contactId
    if (!resolvedContactId && userId && number) {
      resolvedContactId = await resolveOrCreateContact(supabaseAdmin, userId, number)
    }

    const officialReady =
      !!(cfg.officialAccessToken || cfg.accessToken) && !!cfg.officialPhoneNumberId
    const evolutionReady = !!cfg.apiUrl && !!cfg.instanceId

    let resolvedParameterFormat = parameterFormat

    if (
      isTemplate &&
      templateName &&
      parameters &&
      !resolvedParameterFormat &&
      cfg.officialWabaId
    ) {
      const token = cfg.officialAccessToken || cfg.accessToken || ''
      try {
        resolvedParameterFormat = await fetchTemplateFormat(cfg.officialWabaId, token, templateName)
      } catch (e) {
        console.warn('Could not fetch template format, defaulting to POSITIONAL:', e.message)
        resolvedParameterFormat = 'POSITIONAL'
      }
    }

    let resolvedComponents = templateComponents
    if (parameters && parameters.length > 0) {
      resolvedComponents = buildTemplateComponents(
        parameters,
        resolvedParameterFormat || 'POSITIONAL',
      )
    }

    const sendArgs = {
      number,
      text,
      isTemplate,
      templateName,
      templateLanguage,
      templateComponents: resolvedComponents,
      cfg,
      userId,
      supabaseAdmin,
      contactId: resolvedContactId,
      dbMessageId,
    }

    if (providerType === 'official') {
      if (!officialReady && !evolutionReady) {
        throw new Error('Nenhum provedor configurado. Configure o WhatsApp nas Configurações.')
      }
      if (!officialReady && evolutionReady) {
        console.log('[whatsapp-send] Official not ready, using Evolution directly')
        return await sendEvolution(sendArgs)
      }
      try {
        console.log('[whatsapp-send] Attempting Official API (primary)')
        return await sendOfficial(sendArgs)
      } catch (officialError: any) {
        console.error('[whatsapp-send] Official failed:', officialError.message)
        if (evolutionReady) {
          console.log('[whatsapp-send] Falling back to Evolution API')
          try {
            await supabaseAdmin.from('interaction_log').insert({
              user_id: userId,
              type: 'whatsapp_fallback_to_evolution',
              details: { to: number, error: officialError.message },
            })
          } catch {}
          return await sendEvolution(sendArgs)
        }
        throw officialError
      }
    } else {
      if (!evolutionReady && !officialReady) {
        throw new Error('Nenhum provedor configurado. Configure o WhatsApp nas Configurações.')
      }
      if (!evolutionReady && officialReady) {
        console.log('[whatsapp-send] Evolution not ready, using Official directly')
        return await sendOfficial(sendArgs)
      }
      try {
        console.log('[whatsapp-send] Attempting Evolution API (primary)')
        return await sendEvolution(sendArgs)
      } catch (evoError: any) {
        console.error('[whatsapp-send] Evolution failed:', evoError.message)
        if (officialReady) {
          console.log('[whatsapp-send] Falling back to Official API')
          try {
            await supabaseAdmin.from('interaction_log').insert({
              user_id: userId,
              type: 'whatsapp_fallback_to_official',
              details: { to: number, error: evoError.message },
            })
          } catch {}
          return await sendOfficial(sendArgs)
        }
        throw evoError
      }
    }
  } catch (error: any) {
    const safeMessage =
      error.message?.replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]') || 'Erro desconhecido'
    console.error('Erro na Edge Function whatsapp-send:', safeMessage)
    return new Response(JSON.stringify({ error: safeMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

function sanitizeApiError(provider: string, status: number, responseText: string): string {
  try {
    const parsed = JSON.parse(responseText)
    const msg = parsed?.error?.message || parsed?.message || 'Unknown error'
    return `Erro na API ${provider} (${status}): ${msg}`
  } catch {
    return `Erro na API ${provider} (${status})`
  }
}

function buildTemplateComponents(parameters: any[], format: string): any[] {
  const formattedParams = parameters.map((p) => {
    const textValue = p.text || p.value || ''
    if (format === 'NAMED') {
      return {
        type: 'text',
        parameter_name: p.parameter_name || p.name,
        text: textValue,
      }
    }
    return { type: 'text', text: textValue }
  })
  return [{ type: 'body', parameters: formattedParams }]
}

async function fetchTemplateFormat(
  wabaId: string,
  accessToken: string,
  templateName: string,
): Promise<string> {
  const url = `https://graph.facebook.com/v21.0/${wabaId}/message_templates?name=${encodeURIComponent(templateName)}`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Meta API error (${response.status}): ${errText}`)
    }
    const data = await response.json()
    const template = data.data?.find((t: any) => t.name === templateName)
    if (!template) throw new Error(`Template "${templateName}" not found in Meta API`)
    return template.parameter_format || 'POSITIONAL'
  } finally {
    clearTimeout(timeoutId)
  }
}

async function sendOfficial({
  number,
  text,
  isTemplate,
  templateName,
  templateLanguage,
  templateComponents,
  cfg,
  userId,
  supabaseAdmin,
  contactId,
  dbMessageId,
}: any) {
  const accessToken = cfg.officialAccessToken || ''
  const phoneNumberId = cfg.officialPhoneNumberId || ''

  if (!accessToken) {
    throw new Error('Access token não encontrado. Salve suas credenciais do WhatsApp primeiro.')
  }
  if (!phoneNumberId) {
    throw new Error('Phone Number ID não configurado. Salve o Phone Number ID nas configurações.')
  }

  if (!isTemplate && userId) {
    const withinWindow = await check24hWindow(supabaseAdmin, userId, number)
    if (!withinWindow) {
      throw new Error('Janela de 24h expirou. Envie um template para iniciar a conversa.')
    }
  }

  let payload: any
  if (isTemplate && templateName) {
    payload = {
      messaging_product: 'whatsapp',
      to: number,
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLanguage || 'pt_BR' },
        ...(templateComponents ? { components: templateComponents } : {}),
      },
    }
  } else {
    payload = {
      messaging_product: 'whatsapp',
      to: number,
      type: 'text',
      text: { body: text || '' },
    }
  }

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)

  let r: Response
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch (e: any) {
    if (e.name === 'AbortError')
      throw new Error('Timeout de conexão com a API Oficial do WhatsApp.')
    throw new Error(`Falha de rede: ${e.message}`)
  } finally {
    clearTimeout(timeoutId)
  }

  const responseText = await r.text().catch(() => '')

  if (!r.ok) {
    let errorMsg = sanitizeApiError('Oficial', r.status, responseText)
    if (r.status === 402) {
      errorMsg =
        'ERRO_PAGAMENTO: A conta do WhatsApp Business está com problema de pagamento. Verifique as configurações de cobrança no Meta Business Manager.'
    }
    if (responseText.includes('restricted') || responseText.includes('Account Restricted')) {
      errorMsg =
        'ERRO_CONTA_RESTRITA: A conta do WhatsApp Business está restrita. Verifique o status no Meta Business Manager.'
    }
    throw new Error(errorMsg)
  }

  let parsedResult: any
  try {
    parsedResult = JSON.parse(responseText)
  } catch {
    parsedResult = { rawText: responseText }
  }

  const wamid = parsedResult?.messages?.[0]?.id
  console.log(
    '[whatsapp-send] Official send result - wamid:',
    wamid,
    'contactId:',
    contactId,
    'dbMessageId:',
    dbMessageId,
  )

  if (userId) {
    await persistOutboundMessage(supabaseAdmin, {
      userId,
      contactId,
      dbMessageId,
      content: text || '',
      providerMessageId: wamid || null,
      provider: 'official',
      number,
    })
  }

  return new Response(
    JSON.stringify({ success: true, provider: 'official', wamid, response: parsedResult }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

async function sendEvolution({
  number,
  text,
  cfg,
  userId,
  supabaseAdmin,
  contactId,
  dbMessageId,
}: any) {
  const apiUrl = cfg.apiUrl || ''
  const sessionId = (cfg.instanceId || '').trim()
  const apiKey = (cfg.apiToken || '').trim()

  if (!apiUrl || !sessionId) {
    throw new Error('Credenciais da Evolution API não configuradas.')
  }

  let baseUrl = apiUrl
    .replace(/^(POST|GET|PUT|DELETE)\s+/i, '')
    .trim()
    .replace(/\/+$/, '')
  if (baseUrl.includes('/message/sendText')) baseUrl = baseUrl.split('/message/sendText')[0]
  else if (baseUrl.includes('/v1/messages')) baseUrl = baseUrl.split('/v1/messages')[0]
  baseUrl = `${baseUrl}/message/sendText/${encodeURIComponent(sessionId)}`

  const payload = {
    number,
    text,
    options: { delay: 1200, presence: 'composing' },
    textMessage: { text },
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)

  let r: Response
  try {
    r = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
        GlobalApiKey: apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error(`Timeout de Conexão na API (${baseUrl}).`)
    throw new Error(`Falha de rede (${baseUrl}). Erro: ${e.message}`)
  } finally {
    clearTimeout(timeoutId)
  }

  const responseText = await r.text().catch(() => '')
  if (!r.ok) throw new Error(sanitizeApiError('Evolution', r.status, responseText))

  let parsedResult: any
  try {
    parsedResult = JSON.parse(responseText)
  } catch {
    parsedResult = { rawText: responseText }
  }

  const evoMessageId = parsedResult?.key?.id || parsedResult?.messageId || parsedResult?.id
  console.log(
    '[whatsapp-send] Evolution send result - messageId:',
    evoMessageId,
    'contactId:',
    contactId,
    'dbMessageId:',
    dbMessageId,
  )

  if (userId) {
    await persistOutboundMessage(supabaseAdmin, {
      userId,
      contactId,
      dbMessageId,
      content: text || '',
      providerMessageId: evoMessageId || null,
      provider: 'evolution',
      number,
      instance: sessionId,
    })
  }

  return new Response(
    JSON.stringify({
      success: true,
      provider: 'evolution',
      messageId: evoMessageId,
      evolutionResponse: parsedResult,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

function isValidUuid(id: string | undefined | null): boolean {
  if (!id) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

async function persistOutboundMessage(
  supabaseAdmin: any,
  params: {
    userId: string
    contactId?: string
    dbMessageId?: string
    content: string
    providerMessageId: string | null
    provider: 'official' | 'evolution'
    number: string
    instance?: string
  },
) {
  if (!params.contactId) {
    console.warn(
      '[whatsapp-send] Cannot persist message: no contact_id resolved. Message was sent but not saved to database.',
    )
    return
  }

  const logType =
    params.provider === 'official' ? 'whatsapp_send_official' : 'whatsapp_send_evolution'

  const logDetails: any = { to: params.number, success: true, messageId: params.providerMessageId }
  if (params.instance) logDetails.instance = params.instance

  try {
    await supabaseAdmin.from('interaction_log').insert({
      user_id: params.userId,
      contact_id: params.contactId || null,
      type: logType,
      details: logDetails,
    })
  } catch (err) {
    console.warn('Failed to log interaction:', err)
  }

  try {
    let persisted = false

    if (isValidUuid(params.dbMessageId)) {
      const { data: updateData, error: updateError } = await supabaseAdmin
        .from('messages')
        .update({ client_id: params.providerMessageId || null, status: 'sent' })
        .eq('id', params.dbMessageId)
        .select('id')

      if (!updateError && updateData && updateData.length > 0) {
        persisted = true
        console.log('[whatsapp-send] Message UPDATE succeeded for id:', params.dbMessageId)
      } else if (updateError) {
        console.warn('[whatsapp-send] UPDATE failed, falling back to INSERT:', updateError.message)
      } else {
        console.log(
          '[whatsapp-send] UPDATE matched 0 rows for dbMessageId:',
          params.dbMessageId,
          '- falling back to INSERT',
        )
      }
    }

    if (!persisted) {
      const insertData: any = {
        user_id: params.userId,
        contact_id: params.contactId || null,
        content: params.content || '',
        direction: 'outbound',
        status: 'sent',
      }
      if (params.providerMessageId) {
        insertData.client_id = params.providerMessageId
      }
      if (isValidUuid(params.dbMessageId)) {
        insertData.id = params.dbMessageId
      }

      const { error: insertError } = await supabaseAdmin.from('messages').insert(insertData)

      if (insertError) {
        console.warn(
          `[whatsapp-send] Failed to INSERT ${params.provider} message:`,
          insertError.message,
        )
      } else {
        persisted = true
        console.log(
          '[whatsapp-send] Message INSERT succeeded - client_id:',
          params.providerMessageId,
          'contactId:',
          params.contactId,
        )
      }
    }

    if (!persisted) {
      console.warn(
        `[whatsapp-send] Message NOT persisted - userId:${params.userId} contactId:${params.contactId} providerMessageId:${params.providerMessageId}`,
      )
    }
  } catch (err) {
    console.warn(`[whatsapp-send] Failed to persist ${params.provider} message:`, err)
  }
}

async function resolveOrCreateContact(
  supabaseAdmin: any,
  userId: string,
  phone: string,
): Promise<string | null> {
  const searchPhones = normalizePhoneVariants(phone)
  const { data: existing } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('user_id', userId)
    .in('phone', searchPhones)
    .limit(1)
    .maybeSingle()

  if (existing) return existing.id

  const { data: newContact, error } = await supabaseAdmin
    .from('contacts')
    .insert({
      user_id: userId,
      phone,
      name: `Contato (${phone})`,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    console.warn('[whatsapp-send] Failed to create contact:', error.message)
    return null
  }
  return newContact?.id || null
}

async function check24hWindow(supabaseAdmin: any, userId: string, phone: string): Promise<boolean> {
  const searchPhones = [phone]
  if (phone.startsWith('55')) {
    searchPhones.push(phone.substring(2))
    const ddd = phone.substring(2, 4)
    const num = phone.substring(4)
    if (num.length === 9 && num.startsWith('9')) {
      searchPhones.push(`55${ddd}${num.substring(1)}`, `${ddd}${num.substring(1)}`)
    } else if (num.length === 8) {
      searchPhones.push(`55${ddd}9${num}`, `${ddd}9${num}`)
    }
  }

  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .select('id, last_inbound_at')
    .eq('user_id', userId)
    .in('phone', searchPhones)
    .limit(1)
    .maybeSingle()

  if (!contact) return false
  if (!contact.last_inbound_at) return false

  const lastInbound = new Date(contact.last_inbound_at)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  return lastInbound > twentyFourHoursAgo
}
