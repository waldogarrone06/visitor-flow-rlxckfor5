import { supabase } from '@/lib/supabase/client'

export interface CreateYampiCouponParams {
  userId?: string
  code?: string
  prescritor?: string
  name?: string
  type?: 'fixed' | 'percent' | 'percentage' | 'value' | 'p' | 'v' | 'f' | string
  discount_type?: 'p' | 'v' | 'f' | 'percentage' | 'fixed' | string
  value?: number
  quantity?: number
  min_value?: number
  min_order_value?: number | null
  max_discount_value?: number | null
  usage_limit?: number | null
  usage_limit_per_user?: number | null
  once_per_customer?: boolean
  accumulate?: boolean
  free_shipment?: boolean
  free_shipping?: boolean
  expires_at?: string | null
  end_at?: string | null
  start_at?: string | null
  active?: boolean
  description?: string
  lead_id?: string
  appointment_id?: string
  context?: Record<string, unknown>
}

export interface YampiAttempt {
  step?: string
  endpoint: string
  method?: string
  status: number
  isHtml: boolean
  outcome: string
  message?: string
  codeTried?: string
  responseSnippet?: string
}

export interface CreateYampiCouponResult {
  success: boolean
  id?: string | number
  code?: string
  couponCode?: string
  discountType?: string
  value?: number
  endpoint?: string
  attempts?: YampiAttempt[]
  preflight?: {
    ok: boolean
    status: number
    message?: string
  }
  httpStatus?: number
  isExisting?: boolean
  isDuplicate?: boolean
  error?: string
  message?: string
  yampiResponse?: any
}

/**
 * Invokes the dedicated yampi-create-coupon Edge Function to create or register promocodes on Yampi.
 * Uses POST /v2/{alias}/pricing/promocodes and handles duplicate retry automatically.
 */
export async function createYampiCouponDirect(
  params: CreateYampiCouponParams,
): Promise<CreateYampiCouponResult> {
  const { data, error } = await supabase.functions.invoke('yampi-create-coupon', {
    body: params,
  })

  if (error) {
    let errMessage =
      (data as any)?.error ||
      (error as any)?.context?.error ||
      error.message ||
      'Erro ao conectar à Edge Function da Yampi'

    let parsedContext: any = null
    if (typeof (error as any)?.context?.json === 'function') {
      try {
        parsedContext = await (error as any).context.json()
        if (parsedContext?.error) errMessage = parsedContext.error
      } catch {
        // ignore
      }
    }

    const payload = data || parsedContext
    return {
      success: false,
      isDuplicate: (payload as any)?.isDuplicate || false,
      code: (payload as any)?.code || params.code,
      endpoint: (payload as any)?.endpoint,
      attempts: (payload as any)?.attempts,
      preflight: (payload as any)?.preflight,
      httpStatus: (payload as any)?.httpStatus,
      error: errMessage,
      yampiResponse: payload,
    }
  }

  return (
    data || {
      success: true,
      code: params.code,
    }
  )
}
