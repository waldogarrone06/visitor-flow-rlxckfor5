import { supabase } from '@/lib/supabase/client'

export async function submitNps(appointmentId: string, score: number, feedback: string) {
  const { error } = await supabase.from('nps_responses' as any).insert([
    {
      appointment_id: appointmentId,
      score,
      feedback,
    },
  ])

  if (error) throw error
}

export async function getAppointmentDetails(appointmentId: string) {
  const { data, error } = await (supabase.from('appointments' as any) as any)
    .select('client_name')
    .eq('id', appointmentId)
    .single()

  if (error) throw error
  return data as { client_name: string }
}
