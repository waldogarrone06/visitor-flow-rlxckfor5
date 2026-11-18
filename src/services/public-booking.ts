import { supabase } from '@/lib/supabase/client'
import { format } from 'date-fns'

// A trava real de capacidade é do SERVIDOR (RPC book_appointment, constante 10).
// Aqui é só dica de UI para esmaecer slots cheios.
export const MAX_CAPACITY_PER_SLOT = 10

// LeadCapture grava agendamentos sentinela em 1970-01-01 00:00 (só captura de
// contato, sem slot real). A edge function é quem reconhece essa data — o
// cliente não envia capacidade, consentimento-forçado nem flags de permissão.
export const CAPTURE_SENTINEL_DATE = '1970-01-01'

// Erros de negócio do create-booking que a UI trata de forma especial:
// trava de CPF (leia-me "Remarcar visita por CPF"). O visitante vê a data de
// liberação e/ou link para /remarcar — não um toast genérico.
export interface BookingError extends Error {
  code?: string
  releaseDate?: string | null
  rescheduleUrl?: string | null
}

// Erro HTTP de edge function (non-2xx): o supabase-js devolve só "Edge Function
// returned a non-2xx status code" e guarda a Response em error.context. Lê o
// corpo JSON e devolve error/code/releaseDate/rescheduleUrl que o servidor
// enviou; corpo que não é JSON (ou erro de rede, sem context) cai no fallback.
async function readFunctionError(error: any, fallback: string): Promise<BookingError> {
  try {
    const body = await error?.context?.json()
    const message = typeof body?.error === 'string' && body.error.trim() ? body.error : fallback
    const err: BookingError = new Error(message)
    if (body?.code) err.code = body.code
    if (body?.releaseDate) err.releaseDate = body.releaseDate
    if (body?.rescheduleUrl) err.rescheduleUrl = body.rescheduleUrl
    return err
  } catch {
    return new Error(fallback)
  }
}

// Disponibilidade do dia vem da edge function get-availability (service role):
// devolve agenda do dia, slots bloqueados, ocupação por slot e busySlots do
// Google Calendar — e já filtra horários que já passaram no dia atual (BRT).
export async function getDayScheduleData(userId: string, date: Date) {
  const dateStr = format(date, 'yyyy-MM-dd')

  const { data: syncData, error } = await supabase.functions.invoke('get-availability', {
    body: { userId, date: dateStr },
  })

  if (error) {
    throw await readFunctionError(error, error.message || 'Falha ao carregar disponibilidade.')
  }

  return {
    schedule: syncData?.schedule || [],
    appointments: syncData?.slotCounts || {},
    lockedSlots: syncData?.lockedSlots || [],
    busySlots: syncData?.busySlots || [],
    activeCount: syncData?.slotCounts || {},
    // FAIL-SAFE: true quando o Google Calendar não pôde ser consultado — o dia
    // vem com schedule vazio e o front deve avisar em vez de mostrar horários.
    googleError: syncData?.googleError === true,
    googleErrorMessage: syncData?.googleErrorMessage || null,
  }
}

// Agendamento público passa pela edge function create-booking (servidor):
// RPC atômica com lock de capacidade, contato sem duplicar, evento real no
// Google Calendar/Meet e e-mail de confirmação — nada roda no navegador.
// SEGURANÇA: userId, capacidade, status e exigência de consentimento são
// decididos NO SERVIDOR — o cliente não os controla e não os envia.
export async function createPublicAppointment(data: any) {
  const isCapture = data.appointment_date === CAPTURE_SENTINEL_DATE

  const { data: result, error } = await supabase.functions.invoke('create-booking', {
    body: {
      userId: data.user_id,
      appointmentDate: data.appointment_date,
      startTime: data.start_time,
      endTime: data.end_time,
      clientName: data.client_name,
      clientEmail: data.client_email,
      clientPhone: data.client_phone,
      clientDocument: data.client_document,
      specialty: data.specialty,
      professionalId: data.professional_id,
      clinicCep: data.clinic_cep,
      clinicAddress: data.clinic_address,
      clinicNumber: data.clinic_number,
      clinicNeighborhood: data.clinic_neighborhood,
      clinicComplement: data.clinic_complement,
      clinicCity: data.clinic_city,
      clinicState: data.clinic_state,
      instagram: data.instagram,
      patientsPerMonth: data.patients_per_month,
      // LGPD: o cliente envia APENAS a flag booleana de aceite — o QUANDO
      // (now() do servidor) e a VERSÃO do termo são fatos do SERVIDOR.
      lgpdConsent: data.lgpd_consent === true || !!data.lgpd_consent_at,
      // Comportamento do fluxo (não é permissão): captura de contato não cria
      // evento no Calendar nem envia e-mail de confirmação.
      createCalendar: !isCapture,
      sendConfirmationEmail: !isCapture,
    },
  })

  if (error) {
    // Propaga a mensagem real do servidor (409 capacidade, 422 ocupado, 429, 503)
    // e os códigos de negócio: cpf_open_visit, cpf_blocked_30d (+ releaseDate).
    throw await readFunctionError(error, error.message || 'Falha ao agendar.')
  }
  if (result?.error) {
    const err: BookingError = new Error(result.error)
    if (result.code) err.code = result.code
    if (result.releaseDate) err.releaseDate = result.releaseDate
    if (result.rescheduleUrl) err.rescheduleUrl = result.rescheduleUrl
    throw err
  }

  return { newApp: result.appointment, syncWarning: !!result.calendarWarning, result }
}

export async function toggleSlotLock(
  userId: string,
  dateStr: string,
  startTime: string | null,
  endTime: string | null,
  isLocked: boolean,
  lockId?: string,
) {
  if (isLocked && lockId && !lockId.startsWith('ext-')) {
    return supabase
      .from('locked_slots' as any)
      .delete()
      .eq('id', lockId)
  } else if (!isLocked) {
    return supabase.from('locked_slots' as any).insert([
      {
        user_id: userId,
        lock_date: dateStr,
        start_time: startTime,
        end_time: endTime,
      },
    ])
  }
}
