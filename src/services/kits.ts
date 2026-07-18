import { supabase } from '@/lib/supabase/client'

export async function getKits(userId?: string, onlyStandard = false) {
  let query = supabase
    .from('kits' as any)
    .select('*, kit_items(*)')
    .order('created_at', { ascending: false })

  if (onlyStandard) {
    query = query.or('is_personalized.eq.false,is_personalized.is.null')
  }

  const { data, error } = await query

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

export async function updateKitItems(kitId: string, kitData: any, items: any[]) {
  // Update kit info
  const { error: kitError } = await supabase
    .from('kits' as any)
    .update(kitData)
    .eq('id', kitId)

  if (kitError) throw kitError

  // Remove old items
  await supabase
    .from('kit_items' as any)
    .delete()
    .eq('kit_id', kitId)

  // Insert new items
  if (items.length > 0) {
    const itemsToInsert = items.map((i) => ({
      kit_id: kitId,
      product_name: i.product_name,
      quantity: i.quantity,
    }))
    const { error: itemsError } = await supabase.from('kit_items' as any).insert(itemsToInsert)
    if (itemsError) throw itemsError
  }
}

export async function deleteKit(kitId: string) {
  // First delete associated kit_items to prevent foreign key constraint errors
  const { error: itemsError } = await supabase
    .from('kit_items' as any)
    .delete()
    .eq('kit_id', kitId)

  if (itemsError) throw itemsError

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
