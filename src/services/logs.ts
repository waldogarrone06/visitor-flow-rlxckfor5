import { supabase } from '@/lib/supabase/client'

export async function getWhatsAppEvents(limit = 100) {
  const { data, error } = await supabase
    .from('whatsapp_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data
}

export async function getInteractionLogs(limit = 100) {
  const { data, error } = await supabase
    .from('interaction_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data
}

export async function deleteInteractionLog(id: string) {
  const { error } = await supabase.from('interaction_log').delete().eq('id', id)

  if (error) throw error
}
