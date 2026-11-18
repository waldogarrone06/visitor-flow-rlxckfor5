// _shared/cpf.ts — helpers de CPF compartilhados pelas edge functions
// (visit-lookup, reschedule-visit, create-booking).

// Apenas dígitos — reutiliza a mesma regra de cpf_digits no banco.
export function cpfDigits(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '')
}

// CPF válido: 11 dígitos e dígitos verificadores corretos.
export function isValidCpf(raw: string | null | undefined): boolean {
  const digits = cpfDigits(raw)
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false // 111.111.111-11 etc.
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * (10 - i)
  let d1 = (sum * 10) % 11
  if (d1 === 10) d1 = 0
  if (d1 !== Number(digits[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * (11 - i)
  let d2 = (sum * 10) % 11
  if (d2 === 10) d2 = 0
  return d2 === Number(digits[10])
}

// Máscara para exibição
export function maskCpf(raw: string | null | undefined): string {
  const d = cpfDigits(raw).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}
