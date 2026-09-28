import { supabase } from '@/lib/supabase/client'

export const PATIENT_COUPON_PERCENT = 10
export const PERSONAL_COUPON_PERCENT = 30

export interface DualCouponsParams {
  appointmentId?: string
  contactId?: string
  userId?: string
  force?: boolean
  customPatientCoupon?: string
  customPersonalCoupon?: string
}

export interface DualCouponsResult {
  success: boolean
  message?: string
  isExisting?: boolean
  error?: string
  prescriber?: {
    name: string
    phone: string
    email: string
  }
  coupons?: {
    patient: {
      code: string
      id?: string | number
      discount: number
      quantity?: number
      discountType?: string
      isExisting?: boolean
    }
    personal: {
      code: string
      id?: string | number
      discount: number
      quantity?: number
      discountType?: string
      isExisting?: boolean
    }
  }
  communication?: {
    channel: 'whatsapp' | 'email' | 'none'
    status: 'sent' | 'failed' | 'not_available' | 'already_emitted'
    recipient?: string
    messageId?: string
    error?: string
    message?: string
  }
  details?: any
}

/**
 * Dispara o fluxo padrão de criação de 2 cupons na Yampi (10% paciente, 30% pessoal)
 * e envio automático no WhatsApp oficial da nutricionista (com fallback para e-mail).
 */
export async function triggerDualCouponsFlow(
  params: DualCouponsParams,
): Promise<DualCouponsResult> {
  const { data, error } = await supabase.functions.invoke('yampi-dual-coupons', {
    body: params,
  })

  if (error) {
    let errMessage = error.message || 'Erro ao comunicar com o servidor de cupons.'
    let parsedContext: any = null
    if (typeof (error as any)?.context?.json === 'function') {
      try {
        parsedContext = await (error as any).context.json()
        if (parsedContext?.error) errMessage = parsedContext.error
      } catch {
        // ignore
      }
    }

    return {
      success: false,
      error: (data as any)?.error || parsedContext?.error || errMessage,
      details: data || parsedContext,
    }
  }

  return (
    data || {
      success: true,
      message: 'Cupons processados com sucesso.',
    }
  )
}
