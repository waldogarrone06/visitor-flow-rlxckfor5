import { supabase } from '@/lib/supabase/client'
import { format } from 'date-fns'

// Slot completo (data + start + end) — MESMA chave usada por get-availability
// (slotCounts) e pela RPC book_appointment (v0.0.436).
export interface SlotAvailabilityInput {
  userId: string
  date: Date
  slot: { start_time: string; end_time?: string | null }
  maxCapacity?: number
}

export interface SlotAvailabilityResult {
  available: boolean
  reason?: 'locked' | 'google_busy' | 'full' | 'past' | 'not_in_schedule' | 'google_error'
  message?: string
}

export const FULL_DAY_LOCK = '__FULL_DAY__'

function slotKey(start: string, end?: string | null): string {
  return `${start}-${end ?? ''}`
}

/**
 * Disponibilidade de um slot para o agendamento público. Espelha o front de
 * /agendar: agenda do dia (específica > recorrente), bloqueios manuais,
 * busySlots do Google e contagem por slot completo.
 */
export async function isSlotAvailable({
  userId,
  date,
  slot,
  maxCapacity = 10,
}: SlotAvailabilityInput): Promise<SlotAvailabilityResult> {
  const dateStr = format(date, 'yyyy-MM-dd')

  const { data: syncData, error } = await supabase.functions.invoke('get-availability', {
    body: { userId, date: dateStr },
  })
  if (error) {
    return { available: false, reason: 'google_error', message: 'Falha ao carregar a agenda.' }
  }

  const schedule: any[] = syncData?.schedule || []
  const lockedSlots: any[] = syncData?.lockedSlots || []
  const busySlots: any[] = syncData?.busySlots || []
  const slotCounts: Record<string, number> = syncData?.slotCounts || {}

  // Agenda do dia (específica tem precedência) — início E fim exatos
  const exists = schedule.some(
    (s) => s.start_time === slot.start_time && (s.end_time || '') === (slot.end_time || ''),
  )
  if (!exists) {
    return {
      available: false,
      reason: 'not_in_schedule',
      message: 'Horário fora da agenda do dia.',
    }
  }

  // Bloqueio de dia inteiro ou parcial
  if (lockedSlots.some((l) => !l.start_time || l.start_time === '')) {
    return { available: false, reason: 'locked', message: 'Este dia está bloqueado.' }
  }
  const overlapsLocked = lockedSlots.some((l) => {
    const lStart = l.start_time
    const lEnd = l.end_time || l.start_time
    return slot.start_time < lEnd && (slot.end_time || slot.start_time) > lStart
  })
  if (overlapsLocked) {
    return { available: false, reason: 'locked', message: 'Este horário está bloqueado.' }
  }

  // Google Calendar (busySlots: eventos com sobreposição real)
  const overlapsBusy = busySlots.some((b: any) => {
    if (!b?.start || !b?.end) return true
    return slot.start_time < b.end && (slot.end_time || slot.start_time) > b.start
  })
  if (overlapsBusy) {
    return {
      available: false,
      reason: 'google_busy',
      message: 'Este horário já está ocupado na agenda do profissional.',
    }
  }

  // Capacidade por slot COMPLETO (mesma chave do servidor)
  const count = slotCounts[slotKey(slot.start_time, slot.end_time)] || 0
  if (count >= maxCapacity) {
    return { available: false, reason: 'full', message: 'Este horário acabou de esgotar.' }
  }

  return { available: true }
}
