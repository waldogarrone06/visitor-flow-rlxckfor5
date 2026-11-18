// Edge function: reschedule-visit
// Remarca uma visita em aberto por CPF (rota pública /remarcar/:userId).
//
// POST { userId, cpf, date, startTime, endTime }
// Fluxo: valida CPF → reserva o slot (RPC book_appointment_guarded: trava de capacidade
// 10 por slot completo + trava por CPF, sem validar Google nesta RPC) → remarca a MESMA
// visita via RPC reschedule_appointment (UPDATE, sem linha nova).
// Retorna: 200 { ok, appointment } | 400/404/409/422/500 com { error }.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { normalizeCpf, isValidCpf } from '../_shared/cpf.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, prefer',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

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
    const { userId, cpf, date, startTime, endTime } = await req.json()

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

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(JSON.stringify({ error: 'Data inválida.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!HHMM.test(startTime || '') || !HHMM.test(endTime || '')) {
      return new Response(JSON.stringify({ error: 'Horário inválido (use HH:MM).' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (startTime >= endTime) {
      return new Response(JSON.stringify({ error: 'O horário de fim deve ser após o início.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Data passada (BRT = UTC-3): recusada, igual ao create-booking.
    const nowBrt = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
    if (date < nowBrt) {
      return new Response(JSON.stringify({ error: 'Não é possível remarcar para uma data passada.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1) Elegibilidade atual (action remarcar?) — refresca o estado antes de escrever.
    const { data: elig, error: eligErr } = await admin.rpc('visit_eligibility', {
      p_user_id: userId,
      p_cpf: digits,
    })
    if (eligErr) throw eligErr
    const eligibility = Array.isArray(elig) ? elig[0] : elig
    if (!eligibility || eligibility.action !== 'reschedule' || !eligibility.open_visit_id) {
      return new Response(
        JSON.stringify({ error: 'Não há visita em aberto para remarcar com este CPF.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2) Ocupação do slot: reschedule_appointment valida via visit_slot_available
    //    (capacidade 10 por slot completo, fora a própria visita sendo remarcada).
    const { data: appointment, error: reschedErr } = await admin.rpc('reschedule_appointment', {
      p_user_id: userId,
      p_appointment_id: eligibility.open_visit_id,
      p_cpf: digits,
      p_new_date: date,
      p_new_start: startTime,
      p_new_end: endTime,
    })
    if (reschedErr) throw reschedErr

    const row = Array.isArray(appointment) ? appointment[0] : appointment
    if (!row || !row.ok) {
      const status = row?.status ?? 409
      return new Response(JSON.stringify({ error: row?.message ?? 'Não foi possível remarcar.' }), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true, appointment: row.appointment ?? null }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('reschedule-visit error:', e)
    const msg = e?.message ?? 'Erro interno ao remarcar a visita.'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
