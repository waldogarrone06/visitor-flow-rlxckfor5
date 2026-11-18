// Utilidades de CPF compartilhadas pelas edge functions (visit-lookup,
// reschedule-visit, create-booking). Sempre trabalha com 11 dígitos.
export function cpfDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D+/g, '')
}

// Normaliza para 11 dígitos ou retorna null quando o tamanho não bate.
export function normalizeCpf(value: string | null | undefined): string | null {
  const digits = cpfDigits(value)
  return digits.length === 11 ? digits : null
}

// Validação oficial de CPF (dígitos verificadores). Rejeita sequências
// repetidas (111.111.111-11 etc.), que passam no cálculo modular.
export function isValidCpf(value: string | null | undefined): boolean {
  const digits = cpfDigits(value)
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false

  const verifier = (base: string, weightStart: number) => {
    let sum = 0
    for (let i = 0; i < base.length; i++) {
      sum += Number(base[i]) * (weightStart - i)
    }
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }

  return (
    verifier(digits.slice(0, 9), 10) === Number(digits[9]) &&
    verifier(digits.slice(0, 10), 11) === Number(digits[10])
  )
}
