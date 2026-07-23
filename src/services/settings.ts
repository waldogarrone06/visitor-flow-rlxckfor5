import { supabase } from '@/lib/supabase/client'

export async function getIntegrations(targetUserId?: string) {
  try {
    const userId = targetUserId || (await supabase.auth.getUser()).data.user?.id
    if (!userId) return null

    const { data, error } = await supabase
      .from('user_integrations' as any)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('Error fetching integrations:', error)
      return null
    }

    if (data) {
      ;(data as any)._has_official_access_token = !!(data as any).whatsapp_official_access_token
    }

    return data
  } catch (err) {
    console.error('Exception fetching integrations:', err)
    return null
  }
}

export async function saveIntegrations(updates: any, targetUserId?: string) {
  try {
    const userId = targetUserId || (await supabase.auth.getUser()).data.user?.id
    if (!userId) return null

    const payload = {
      user_id: userId,
      ...updates,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('user_integrations' as any)
      .upsert(payload, { onConflict: 'user_id' })
      .select()

    if (error) throw error
    return data
  } catch (err) {
    console.error('Error saving integrations:', err)
    throw err
  }
}

export async function getSchedule() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('schedule_settings' as any)
    .select('*')
    .eq('user_id', user.id)
    .order('day_of_week')
    .order('start_time')

  if (error) console.error('Error fetching schedule:', error)
  return data || []
}

export async function saveSchedule(slots: any[]) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('schedule_settings' as any)
    .delete()
    .eq('user_id', user.id)

  if (slots.length > 0) {
    const toInsert = slots.map((s) => ({
      user_id: user.id,
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      slot_type: s.slot_type,
    }))

    const { error } = await supabase.from('schedule_settings' as any).insert(toInsert)
    if (error) console.error('Error saving schedule:', error)
  }
}

export async function clearSchedule() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('schedule_settings' as any)
    .delete()
    .eq('user_id', user.id)
}

export async function getSpecificSchedule(dateStr: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('date_specific_schedules' as any)
    .select('*')
    .eq('user_id', user.id)
    .eq('specific_date', dateStr)
    .order('start_time')

  if (error) console.error('Error fetching specific schedule:', error)
  return data || []
}

export async function saveSpecificSchedule(dateStr: string, slots: any[]) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('date_specific_schedules' as any)
    .delete()
    .eq('user_id', user.id)
    .eq('specific_date', dateStr)

  if (slots.length > 0) {
    const toInsert = slots.map((s) => ({
      user_id: user.id,
      specific_date: dateStr,
      start_time: s.start_time,
      end_time: s.end_time,
      slot_type: s.slot_type || 'Prescritor Exclusivo',
    }))

    const { error } = await supabase.from('date_specific_schedules' as any).insert(toInsert)
    if (error) console.error('Error saving specific schedule:', error)
  }
}

export async function getAllSpecificSchedules() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('date_specific_schedules' as any)
    .select('specific_date')
    .eq('user_id', user.id)

  if (error) console.error('Error fetching all specific schedules:', error)
  return data || []
}

export async function getProfiles() {
  try {
    const { data, error } = await supabase
      .from('profiles' as any)
      .select('*')
      .order('name')
    if (error) console.error('Error fetching profiles:', error)
    return data || []
  } catch (err) {
    console.error('Exception fetching profiles:', err)
    return []
  }
}

export async function getCurrentProfile() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('profiles' as any)
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      console.error('Error fetching current profile:', error)
      return null
    }

    return data
  } catch (err) {
    console.error('Exception fetching current profile:', err)
    return null
  }
}
