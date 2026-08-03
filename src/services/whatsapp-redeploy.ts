import { supabase } from '@/lib/supabase/client'

export interface RedeployReport {
  timestamp: string
  userId: string
  functions: Array<{
    slug: string
    readsFromSecrets: boolean
    verifyJwt: boolean
    redeployed?: boolean
    note?: string
  }>
  credentials: {
    hasAppSecret: boolean
    hasOfficialToken: boolean
    hasApiToken: boolean
    hasVerifyToken: boolean
    hasPhoneNumberId: boolean
    hasWabaId: boolean
    source: string
    hardcodedFallbacks: boolean
  }
  handshake: {
    verifyTokenExists: boolean
    returnsChallenge: boolean
    httpStatus: number
    source?: string
  }
  signature: {
    appSecretExists: boolean
    algorithm?: string
    validAccepted: boolean
    invalidRejected: boolean
    missingRejected: boolean
  }
  noRegression: {
    statusProgression: boolean
    wamidPersisted: boolean
    phoneNormalization: boolean
  }
  overall: 'success' | 'incomplete' | 'pending'
  message: string
}

export async function redeployWhatsAppFunctions(): Promise<RedeployReport> {
  const { data, error } = await supabase.functions.invoke('whatsapp-redeploy')
  if (error) throw new Error(error.message)
  return data as RedeployReport
}
