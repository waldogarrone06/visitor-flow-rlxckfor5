import { supabase } from '@/lib/supabase/client'

export type SyncResult = { success: boolean; error?: string; data?: any }

async function invokeWithRetry(
  functionName: string,
  body: any,
  maxAttempts = 4,
): Promise<SyncResult> {
  let attempts = 0
  let delay = 2000

  while (attempts < maxAttempts) {
    attempts++
    try {
      if (import.meta.env.DEV) {
        console.log(`[syncCalendarService] Invoking ${functionName} (Attempt ${attempts})`)
      }

      const response = await supabase.functions.invoke(functionName, { body })

      if (response.error) {
        const err = response.error as any
        const status = err.context?.status || err.status || 500

        // 400 Bad Request or 404 Not Found: Do not retry
        if (status === 400 || status === 404) {
          return { success: false, error: err.message || 'Requisição inválida ou não encontrada.' }
        }

        // 401 Unauthorized: Retry only once
        if (status === 401) {
          if (attempts >= 2) {
            return { success: false, error: err.message || 'Não autorizado.' }
          }
        }

        // Final attempt reached
        if (attempts === maxAttempts) {
          return { success: false, error: err.message || 'Falha na sincronização.' }
        }
      } else if (response.data && response.data.error) {
        return { success: false, error: response.data.error }
      } else {
        return { success: true, data: response.data }
      }

      // Wait for backoff duration before next retry
      await new Promise((resolve) => setTimeout(resolve, delay))
      delay *= 2
    } catch (err: any) {
      if (attempts === maxAttempts) {
        return { success: false, error: err.message || 'Erro inesperado.' }
      }
      await new Promise((resolve) => setTimeout(resolve, delay))
      delay *= 2
    }
  }

  return { success: false, error: 'Falha após limite de tentativas.' }
}

export const syncCalendarService = {
  syncCreate: async (appointmentId: string): Promise<SyncResult> => {
    return invokeWithRetry('sync-calendar', { appointmentId })
  },
  syncUpdate: async (
    appointmentId: string,
    newDate: string,
    newTime: string,
  ): Promise<SyncResult> => {
    return invokeWithRetry('sync-calendar-update', { appointmentId, newDate, newTime })
  },
  syncDelete: async (appointmentId: string): Promise<SyncResult> => {
    return invokeWithRetry('sync-calendar-delete', { appointmentId })
  },
}
