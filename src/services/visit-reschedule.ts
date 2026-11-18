import { supabase } from '@/lib/supabase/client'

// Serviço da rota /remarcar/:userId — consulta eligibility por CPF e remarca
// a visita (UPDATE da mesma linha). Erros HTTP da edge function são lidos do
// corpo JSON (mesma técnica de readFunctionError em public-booking.ts).

export interface VisitLookupResult {
  action: 'remarcar' | 'bloqueado' | 'nova_visita' | 'sem_visita'
  visit?: {
    id: string
    appointment_date: string
    start_time: string
    end_time: string
    reschedule_count: number
  } | null
  released_at?: string | null // data (yyyy-mm-dd) em que libera nova visita (bloqueio <30d)
  error?: string
  code?: string
}

export interface RescheduleResult {
  ok?: boolean
  success?: boolean
  appointment?: any
  rescheduleCount?: number | null
  error?: string
  code?: string
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

// Lê code/releaseDate do corpo do erro da edge function — usados pela UI para
// exibir a data de liberação (bloqueio <30d) e diferenciar o tipo de bloqueio.
async function readFunctionErrorPayload(
  error: any,
  fallback: string,
): Promise<{ message: string; code?: string; releaseDate?: string | null }> {
  try {
    const body = await error?.context?.json()
    const message = typeof body?.error === 'string' && body.error.trim() ? body.error : fallback
    return { message, code: body?.code ?? undefined, releaseDate: body?.releaseDate ?? null }
  } catch {
    return { message: fallback }
  }
}

// Consulta a elegibilidade do CPF. NUNCA lança — devolve o resultado ou um
// objeto com error/code para a página decidir o que mostrar.
export async function lookupVisitByCpf(userId: string, cpf: string): Promise<VisitLookupResult> {
  const { data, error } = await supabase.functions.invoke('visit-lookup', {
    body: { userId, cpf },
  })
  if (error) {
    const { message, code, releaseDate } = await readFunctionErrorPayload(
      error,
      'Falha ao consultar o CPF. Tente novamente.',
    )
    return { action: 'sem_visita', error: message, code, released_at: releaseDate }
  }
  if (data?.error) {
    return {
      action: 'sem_visita',
      error: data.error,
      code: data.code ?? undefined,
      released_at: data.releaseDate ?? data.released_at ?? null,
    }
  }
  return data as VisitLookupResult
}

export async function rescheduleVisitByCpf(params: {
  userId: string
  cpf: string
  date: string
  startTime: string
  endTime: string
}): Promise<RescheduleResult> {
  const { data, error } = await supabase.functions.invoke('reschedule-visit', {
    body: params,
  })
  if (error) {
    const { message, code } = await readFunctionErrorPayload(
      error,
      'Falha ao remarcar a visita. Tente novamente.',
    )
    return { success: false, error: message, code }
  }
  if (data?.error) {
    return { success: false, error: data.error, code: data.code ?? undefined }
  }
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
