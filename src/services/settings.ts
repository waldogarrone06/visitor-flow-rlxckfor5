import { supabase } from '@/lib/supabase/client'

export async function getIntegrations() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('user_integrations' as any)
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  return data
}

export async function saveIntegrations(updates: any) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const payload = {
    user_id: user.id,
    ...updates,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('user_integrations' as any)
    .upsert(payload, { onConflict: 'user_id' })

  if (error) console.error('Error saving integrations:', error)
  return data
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

  // Replace old schedule entirely
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
