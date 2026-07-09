import { supabase } from '@/lib/supabase/client'

export interface PurgeResult {
  success: boolean
  message?: string
  error?: string
  details?: {
    appointmentsDeleted: number
    calendarEventsDeleted: number
    calendarSkipped: number
    contactsDeleted: number
  }
}

export async function purgeAppointmentsByName(clientName: string): Promise<PurgeResult> {
  const { data, error } = await supabase.functions.invoke('purge-appointments', {
    body: { clientName },
  })

  if (error) {
    return { success: false, error: error.message || 'Falha ao remover agendamentos.' }
  }

  return data as PurgeResult
}
