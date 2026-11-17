// Rate limiting simples por IP (janela fixa persistida no Postgres — não há
// Redis neste projeto). Usado pelas edge functions PÚBLICAS do fluxo de
// agendamento (create-booking, get-availability) com a service role, que
// ignora RLS na tabela public.rate_limit_events.
//
// Design: cada check registra um evento (bucket, created_at) e conta os
// eventos da mesma bucket dentro da janela. Se passar do limite, a chamada é
// rejeitada. Eventos antigos são podados com baixa probabilidade para manter
// a tabela pequena sem precisar de cron.

export const RATE_LIMIT_TABLE = 'rate_limit_events'

export interface RateLimitResult {
  ok: boolean
  remaining: number
  resetSeconds: number
}

function pruningRoll(): boolean {
  // ~5% das chamadas podam eventos mais antigos que 24h.
  return Math.random() < 0.05
}

/**
 * Janela fixa por bucket. Incrementa e devolve ok=false quando estoura.
 * `max` = número máximo de eventos permitidos por `windowSeconds`.
 */
export async function checkRateLimit(
  supabase: any,
  bucket: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString()

  // Registra a tentativa ANTES de decidir: toda requisição conta para a janela.
  const { error: insertError } = await supabase
    .from(RATE_LIMIT_TABLE)
    .insert({ bucket, created_at: new Date().toISOString() })

  if (insertError) {
    // Falha do limitador NUNCA derruba o fluxo legítimo: libera e loga.
    console.error('[rate-limit] insert falhou (liberando):', insertError.message)
    return { ok: true, remaining: max, resetSeconds: windowSeconds }
  }

  const { data: rows, error: countError } = await supabase
    .from(RATE_LIMIT_TABLE)
    .select('id', { count: 'exact', head: false })
    .eq('bucket', bucket)
    .gte('created_at', windowStart)

  if (countError) {
    console.error('[rate-limit] count falhou (liberando):', countError.message)
    return { ok: true, remaining: max, resetSeconds: windowSeconds }
  }

  const used = rows?.length ?? 0
  if (pruningRoll()) {
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    supabase
      .from(RATE_LIMIT_TABLE)
      .delete()
      .lt('created_at', dayAgo)
      .then(({ error }: any) => {
        if (error) console.error('[rate-limit] prune falhou:', error.message)
      })
      .catch(() => {})
  }

  return {
    ok: used <= max,
    remaining: Math.max(0, max - used),
    resetSeconds: windowSeconds,
  }
}

/**
 * Extrai o melhor identificador de IP do request (por trás do gateway do
 * Supabase). Cadeia X-Forwarded-For: o primeiro IP é o cliente original.
 */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') || ''
  const first = fwd.split(',')[0]?.trim()
  if (first) return first
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'desconhecido'
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
