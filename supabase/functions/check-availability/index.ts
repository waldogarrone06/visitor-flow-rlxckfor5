// Função morta: substituída pela get-availability (service role, com rate
// limit e fail-safe do Google). Removida na auditoria de segurança.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

Deno.serve(() => {
  return new Response(JSON.stringify({ error: 'Function removida. Use get-availability.' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  })
})
