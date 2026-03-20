import { supabase } from '@/lib/supabase/client'
import { format } from 'date-fns'

export const MAX_CAPACITY_PER_SLOT = 10

export async function getDayScheduleData(userId: string, date: Date) {
  const dayOfWeek = date.getDay()
  const dateStr = format(date, 'yyyy-MM-dd')

  const [schedRes, appsRes, locksRes] = await Promise.all([
    supabase
      .from('schedule_settings' as any)
      .select('*')
      .eq('user_id', userId)
      .eq('day_of_week', dayOfWeek),
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
    schedule: schedRes.data || [],
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

  // Trigger GCal Sync asynchronously
  if (newApp) {
    supabase.functions
      .invoke('sync-calendar', {
        body: { appointmentId: newApp.id },
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
