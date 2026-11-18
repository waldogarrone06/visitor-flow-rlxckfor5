import { supabase } from '@/lib/supabase/client'

// Serviço da rota /remarcar/:userId — consulta eligibility por CPF e remarca
// a visita (UPDATE da mesma linha). Erros HTTP da edge function são lidos do
// corpo JSON (mesma técnica de readFunctionError em public-booking.ts).

export interface VisitEligibility {
  action: 'remarcar' | 'bloqueado' | 'nova_visita' | 'sem_visita'
  appointment?: {
    id: string
    appointment_date: string
    start_time: string
    end_time: string
    status: string
    reschedule_count: number
    kit_status: string | null
    tracking_number: string | null
  } | null
  released_at?: string | null // data em que libera nova visita (bloqueio <30d)
  message?: string
  contact_name?: string | null
}

export interface RescheduleResult {
  success: boolean
  appointment?: any
  reschedule_count?: number
  message?: string
}

async function readFunctionError(error: any, fallback: string): Promise<string> {
  try {
    const body = await error?.context?.json()
    if (typeof body?.error === 'string' && body.error.trim()) return body.error
  } catch {
    // corpo não é JSON ou já foi consumido
  }
  return fallback
}

export async function lookupVisitByCpf(userId: string, cpf: string): Promise<VisitEligibility> {
  const { data, error } = await supabase.functions.invoke('visit-lookup', {
    body: { userId, cpf },
  })
  if (error) {
    throw new Error(await readFunctionError(error, 'Falha ao consultar o CPF. Tente novamente.'))
  }
  if (data?.error) throw new Error(data.error)
  return data as VisitEligibility
}

export async function rescheduleVisitByCpf(params: {
  userId: string
  cpf: string
  appointmentDate: string
  startTime: string
  endTime: string
}): Promise<RescheduleResult> {
  const { data, error } = await supabase.functions.invoke('reschedule-visit', {
    body: params,
  })
  if (error) {
    throw new Error(await readFunctionError(error, 'Falha ao remarcar a visita. Tente novamente.'))
  }
  if (data?.error) throw new Error(data.error)
  return data as RescheduleResult
}

// Disponibilidade do dia para a tela de remarcação (reutiliza get-availability,
// a mesma edge function do agendamento público).
export async function getRescheduleDayData(userId: string, date: Date) {
  const { data, error } = await supabase.functions.invoke('get-availability', {
    body: { userId, date: date.toISOString().slice(0, 10) },
  })
  if (error) {
    throw new Error(await readFunctionError(error, 'Falha ao carregar a agenda.'))
  }
  return {
    schedule: (data?.schedule || []) as { start_time: string; end_time: string | null }[],
    lockedSlots: (data?.lockedSlots || []) as any[],
    busySlots: (data?.busySlots || []) as { start: string; end: string }[],
    slotCounts: (data?.slotCounts || {}) as Record<string, number>,
    googleError: data?.googleError === true,
  }
}
