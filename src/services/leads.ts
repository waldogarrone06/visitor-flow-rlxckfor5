import { supabase } from '@/lib/supabase/client'

export interface LeadOption {
  id: string
  client_name: string
  client_email: string | null
  client_phone: string | null
  kit_name: string | null
  nutritionist_coupon: string | null
  patient_coupon: string | null
  status: string | null
}

export async function getLeads(userId: string): Promise<LeadOption[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select(
      'id, client_name, client_email, client_phone, kit_name, nutritionist_coupon, patient_coupon, status, created_at',
    )
    .eq('user_id', userId)
    .eq('status', 'lead')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as LeadOption[]
}

export async function getAllLeadsForKits(userId: string): Promise<LeadOption[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select(
      'id, client_name, client_email, client_phone, kit_name, nutritionist_coupon, patient_coupon, status, created_at',
    )
    .eq('user_id', userId)
    .neq('status', 'Cancelled')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as LeadOption[]
}

export async function deleteLead(leadId: string): Promise<void> {
  const { error } = await supabase.from('appointments').delete().eq('id', leadId)

  if (error) throw error
}
