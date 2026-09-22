import { supabase } from '@/lib/supabase/client'

export interface CreateYampiCouponParams {
  userId?: string
  code?: string
  type?: 'fixed' | 'percent' | 'percentage' | 'value'
  value?: number
  min_order_value?: number | null
  max_discount_value?: number | null
  usage_limit?: number | null
  usage_limit_per_user?: number | null
  expires_at?: string | null
  start_at?: string | null
  active?: boolean
  free_shipping?: boolean
  description?: string
  name?: string
  lead_id?: string
  appointment_id?: string
  context?: Record<string, unknown>
}

export interface CreateYampiCouponResult {
  success: boolean
  id?: string | number
  code?: string
  couponCode?: string
  discountType?: string
  value?: number
  isExisting?: boolean
  isDuplicate?: boolean
  error?: string
  message?: string
  yampiResponse?: any
}

/**
 * Invokes the dedicated yampi-create-coupon Edge Function to create or register coupons on Yampi.
 */
export async function createYampiCouponDirect(
  params: CreateYampiCouponParams,
): Promise<CreateYampiCouponResult> {
  const { data, error } = await supabase.functions.invoke('yampi-create-coupon', {
    body: params,
  })

  if (error) {
    // If invoke errored (e.g. 400 or 409 from Edge Function), data may still hold details
    const errMessage =
      (data as any)?.error || error.message || 'Erro ao conectar à Edge Function da Yampi'
    return {
      success: false,
      isDuplicate: (data as any)?.isDuplicate || false,
      error: errMessage,
    }
  }

  return (
    data || {
      success: true,
      code: params.code,
    }
  )
}
