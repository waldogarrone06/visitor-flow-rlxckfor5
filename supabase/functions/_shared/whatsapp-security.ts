const STATUS_PRIORITY: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  played: 4,
}

export function getStatusPriority(status: string): number {
  return STATUS_PRIORITY[status] ?? 0
}

export function shouldUpdateStatus(currentStatus: string | null, newStatus: string): boolean {
  if (newStatus === 'failed') return true
  const currentPriority = getStatusPriority(currentStatus || '')
  const newPriority = getStatusPriority(newStatus)
  return newPriority > currentPriority
}

export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader || !appSecret) return false

  const prefix = 'sha256='
  if (!signatureHeader.startsWith(prefix)) return false

  const signature = signatureHeader.substring(prefix.length)

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))

  const digest = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  if (digest.length !== signature.length) return false

  let result = 0
  for (let i = 0; i < digest.length; i++) {
    result |= digest.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return result === 0
}

export function normalizePhoneVariants(phone: string): string[] {
  const variants = new Set<string>([phone])

  if (phone.startsWith('55')) {
    variants.add(phone.substring(2))
    const ddd = phone.substring(2, 4)
    const num = phone.substring(4)
    if (num.length === 9 && num.startsWith('9')) {
      variants.add(`55${ddd}${num.substring(1)}`)
      variants.add(`${ddd}${num.substring(1)}`)
    } else if (num.length === 8) {
      variants.add(`55${ddd}9${num}`)
      variants.add(`${ddd}9${num}`)
    }
  } else if (phone.length === 10 || phone.length === 11) {
    variants.add(`55${phone}`)
    const ddd = phone.substring(0, 2)
    const num = phone.substring(2)
    if (num.length === 9 && num.startsWith('9')) {
      variants.add(`55${ddd}${num.substring(1)}`)
      variants.add(`${ddd}${num.substring(1)}`)
    } else if (num.length === 8) {
      variants.add(`55${ddd}9${num}`)
      variants.add(`${ddd}9${num}`)
    }
  }

  return Array.from(variants)
}
