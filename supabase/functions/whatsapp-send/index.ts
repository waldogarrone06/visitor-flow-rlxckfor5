import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { to, text, isTemplate, templateName, templateLanguage, templateComponents } = body

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
          .select(
            'whatsapp_official_access_token, whatsapp_official_phone_number_id, whatsapp_official_waba_id',
          )
          .eq('user_id', userId)
          .maybeSingle()

        if (fallbackIntegration?.whatsapp_official_access_token) {
          cfg.officialAccessToken = fallbackIntegration.whatsapp_official_access_token
        }
        if (!cfg.officialPhoneNumberId && fallbackIntegration?.whatsapp_official_phone_number_id) {
          cfg.officialPhoneNumberId = fallbackIntegration.whatsapp_official_phone_number_id
        }
      }
    } else if (userId) {
      const { data: integration } = await supabaseAdmin
        .from('user_integrations')
        .select(
          'whatsapp_provider_type, whatsapp_official_phone_number_id, whatsapp_official_waba_id, whatsapp_official_access_token, whatsapp_api_url, whatsapp_instance_id, whatsapp_api_token',
        )
        .eq('user_id', userId)
        .maybeSingle()

      if (!integration) {
        throw new Error('Integração não encontrada. Configure nas Configurações.')
      }
      providerType = integration.whatsapp_provider_type || 'evolution'
      cfg = {
        officialAccessToken:
          integration.whatsapp_official_access_token ||
          Deno.env.get('WHATSAPP_OFFICIAL_ACCESS_TOKEN') ||
          '',
        officialPhoneNumberId: integration.whatsapp_official_phone_number_id || '',
        officialWabaId: integration.whatsapp_official_waba_id || '',
        apiUrl: integration.whatsapp_api_url || '',
        instanceId: integration.whatsapp_instance_id || '',
        apiToken: integration.whatsapp_api_token || '',
      }
    } else {
      throw new Error('Usuário não autenticado e credenciais de teste não fornecidas.')
    }

    let number = to.replace(/\D/g, '')
    if (number.length === 10 || number.length === 11) number = '55' + number

    if (providerType === 'official') {
      const officialToken = cfg.officialAccessToken || cfg.accessToken || cfg.apiToken || ''
      const officialPhoneId = cfg.officialPhoneNumberId || ''
      if (!officialToken) {
        return new Response(
          JSON.stringify({
            error: 'Access token não encontrado. Salve suas credenciais do WhatsApp primeiro.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      if (!officialPhoneId) {
        return new Response(
          JSON.stringify({
            error: 'Phone Number ID não encontrado. Salve suas credenciais do WhatsApp primeiro.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      try {
        return await sendOfficial({
          number,
          text,
          isTemplate,
          templateName,
          templateLanguage,
          templateComponents,
          cfg,
          userId,
          supabaseAdmin,
        })
      } catch (officialError: any) {
        if (cfg.apiUrl && cfg.instanceId && cfg.apiToken) {
          console.error('Official API failed, falling back to Evolution:', officialError.message)
          try {
            await supabaseAdmin.from('interaction_log').insert({
              user_id: userId,
              type: 'whatsapp_fallback_to_evolution',
              details: { to: number, error: officialError.message },
            })
          } catch {}
          return await sendEvolution({ number, text, cfg, userId, supabaseAdmin })
        }
        throw officialError
      }
    } else {
      return await sendEvolution({ number, text, cfg, userId, supabaseAdmin })
    }
  } catch (error: any) {
    console.error('Erro na Edge Function whatsapp-send:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

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
}: any) {
  const accessToken = cfg.officialAccessToken || cfg.apiToken || ''
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
      throw new Error(
        'FORA_DA_JANELA_24H: A última interação do contato foi há mais de 24 horas. Use um Template para iniciar a conversa.',
      )
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
    let errorMsg = `Erro na API Oficial (${r.status}): ${responseText || r.statusText}`
    if (r.status === 402) {
      errorMsg =
        'ERRO_PAGAMENTO: A conta do WhatsApp Business está com problema de pagamento. Verifique as configurações de cobrança no Meta Business Manager.'
      console.error('[whatsapp-send] Payment Required (402) for user:', userId)
    }
    if (responseText.includes('restricted') || responseText.includes('Account Restricted')) {
      errorMsg =
        'ERRO_CONTA_RESTRITA: A conta do WhatsApp Business está restrita. Verifique o status no Meta Business Manager.'
      console.error('[whatsapp-send] Account restricted for user:', userId)
    }
    throw new Error(errorMsg)
  }

  let parsedResult: any
  try {
    parsedResult = JSON.parse(responseText)
  } catch {
    parsedResult = { rawText: responseText }
  }

  if (userId) {
    try {
      await supabaseAdmin.from('interaction_log').insert({
        user_id: userId,
        type: 'whatsapp_send_official',
        details: { to: number, success: true, messageId: parsedResult?.messages?.[0]?.id },
      })
    } catch (err) {
      console.warn('Failed to log interaction:', err)
    }
  }

  return new Response(
    JSON.stringify({ success: true, provider: 'official', response: parsedResult }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

async function sendEvolution({ number, text, cfg, userId, supabaseAdmin }: any) {
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
  if (!r.ok) throw new Error(`Erro na API (${r.status}): ${responseText || r.statusText}`)

  let parsedResult: any
  try {
    parsedResult = JSON.parse(responseText)
  } catch {
    parsedResult = { rawText: responseText }
  }

  if (userId) {
    try {
      await supabaseAdmin.from('interaction_log').insert({
        user_id: userId,
        type: 'whatsapp_send_evolution',
        details: { to: number, instance: sessionId, success: true },
      })
    } catch (err) {
      console.warn('Failed to log interaction:', err)
    }
  }

  return new Response(
    JSON.stringify({ success: true, provider: 'evolution', evolutionResponse: parsedResult }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
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
    .select('id')
    .eq('user_id', userId)
    .in('phone', searchPhones)
    .limit(1)
    .maybeSingle()

  if (!contact) return false

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: lastInbound } = await supabaseAdmin
    .from('messages')
    .select('created_at')
    .eq('contact_id', contact.id)
    .eq('direction', 'inbound')
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return !!lastInbound
}
