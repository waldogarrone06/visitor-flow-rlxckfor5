// Rate limiting simples por IP (janela fixa persistida no Postgres — não há
// Redis neste projeto). Usado pelas edge functions PÚBLICAS do fluxo de
// agendamento (create-booking, get-availability) com a service role, que
// ignora RLS na tabela public.rate_limit_events.
//
// Design: uma RPC ATÔMICA (public.check_rate_limit) incrementa o contador de
// cada janela e devolve o count atual numa ÚNICA viagem ao banco — substitui
// o par INSERT + SELECT que cada check fazia antes. A get-availability passa
// as duas janelas (minuto e hora) numa só chamada. Se passar do limite, a
// chamada é rejeitada. Eventos antigos são podados dentro da própria RPC.

export const RATE_LIMIT_TABLE = 'rate_limit_events'

export interface RateLimitResult {
  ok: boolean
  remaining: number
  resetSeconds: number
}

interface RateLimitRule {
  bucket: string
  max: number
  windowSeconds: number
}

/**
 * Janela fixa por bucket. Incrementa e devolve ok=false quando estoura.
 * `max` = número máximo de eventos permitidos por `windowSeconds`.
 * (Compatibilidade: segue existendo para 1 janela, via RPC.)
 */
export async function checkRateLimit(
  supabase: any,
  bucket: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const results = await checkRateLimits(supabase, [{ bucket, max, windowSeconds }])
  return results[0]
}

/**
 * Várias janelas numa ÚNICA viagem ao banco (RPC atômica):
 * devolve um resultado por regra, na mesma ordem em que foram passadas.
 *
 * FAIL-OPEN INTENCIONAL E DOCUMENTADO: se a RPC do limitador falhar (erro,
 * timeout, indisponibilidade do Postgres), a chamada segue LIBERADA — o
 * limitador existe para conter abuso, nunca para derrubar o fluxo legítimo
 * de agendamento. Toda falha é logada para auditoria.
 */
export async function checkRateLimits(
  supabase: any,
  rules: RateLimitRule[],
): Promise<RateLimitResult[]> {
  if (!rules || rules.length === 0) return []

  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_rules: rules.map((r) => ({
        bucket: r.bucket,
        max: r.max,
        windowSeconds: r.windowSeconds,
      })),
    })

    if (error) {
      console.error('[rate-limit] RPC falhou (liberando — fail-open):', error.message)
      return rules.map((r) => ({ ok: true, remaining: r.max, resetSeconds: r.windowSeconds }))
    }

    const arr = Array.isArray(data) ? data : []
    return rules.map((r, i) => {
      const item = arr[i]
      if (!item || typeof item.ok !== 'boolean') {
        // Resposta inesperada da RPC: fail-open (mesma política).
        console.error('[rate-limit] resposta inesperada da RPC (liberando — fail-open)')
        return { ok: true, remaining: r.max, resetSeconds: r.windowSeconds }
      }
      return {
        ok: item.ok,
        remaining: Math.max(0, r.max - (Number(item.count) || 0)),
        resetSeconds: r.windowSeconds,
      }
    })
  } catch (e: any) {
    // Fail-open: qualquer exceção (rede, timeout, parsing) libera a chamada.
    console.error('[rate-limit] exceção na RPC (liberando — fail-open):', e?.message || e)
    return rules.map((r) => ({ ok: true, remaining: r.max, resetSeconds: r.windowSeconds }))
  }
}

/**
 * Extrai o melhor identificador de IP do request (por trás do gateway do
 * Supabase).
 *
 * SEGURANÇA (auditoria): o PRIMEIRO valor da cadeia X-Forwarded-For é
 * CONTROLADO PELO PRÓPRIO CLIENTE — o proxy só ACRESCENTA o IP real ao final
 * da cadeia. Quem manda `X-Forwarded-For: <IP aleatório>` a cada chamada
 * trocava de "IP" e nunca atingia o limite. Ordem correta:
 *  1. cf-connecting-ip (definido pela Cloudflare, não forjável pelo cliente);
 *  2. ÚLTIMO IP da cadeia X-Forwarded-For (o mais próximo do nosso proxy);
 *  3. x-real-ip; 4. 'desconhecido'.
 */
export function getClientIp(req: Request): string {
  const cfIp = (req.headers.get('cf-connecting-ip') || '').trim()
  if (cfIp) return cfIp

  const fwd = req.headers.get('x-forwarded-for') || ''
  const parts = fwd
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '')
  const last = parts[parts.length - 1]
  if (last) return last

  return req.headers.get('x-real-ip') || 'desconhecido'
}

/**
 * Extrai a origem do body (userId do profissional) para compor buckets por
 * origem — evita que um IP único saturando um profissional afete outro.
 */
export function bucketFor(prefix: string, ip: string, scope?: string | null): string {
  const safeIp = (ip || 'desconhecido').slice(0, 120)
  const safeScope = (scope || '').replace(/[^0-9a-f-]/gi, '').slice(0, 64)
  return safeScope ? `${prefix}:${safeScope}:${safeIp}` : `${prefix}:${safeIp}`
}
