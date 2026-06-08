import { supabase } from '@/lib/supabase/client'

export async function getKits(userId?: string) {
  const { data, error } = await supabase
    .from('kits' as any)
    .select('*, kit_items(*)')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function createKit(userId: string, kitData: any, items: any[]) {
  const { data: kit, error: kitError } = await supabase
    .from('kits' as any)
    .insert([{ user_id: userId, ...kitData }])
    .select()
    .single()

  if (kitError) throw kitError

  if (items.length > 0) {
    const itemsToInsert = items.map((i) => ({
      kit_id: kit.id,
      product_name: i.product_name,
      quantity: i.quantity,
    }))
    const { error: itemsError } = await supabase.from('kit_items' as any).insert(itemsToInsert)

    if (itemsError) throw itemsError
  }

  return kit
}

export async function deleteKit(kitId: string) {
  const { error } = await supabase
    .from('kits' as any)
    .delete()
    .eq('id', kitId)

  if (error) throw error
}

export async function assignKitToPrescriber(userId: string, email: string, kitName: string) {
  const { data: latest } = await supabase
    .from('appointments' as any)
    .select('id')
    .eq('user_id', userId)
    .eq('client_email', email)
    .neq('status', 'Lead')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (latest) {
    const { error } = await supabase
      .from('appointments' as any)
      .update({ kit_name: kitName })
      .eq('id', latest.id)

    if (error) throw error
  }
}
