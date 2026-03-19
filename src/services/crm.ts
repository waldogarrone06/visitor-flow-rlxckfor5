import { supabase } from '@/lib/supabase/client'

export async function getPrescribers(userId: string) {
  const { data, error } = await supabase
    .from('appointments' as any)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error

  const unique = new Map()
  data.forEach((app: any) => {
    if (!unique.has(app.client_email)) {
      unique.set(app.client_email, app)
    }
  })
  return Array.from(unique.values())
}

export async function updatePrescriberData(userId: string, email: string, updates: any) {
  const { error } = await supabase
    .from('appointments' as any)
    .update(updates)
    .eq('user_id', userId)
    .eq('client_email', email)

  if (error) throw error
}
