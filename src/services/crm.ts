import { supabase } from '@/lib/supabase/client'

export async function getPrescribers(userId: string) {
  const { data, error } = await supabase
    .from('appointments' as any)
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'Lead')
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
    type?: 'fixed' | 'percent' | 'percentage'
    leadId?: string
  },
) {
  // First try the dedicated edge function yampi-create-coupon
  const { data, error } = await supabase.functions.invoke('yampi-create-coupon', {
    body: {
      userId,
      appointment_id: appointmentId,
      name,
      code: options?.code,
      value: options?.value,
      type: options?.type || 'fixed',
      lead_id: options?.leadId,
      context: { email },
    },
  })

  // If yampi-create-coupon worked or returned a handled response, return it
  if (!error && data?.success) {
    return data
  }

  // Fallback to legacy yampi-service if user hasn't configured full store credentials yet
  if (
    error &&
    (data?.code === 'YAMPI_NOT_CONFIGURED' || error.message?.includes('YAMPI_NOT_CONFIGURED'))
  ) {
    const legacy = await supabase.functions.invoke('yampi-service', {
      body: { action: 'create-coupon', appointmentId, userId, name, email },
    })
    if (legacy.error) throw legacy.error
    return legacy.data
  }

  if (error) {
    const errMsg = data?.error || error.message || 'Erro ao gerar cupom na Yampi'
    throw new Error(errMsg)
  }

  return data
}

export async function syncYampiUsage(userId: string) {
  const { data, error } = await supabase.functions.invoke('yampi-service', {
    body: { action: 'sync-usage', userId },
  })
  if (error) throw error
  return data
}
