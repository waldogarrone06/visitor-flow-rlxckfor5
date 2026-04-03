import { supabase } from '@/lib/supabase/client'

export async function sendWhatsAppMessage(to: string, text: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Usuário não autenticado')

  const { data: integration } = await supabase
    .from('user_integrations' as any)
    .select('whatsapp_api_token, whatsapp_instance_id')
    .eq('user_id', user.id)
    .single()

  if (!integration?.whatsapp_api_token || !integration?.whatsapp_instance_id) {
    throw new Error('WhatsApp API não configurada. Vá em Configurações para conectar a API.')
  }

  const apiUrl = integration.whatsapp_api_token.replace(/\/$/, '')
  const sessionId = integration.whatsapp_instance_id

  const payload = {
    sessionId,
    to: to.replace(/\D/g, ''),
    text,
  }

  const response = await fetch(`${apiUrl}/messages/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    throw new Error('Falha de rede ou CORS ao contatar a API do WhatsApp.')
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Falha na API externa: ${response.status} ${errText}`)
  }

  return await response.json().catch(() => ({ success: true }))
}
