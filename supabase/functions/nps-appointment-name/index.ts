import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Substitui a leitura anônima direta de "appointments" (policy USING(true)) para a
// página pública de NPS: busca APENAS o primeiro nome do cliente, via service role.
// Nenhum e-mail, telefone ou CPF sai por aqui.

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { appointmentId } = await req.json().catch(() => ({}))

    if (!appointmentId) {
      throw new Error('appointmentId é obrigatório.')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    )

    const { data, error } = await supabase
      .from('appointments')
      .select('client_name')
      .eq('id', appointmentId)
      .single()

    if (error || !data) {
      throw new Error('Agendamento não encontrado.')
    }

    // Envia apenas o primeiro nome — minimiza a PII exposta publicamente.
    const firstName = (data.client_name || '').trim().split(/\s+/)[0] || ''

    return new Response(JSON.stringify({ client_name: firstName }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Erro inesperado.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
