import { supabase } from '@/lib/supabase/client'

export async function getContacts() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('contacts' as any)
    .select('*')
    .eq('user_id', user.id)
    .order('name')

  if (error) throw error
  return data || []
}

export async function createContact(contact: { name: string; phone: string }) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('contacts' as any)
    .insert({
      user_id: user.id,
      name: contact.name,
      phone: contact.phone.replace(/\D/g, ''),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getMessages(contactId: string) {
  const { data, error } = await supabase
    .from('messages' as any)
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function saveMessage(
  contactId: string,
  content: string,
  direction: 'inbound' | 'outbound' = 'outbound',
) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('messages' as any)
    .insert({
      user_id: user.id,
      contact_id: contactId,
      content,
      direction,
    })
    .select()
    .single()

  if (error) throw error
  return data
}
