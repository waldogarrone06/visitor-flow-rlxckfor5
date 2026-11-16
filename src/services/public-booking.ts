import { supabase } from '@/lib/supabase/client'
import { format } from 'date-fns'

export const MAX_CAPACITY_PER_SLOT = 10

// Disponibilidade do dia vem da edge function get-availability (service role):
// devolve agenda do dia, slots bloqueados, ocupação por slot e busySlots do
// Google Calendar — e já filtra horários que já passaram no dia atual (BRT).
export async function getDayScheduleData(userId: string, date: Date) {
  const dateStr = format(date, 'yyyy-MM-dd')

  const { data: syncData, error } = await supabase.functions.invoke('get-availability', {
    body: { userId, date: dateStr },
  })

  if (error) throw new Error(error.message || 'Falha ao carregar disponibilidade.')

  return {
    schedule: syncData?.schedule || [],
    appointments: syncData?.slotCounts || {},
    lockedSlots: syncData?.lockedSlots || [],
    busySlots: syncData?.busySlots || [],
    activeCount: syncData?.slotCounts || {},
  }
}

// Agendamento público passa pela edge function create-booking (servidor):
// RPC atômica com lock de capacidade, contato sem duplicar, evento real no
// Google Calendar/Meet e e-mail de confirmação — nada roda no navegador.
export async function createPublicAppointment(data: any) {
  const { data: result, error } = await supabase.functions.invoke('create-booking', {
    body: {
      userId: data.user_id,
      appointmentDate: data.appointment_date,
      startTime: data.start_time,
      endTime: data.end_time,
      status: data.status || 'lead',
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
      lgpdConsentAt: data.lgpd_consent_at,
      // Formulário público: o servidor recusa o agendamento sem consentimento
      requireConsent: data.require_consent === true,
      // LeadCapture (só captura) não cria evento nem envia e-mail
      createCalendar: data.createCalendar !== false,
      sendConfirmationEmail: data.sendConfirmationEmail !== false,
      // LeadCapture grava em 1970-01-01: fora da checagem de capacidade
      maxCapacity: data.ignoreCapacity === true ? 2147483647 : MAX_CAPACITY_PER_SLOT,
    },
  })

  if (error) throw error
  if (result?.error) throw new Error(result.error)

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
