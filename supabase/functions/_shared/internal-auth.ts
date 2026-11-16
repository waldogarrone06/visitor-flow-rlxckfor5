// Autenticação de edge functions INTERNAS (chamadas por outras funções do
// servidor) ou por um usuário autenticado do front. Mesmo padrão do send-email:
//
// 1. Caminho INTERNO: header Authorization `Bearer <SUPABASE_SERVICE_ROLE_KEY>`
//    comparado com o secret do ambiente (a service role key não é JWT de
//    usuário — auth.getUser() falha para ela, por isso a comparação vem antes).
// 2. Caminho FRONT: JWT real de usuário autenticado, validado via auth.getUser().
//    Anon key / sem token => 401.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from './cors.ts'

export type AuthResult = { ok: true; isInternal: boolean } | { ok: false; response: Response }

export function unauthorized(message = 'Não autenticado ou token inválido.'): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export async function requireInternalOrUserAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!token) return { ok: false, response: unauthorized('Não autenticado: token ausente.') }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

  // 1) Interno: comparação exata com a service role key do ambiente.
  if (serviceKey && token === serviceKey) return { ok: true, isInternal: true }

  // 2) Front: JWT de usuário autenticado. Anon key => 401.
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const supabaseAsUser = createClient(supabaseUrl, supabaseAnonKey || token, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await supabaseAsUser.auth.getUser(token)

  if (userError || !userData?.user || userData.user.role !== 'authenticated') {
    return { ok: false, response: unauthorized() }
  }

  return { ok: true, isInternal: false }
}

// Escapa dados do usuário interpolados em HTML de e-mails (auditoria S7).
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
