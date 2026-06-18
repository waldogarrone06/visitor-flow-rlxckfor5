import { supabase } from '@/lib/supabase/client'
import { format } from 'date-fns'

export const MAX_CAPACITY_PER_SLOT = 10

export async function getDayScheduleData(userId: string, date: Date) {
  const dayOfWeek = date.getDay()
  const dateStr = format(date, 'yyyy-MM-dd')

  const [schedRes, specRes, appsRes, locksRes] = await Promise.all([
    supabase
      .from('schedule_settings' as any)
      .select('*')
      .eq('user_id', userId)
      .eq('day_of_week', dayOfWeek),
    supabase
      .from('date_specific_schedules' as any)
      .select('*')
      .eq('user_id', userId)
      .eq('specific_date', dateStr),
    supabase
      .from('appointments' as any)
      .select('*')
      .eq('user_id', userId)
      .eq('appointment_date', dateStr),
    supabase
      .from('locked_slots' as any)
      .select('*')
      .eq('user_id', userId)
      .eq('lock_date', dateStr),
  ])

  let lockedSlots = locksRes.data || []
  let schedule = specRes.data && specRes.data.length > 0 ? specRes.data : schedRes.data || []

  // Check external availability (Google Calendar Sync)
  try {
    const { data: syncData } = await supabase.functions.invoke('check-availability', {
      body: { userId, date: dateStr },
    })

    if (syncData?.busySlots && Array.isArray(syncData.busySlots)) {
      const externalLocks = syncData.busySlots.map((b: any) => ({
        id: `ext-${b.start}-${b.end}`,
        user_id: userId,
        lock_date: dateStr,
        start_time: b.start,
        end_time: b.end,
        is_external: true,
      }))
      lockedSlots = [...lockedSlots, ...externalLocks]
    }
  } catch (e) {
    console.error('Failed to sync availability', e)
  }

  return {
    schedule,
    appointments: appsRes.data || [],
    lockedSlots,
  }
}

export async function createPublicAppointment(data: any) {
  const { error, data: newApp } = await supabase
    .from('appointments' as any)
    .insert([data])
    .select()
    .single()
  if (error) throw error

  // Upsert Contact/Lead
  if (data.user_id && data.client_phone) {
    const phoneNum = data.client_phone.replace(/\D/g, '')
    const { data: existingContacts } = await supabase
      .from('contacts' as any)
      .select('id')
      .eq('user_id', data.user_id)
      .eq('phone', phoneNum)

    const contactPayload = {
      name: data.client_name,
      email: data.client_email,
      document: data.professional_id,
      address: data.clinic_address,
      specialty: data.specialty,
      registration_number: data.professional_id,
      instagram: data.instagram,
      patients_per_month: data.patients_per_month,
      profession: data.specialty ? 'médico' : null,
    }

    if (existingContacts && existingContacts.length > 0) {
      await supabase
        .from('contacts' as any)
        .update(contactPayload)
        .eq('id', existingContacts[0].id)
    } else {
      await supabase.from('contacts' as any).insert({
        user_id: data.user_id,
        phone: phoneNum,
        ...contactPayload,
      })
    }
  }

  // Trigger Automations asynchronously
  if (newApp) {
    // 1. Google Calendar Sync & Email Notification
    supabase.functions
      .invoke('sync-calendar', {
        body: { appointmentId: newApp.id },
      })
      .then((res) => {
        if (res.error) console.error('Sync Calendar Error:', res.error)
        return res.data?.meetLink || newApp.google_meet_link
      })
      .catch((err) => {
        console.error('Invoke Sync Calendar Error:', err)
        return newApp.google_meet_link
      })
      .then((meetLink) => {
        const formattedDate = newApp.appointment_date.split('-').reverse().join('/')

        let meetLinkHtml = ''
        if (meetLink) {
          meetLinkHtml = `
            <div style="margin-top: 24px; padding: 16px; background-color: #f8f9fa; border-radius: 8px; text-align: center;">
              <p style="margin: 0; font-size: 16px; font-weight: bold; color: #333;">Link da reunião no Google Meet:</p>
              <a href="${meetLink}" style="display: inline-block; margin-top: 8px; font-size: 16px; color: #e10050; word-break: break-all;">${meetLink}</a>
            </div>
          `
        }

        // 2. Email Notification (Automated flow with verified domain)
        return supabase.functions.invoke('send-email', {
          body: {
            to: newApp.client_email,
            subject: 'Confirmação de Agendamento - FourLab Nutrition',
            html: `
              <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #e10050; padding: 24px; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 20px;">Agendamento Confirmado! 🎉</h1>
                </div>
                <div style="padding: 32px; background-color: #ffffff;">
                  <p style="font-size: 16px; line-height: 1.5;">Olá <strong>${newApp.client_name}</strong>,</p>
                  <p style="font-size: 16px; line-height: 1.5;">Seu agendamento foi realizado com sucesso para o dia <strong>${formattedDate}</strong> às <strong>${newApp.start_time}</strong>.</p>
                  <p style="font-size: 16px; line-height: 1.5;">Em breve nossa equipe entrará em contato com você para alinhar os detalhes da visita ou da reunião virtual.</p>
                  ${meetLinkHtml}
                  <br/>
                  <p style="font-size: 14px; color: #666;">Atenciosamente,<br/>Equipe FourLab Nutrition</p>
                </div>
              </div>
            `,
            senderName: 'FourLab Nutrition',
          },
        })
      })
      .catch(console.error)
  }

  return newApp
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
