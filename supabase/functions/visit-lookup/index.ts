// Edge function: visit-lookup
// Consulta a elegibilidade de remarcação de visita por CPF (rota pública /remarcar/:userId).
//
// POST { userId, cpf }
// Retorna:
//   200 { action: 'remarcar' | 'bloqueado' | 'nova_visita' | 'sem_visita', visit?, eligibleFrom? }
//   400 CPF inválido | 404 representante não encontrado | 405 método | 500 erro interno
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { normalizeCpf, isValidCpf } from '../_shared/cpf.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { userId, cpf } = await req.json()
    if (!userId || typeof userId !== 'string') {
      return new Response(JSON.stringify({ error: 'userId é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const digits = normalizeCpf(cpf)
    if (!digits || !isValidCpf(digits)) {
      return new Response(JSON.stringify({ error: 'CPF inválido. Verifique os 11 dígitos.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Representante precisa existir (qualquer perfil com o id informado na URL).
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle()
    if (profileErr) throw profileErr
    if (!profile) {
      return new Response(JSON.stringify({ error: 'Representante não encontrado.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data, error } = await admin.rpc('visit_eligibility', {
      p_user_id: userId,
      p_cpf: digits,
    })
    if (error) throw error

    const result = Array.isArray(data) ? data[0] : data
    if (!result) {
      return new Response(JSON.stringify({ error: 'Não foi possível avaliar o CPF.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // visit_eligibility (20261118160000) retorna camelCase:
    //   { action, reason? }                                        — 'normal' (CPF inválido)
    //   { action: 'reschedule', canReschedule, rescheduleCount,
    //     appointment: { id, appointment_date, start_time, ... } } — visita em aberto
    //   { action: 'blocked', lastVisitDate, releaseDate }          — <30 dias
    //   { action: 'new' }                                          — pode agendar nova visita
    // Normaliza para o contrato esperado pelo front (src/services/visit-reschedule.ts):
    // remarcar | bloqueado (mostra data de liberação) | nova_visita | sem_visita.
    const rawAction = String(result.action ?? '')
    const appt = (result.appointment ?? null) as Record<string, any> | null
    let action: string
    if (rawAction === 'reschedule' && result.canReschedule === false) {
      action = 'sem_visita' // 5 remarcações esgotadas → falar com o representante
    } else if (rawAction === 'reschedule' && appt?.id) {
      action = 'remarcar'
    } else if (rawAction === 'blocked') {
      action = 'bloqueado'
    } else if (rawAction === 'new') {
      action = 'nova_visita'
    } else {
      action = 'sem_visita'
    }

    return new Response(
      JSON.stringify({
        action,
        visit:
          action === 'remarcar' && appt
            ? {
                id: appt.id,
                appointment_date: appt.appointment_date ?? null,
                start_time: appt.start_time ?? null,
                end_time: appt.end_time ?? null,
                reschedule_count: Number(result.rescheduleCount ?? appt.reschedule_count ?? 0),
              }
            : null,
        released_at: result.releaseDate ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('visit-lookup error:', e)
    return new Response(JSON.stringify({ error: 'Erro interno ao consultar o CPF.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
