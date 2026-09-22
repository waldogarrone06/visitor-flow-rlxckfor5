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
    // Supabase client error object; inspect any response payload attached to error or data
    let errMessage =
      (data as any)?.error ||
      (error as any)?.context?.error ||
      error.message ||
      'Erro ao conectar à Edge Function da Yampi'

    // If supabase.functions.invoke error contains raw json inside message or context
    if (typeof (error as any)?.context?.json === 'function') {
      try {
        const parsed = await (error as any).context.json()
        if (parsed?.error) errMessage = parsed.error
      } catch {
        // ignore
      }
    }

    return {
      success: false,
      isDuplicate: (data as any)?.isDuplicate || false,
      code: (data as any)?.code || params.code,
      error: errMessage,
      yampiResponse: data,
    }
  }

  return (
    data || {
      success: true,
      code: params.code,
    }
  )
}
