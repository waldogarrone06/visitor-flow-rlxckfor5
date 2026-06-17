import { supabase } from '@/lib/supabase/client'
import { FunctionsHttpError } from '@supabase/supabase-js'

export async function sendWhatsAppMessage(to: string, text: string) {
  const { data, error } = await supabase.functions.invoke('whatsapp-send', {
    body: { to, text },
  })

  if (error && error instanceof FunctionsHttpError) {
    let errorMessage
    try {
      errorMessage = await error.context.json()
    } catch (e) {
      errorMessage = { error: await error.context.text() }
    }
    throw new Error(`Erro de conexão com o servidor: ${errorMessage?.error || error.message}`)
  } else if (error) {
    throw new Error(`Erro de conexão com o servidor: ${error.message}`)
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data
}

export async function manageWhatsAppMessage(
  action: 'edit' | 'delete',
  payload: {
    messageId?: string
    to?: string
    text?: string
    id?: string
    fromMe?: boolean
    remoteJid?: string
  },
) {
  const { data, error } = await supabase.functions.invoke('whatsapp-manage-message', {
    body: { action, ...payload },
  })

  if (error && error instanceof FunctionsHttpError) {
    let errorMessage
    try {
      errorMessage = await error.context.json()
    } catch (e) {
      errorMessage = { error: await error.context.text() }
    }
    throw new Error(`Erro de conexão com o servidor: ${errorMessage?.error || error.message}`)
  } else if (error) {
    throw new Error(`Erro de conexão com o servidor: ${error.message}`)
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data
}
