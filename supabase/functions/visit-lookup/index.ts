import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { cpfDigits, isValidCpf } from '../_shared/cpf.ts'
import { checkRateLimits, getClientIp, bucketFor } from '../_shared/rate-limit.ts'

// visit-lookup — consulta pública de eligibility por CPF na rota /remarcar/:userId
// Devolve SEM dados sensíveis além do próprio nome (LGPD: e-mail/telefone/CPF
// vêm mascarados ou não vêm).
const LOOKUP_LIMIT_PER_MIN = 10

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method !== 'POST') return json(405, { error: 'Método não permitido.' })

    const { userId, cpf } = await req.json().catch(() => ({}))
    if (!userId || !cpf) return json(400, { error: 'userId e cpf são obrigatórios.' })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    )

    // Rate limit por IP (leitura pública)
    const [perMinute] = await checkRateLimits(supabase, [
      {
        bucket: bucketFor('visit-lookup', getClientIp(req)),
        max: LOOKUP_LIMIT_PER_MIN,
        windowSeconds: 60,
      },
    ])
    if (!perMinute.ok) return json(429, { error: 'Muitas consultas. Aguarde um instante.' })

    if (!isValidCpf(cpf)) return json(400, { error: 'CPF inválido. Verifique os dígitos.' })

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle()
    if (!profile) return json(404, { error: 'Representante não encontrado.' })

    const { data, error } = await supabase.rpc('visit_eligibility', {
      p_user_id: userId,
      p_cpf: cpfDigits(cpf),
    })
    if (error) {
      console.error('[visit-lookup] rpc visit_eligibility:', error.message)
      return json(500, { error: 'Falha ao consultar a situação do CPF. Tente novamente.' })
    }

    return json(200, data)
  } catch (error: any) {
    console.error('[visit-lookup] Error:', error?.message || error)
    return json(500, { error: 'Erro inesperado.' })
  }
})
