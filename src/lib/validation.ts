/**
 * Validações centralizadas de cadastro de contato (exigência p/ emissão de NF).
 * Usado em todos os formulários de contato do app.
 */

export const UF_OPTIONS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
]

export function onlyDigits(value?: string | null): string {
  return value ? value.replace(/\D/g, '') : ''
}

/** CPF: 11 dígitos com validação dos dígitos verificadores. Aceita formatado. */
export function isValidCPF(value?: string | null): boolean {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false // sequências repetidas: 000.000.000-00 etc.

  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(cpf.charAt(i), 10) * (10 - i)
  let check1 = 11 - (sum % 11)
  if (check1 > 9) check1 = 0
  if (parseInt(cpf.charAt(9), 10) !== check1) return false

  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(cpf.charAt(i), 10) * (11 - i)
  let check2 = 11 - (sum % 11)
  if (check2 > 9) check2 = 0
  if (parseInt(cpf.charAt(10), 10) !== check2) return false

  return true
}

/**
 * Telefone: 10 ou 11 dígitos após normalização.
 * Aceita +55, DDD, espaços, traços e parênteses.
 */
export function isValidPhone(value?: string | null): boolean {
  let digits = onlyDigits(value)
  // Remove prefixo do Brasil (55) quando sobrar 12-13 dígitos
  if (digits.length >= 12 && digits.length <= 13 && digits.startsWith('55')) {
    digits = digits.slice(2)
  }
  return digits.length === 10 || digits.length === 11
}

/** Extrai os 10/11 dígitos do telefone (sem código do país). */
export function normalizePhone(value?: string | null): string {
  let digits = onlyDigits(value)
  if (digits.length >= 12 && digits.length <= 13 && digits.startsWith('55')) {
    digits = digits.slice(2)
  }
  return digits
}

/** CEP: 8 dígitos, com ou sem hífen. */
export function isValidCep(value?: string | null): boolean {
  return onlyDigits(value).length === 8
}

export interface ContactRequiredFields {
  name?: string | null
  phone?: string | null
  document?: string | null // CPF
  street?: string | null
  number?: string | null
  neighborhood?: string | null
  city?: string | null
  state?: string | null
  cep?: string | null
}

/**
 * Valida os campos obrigatórios de cadastro de contato.
 * Retorna um mapa campo -> mensagem de erro (vazio quando tudo OK).
 */
export function validateContactFields(data: ContactRequiredFields): Record<string, string> {
  const errors: Record<string, string> = {}

  const name = (data.name || '').trim()
  if (!name) errors.name = 'Nome obrigatório'
  else if (name.length < 3) errors.name = 'Informe o nome completo'

  if (!data.phone || !data.phone.trim()) errors.phone = 'Telefone obrigatório'
  else if (!isValidPhone(data.phone))
    errors.phone = 'Telefone inválido — informe DDD (10 ou 11 dígitos)'

  if (!data.document || !data.document.trim()) errors.document = 'CPF obrigatório'
  else if (!isValidCPF(data.document)) errors.document = 'CPF inválido'

  if (!data.street || !data.street.trim()) errors.street = 'Endereço (rua/avenida) obrigatório'
  if (!data.number || !data.number.trim()) errors.number = 'Número obrigatório'
  if (!data.neighborhood || !data.neighborhood.trim()) errors.neighborhood = 'Bairro obrigatório'
  if (!data.city || !data.city.trim()) errors.city = 'Cidade obrigatória'
  if (!data.state || !data.state.trim()) errors.state = 'Estado (UF) obrigatório'

  if (!data.cep || !data.cep.trim()) errors.cep = 'CEP obrigatório'
  else if (!isValidCep(data.cep)) errors.cep = 'CEP inválido — informe 8 dígitos'

  return errors
}

/** Máscara de exibição: (11) 99999-9999 */
export function maskPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** Máscara de exibição: 000.000.000-00 */
export function maskCPF(value: string): string {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/** Máscara de exibição: 00000-000 */
export function maskCep(value: string): string {
  const d = onlyDigits(value).slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}
