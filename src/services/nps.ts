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

// Lê o nome do cliente via edge function (service role) — a leitura anônima direta
// de "appointments" foi fechada por segurança (exposição de PII).
export async function getAppointmentDetails(appointmentId: string) {
  const { data, error } = await supabase.functions.invoke('nps-appointment-name', {
    body: { appointmentId },
  })

  if (error) throw new Error(error.message || 'Erro ao buscar dados do agendamento.')
  if (data?.error) throw new Error(data.error)
  return (data || { client_name: '' }) as { client_name: string }
}
