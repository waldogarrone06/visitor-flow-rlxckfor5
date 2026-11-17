import { supabase } from '@/lib/supabase/client'
import { createYampiCouponDirect } from '@/services/yampi'

export async function getPrescribers(userId: string) {
  const { data, error } = await supabase
    .from('appointments' as any)
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'lead')
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

export async function createYampiCoupon(
  appointmentId: string,
  userId: string,
  name: string,
  email: string,
  options?: {
    code?: string
    value?: number
    validityDays?: number
    leadId?: string
  },
) {
  const res = await createYampiCouponDirect({
    userId,
    appointment_id: appointmentId,
    prescritor: name,
    name,
    code: options?.code,
    value: options?.value ?? 10,
    discount_type: 'p',
    type: 'percent',
    validity_days: options?.validityDays ?? null,
    lead_id: options?.leadId,
    context: { email },
  })

  if (!res.success) {
    throw new Error(res.error || 'Erro ao gerar cupom na Yampi')
  }

  return res
}

export async function syncYampiUsage(userId: string) {
  const { data, error } = await supabase.functions.invoke('yampi-service', {
    body: { action: 'sync-usage', userId },
  })
  if (error) throw error
  return data
}
