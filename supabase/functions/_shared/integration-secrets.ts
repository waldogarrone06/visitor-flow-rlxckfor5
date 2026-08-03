const ALLOWED_KEYS = [
  'whatsapp_official_access_token',
  'whatsapp_app_secret',
  'google_access_token',
  'google_refresh_token',
  'melhor_envio_token',
  'whatsapp_api_token',
  'yampi_token',
] as const

export type CredentialKey = (typeof ALLOWED_KEYS)[number]

export function isAllowedKey(key: string): boolean {
  return (ALLOWED_KEYS as readonly string[]).includes(key)
}

export async function getSecret(supabaseAdmin: any, userId: string, key: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('integration_secrets')
    .select(key)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[integration-secrets] Error fetching credential:', error.message)
    return ''
  }

  return data?.[key] || ''
}

export async function getAllSecrets(
  supabaseAdmin: any,
  userId: string,
): Promise<Record<string, string>> {
  const { data, error } = await supabaseAdmin
    .from('integration_secrets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[integration-secrets] Error fetching credentials:', error.message)
    return {}
  }

  return data || {}
}

export async function getOfficialAccessToken(supabaseAdmin: any, userId: string): Promise<string> {
  return getSecret(supabaseAdmin, userId, 'whatsapp_official_access_token')
}

export async function getGoogleTokens(
  supabaseAdmin: any,
  userId: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const { data, error } = await supabaseAdmin
    .from('integration_secrets')
    .select('google_access_token, google_refresh_token')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[integration-secrets] Error fetching Google tokens:', error.message)
    return { accessToken: '', refreshToken: '' }
  }

  return {
    accessToken: data?.google_access_token || '',
    refreshToken: data?.google_refresh_token || '',
  }
}

const INDICATOR_MAP: Record<string, string> = {
  whatsapp_official_access_token: 'whatsapp_official_configured',
  google_access_token: 'google_configured',
  google_refresh_token: 'google_configured',
  melhor_envio_token: 'melhor_envio_configured',
  whatsapp_api_token: 'whatsapp_api_configured',
  yampi_token: 'yampi_configured',
}

export async function updateIndicator(
  supabaseAdmin: any,
  userId: string,
  credentialKey: string,
  configured: boolean,
): Promise<void> {
  const indicatorCol = INDICATOR_MAP[credentialKey]
  if (!indicatorCol) return

  if (!configured) {
    const relatedKeys = Object.entries(INDICATOR_MAP)
      .filter(([, indicator]) => indicator === indicatorCol)
      .map(([key]) => key)

    if (relatedKeys.length > 1) {
      const { data: existing } = await supabaseAdmin
        .from('integration_secrets')
        .select(relatedKeys.join(', '))
        .eq('user_id', userId)
        .maybeSingle()

      const anyExists = relatedKeys.some((k) => existing?.[k] && String(existing[k]).trim() !== '')

      await supabaseAdmin
        .from('user_integrations')
        .update({ [indicatorCol]: anyExists })
        .eq('user_id', userId)
      return
    }
  }

  await supabaseAdmin
    .from('user_integrations')
    .update({ [indicatorCol]: configured })
    .eq('user_id', userId)
}

export async function getWhatsAppAppSecret(supabaseAdmin: any, userId: string): Promise<string> {
  return getSecret(supabaseAdmin, userId, 'whatsapp_app_secret')
}

export async function getAllAppSecrets(
  supabaseAdmin: any,
): Promise<Array<{ userId: string; appSecret: string }>> {
  const { data, error } = await supabaseAdmin
    .from('integration_secrets')
    .select('user_id, whatsapp_app_secret')
    .not('whatsapp_app_secret', 'is', null)

  if (error || !data) return []

  return data
    .filter((row: any) => row.whatsapp_app_secret && String(row.whatsapp_app_secret).trim() !== '')
    .map((row: any) => ({ userId: row.user_id, appSecret: String(row.whatsapp_app_secret).trim() }))
}
