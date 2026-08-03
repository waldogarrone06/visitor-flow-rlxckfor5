export async function getOfficialAccessToken(supabaseAdmin: any, userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('integration_secrets')
    .select('whatsapp_official_access_token')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[integration-secrets] Error fetching token:', error.message)
    return ''
  }

  return data?.whatsapp_official_access_token || ''
}
