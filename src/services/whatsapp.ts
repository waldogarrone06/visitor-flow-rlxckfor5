import { supabase } from '@/lib/supabase/client'

export async function sendWhatsAppMessage(to: string, text: string) {
  const { data, error } = await supabase.functions.invoke('whatsapp-send', {
    body: { to, text },
  })

  if (error) {
    throw new Error(`Erro de conexão com o servidor: ${error.message}`)
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data
}
