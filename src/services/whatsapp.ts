import { supabase } from '@/lib/supabase/client'
import { FunctionsHttpError } from '@supabase/supabase-js'

export async function sendWhatsAppMessage(
  to: string,
  text: string,
  messageId?: string,
  options?: {
    isTemplate?: boolean
    templateName?: string
    templateLanguage?: string
    templateComponents?: any[]
    parameters?: any[]
    parameterFormat?: string
    contactId?: string
    dbMessageId?: string
  },
) {
  const { data, error } = await supabase.functions.invoke('whatsapp-send', {
    body: { to, text, dbMessageId: options?.dbMessageId ?? messageId, ...options },
  })

  if (error && error instanceof FunctionsHttpError) {
    let errorMessage
    try {
      errorMessage = await error.context.json()
    } catch (e) {
      errorMessage = { error: await error.context.text() }
    }
    throw new Error(errorMessage?.error || error.message)
  } else if (error) {
    throw new Error(error.message)
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data
}

export async function fetchWhatsAppTemplates(userId: string) {
  const { data, error } = await supabase.functions.invoke('whatsapp-templates', {
    body: { userId },
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

  return data?.templates || []
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
    newContent?: string
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

export async function editWhatsAppMessage(messageId: string, newText: string, whatsappKey: any) {
  const { data, error } = await supabase.functions.invoke('whatsapp-edit', {
    body: { messageId, newText, whatsappKey },
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

export async function deleteWhatsAppMessage(messageId: string, whatsappKey: any) {
  const { data, error } = await supabase.functions.invoke('whatsapp-delete', {
    body: { messageId, whatsappKey },
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
