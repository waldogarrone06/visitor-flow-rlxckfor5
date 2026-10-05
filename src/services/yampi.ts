import { supabase } from '@/lib/supabase/client'

export interface CreateYampiCouponParams {
  userId?: string
  code?: string
  name?: string
  value?: number
  discount_type?: 'p' | 'v' | 'f' | 'fixed' | 'percent' | string
  type?: string
  quantity?: number
  validity_days?: number | null
  description?: string
  prescritor?: string
  lead_id?: string
  appointment_id?: string
  context?: Record<string, unknown>
}

export interface YampiAttempt {
  step?: string
  endpoint: string
  method?: string
  status: number
  isHtml?: boolean
  outcome: string
  message?: string
  codeTried?: string
  responseSnippet?: string
}

export interface CreateYampiCouponResult {
  success: boolean
  id?: number | string
  code?: string
  couponCode?: string
  discountType?: string
  value?: number
  quantity?: number
  error?: string
  isDuplicate?: boolean
  attempts?: YampiAttempt[]
  endpoint?: string
  warning?: string
  exclusionWarning?: string
  fixedRulesApplied?: {
    quantity: number
    discount_type: string
    excluded_keywords?: string[]
    excluded_products_count?: number
    excluded_products_sample?: string[]
  }
}

/**
 * Direct call to the Edge Function yampi-create-coupon.
 * Uses POST /v2/{alias}/pricing/promocodes and handles duplicate retry automatically.
 */
export async function createYampiCouponDirect(
  params: CreateYampiCouponParams,
): Promise<CreateYampiCouponResult> {
  const { data, error } = await supabase.functions.invoke('yampi-create-coupon', {
    body: params,
  })

  if (error) {
    let errMessage = error.message
    let attempts: YampiAttempt[] | undefined
    let rawErrorData: any = null

    try {
      if (typeof error === 'object' && 'context' in error) {
        const ctx: any = (error as any).context
        if (typeof ctx?.json === 'function') {
          const bodyJson = await ctx.json()
          rawErrorData = bodyJson
          errMessage = bodyJson?.error || bodyJson?.message || errMessage
          attempts = bodyJson?.attempts
        }
      }
    } catch {
      // ignore
    }

    if (
      !errMessage ||
      errMessage.toLowerCase().includes('edge function returned a 4') ||
      errMessage.toLowerCase().includes('edge function returned a 5')
    ) {
      errMessage =
        (data as any)?.error ||
        rawErrorData?.error ||
        'Não foi possível criar o cupom na Yampi. Verifique as credenciais da integração em Configurações > Integração Yampi.'
    }

    return {
      success: false,
      error: errMessage || 'Falha ao comunicar com o servidor para criar o cupom.',
      attempts: attempts || (data as any)?.attempts,
      endpoint: rawErrorData?.endpoint || (data as any)?.endpoint,
      isDuplicate: rawErrorData?.isDuplicate || (data as any)?.isDuplicate,
    }
  }

  return (data || {
    success: false,
    error: 'Resposta vazia da função Yampi',
  }) as CreateYampiCouponResult
}
