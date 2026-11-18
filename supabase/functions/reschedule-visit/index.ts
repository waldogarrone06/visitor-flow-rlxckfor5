// Edge function: reschedule-visit
// Remarca uma visita em aberto por CPF (rota pública /remarcar/:userId).
//
// POST { userId, cpf, date, startTime, endTime }
// 1) Valida CPF/data/hora (BRT);
// 2) RPC visit_eligibility → visita em aberto (action 'reschedule')?
//    - canReschedule === false → 409 limite de remarcações esgotado.
// 3) RPC reschedule_appointment → UPDATE da MESMA linha (nenhuma linha nova);
//    kit/rastreio/cupons intactos. Exceções P0001 do banco viram 400/409/500 em PT.
// Respostas: 200 { ok, appointment } | erro { error, code? }.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { normalizeCpf, isValidCpf } from '../_shared/cpf.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

// Exceções P0001 da RPC reschedule_appointment → mensagem PT + status HTTP.
function mapRpcError(raw: string): { status: number; message: string; code?: string } {
  const msg = (raw || '').trim()
  if (msg.startsWith('RESCHEDULE_LIMIT')) {
    return {
      status: 409,
      code: 'reschedule_limit',
      message: 'Você já alcançou o limite de remarcações. Fale com o seu representante, por favor.',
    }
  }
  if (msg.startsWith('CAPACITY_EXCEEDED')) {
    return {
      status: 409,
      code: 'capacity',
      message: 'Este horário acabou de esgotar. Escolha outro, por favor.',
    }
  }
  if (msg.startsWith('VISIT_CANCELLED')) {
    return {
      status: 409,
      code: 'visit_cancelled',
      message: 'Esta visita foi cancelada e não pode ser remarcada.',
    }
  }
  if (msg.startsWith('VISIT_NOT_FOUND') || msg.startsWith('NOT_A_VISIT')) {
    return {
      status: 409,
      code: 'visit_not_found',
      message: 'Não há visita em aberto para remarcar com este CPF.',
    }
  }
  if (msg.startsWith('CPF_INVALID')) {
    return { status: 400, code: 'cpf_invalid', message: 'CPF inválido. Verifique os 11 dígitos.' }
  }
  return { status: 500, message: 'Não foi possível remarcar a visita. Tente novamente.' }
}

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Método não permitido' })
  }

  try {
    const { userId, cpf, date, startTime, endTime } = await req.json()

    if (!userId || typeof userId !== 'string') {
      return json(400, { error: 'userId é obrigatório' })
    }

    const digits = normalizeCpf(cpf)
    if (!digits || !isValidCpf(digits)) {
      return json(400, { error: 'CPF inválido. Verifique os 11 dígitos.', code: 'cpf_invalid' })
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json(400, { error: 'Data inválida.' })
    }
    if (!HHMM.test(startTime || '') || !HHMM.test(endTime || '')) {
      return json(400, { error: 'Horário inválido (use HH:MM).' })
    }
    if (startTime >= endTime) {
      return json(400, { error: 'O horário de fim deve ser após o início.' })
    }

    // Data passada (BRT = UTC-3), mesma regra do create-booking.
    const todayBrt = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
    if (date < todayBrt) {
      return json(400, { error: 'Não é possível remarcar para uma data passada.' })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1) Elegibilidade atual (state pode ter mudado desde o lookup inicial).
    const { data: eligRaw, error: eligErr } = await admin.rpc('visit_eligibility', {
      p_user_id: userId,
      p_cpf: digits,
    })
    if (eligErr) throw eligErr
    const eligibility = Array.isArray(eligRaw) ? eligRaw[0] : eligRaw

    if (eligibility?.action === 'reschedule' && eligibility.canReschedule === false) {
      return json(409, {
        error: 'Você já alcançou o limite de remarcações. Fale com o seu representante, por favor.',
        code: 'reschedule_limit',
      })
    }
    if (eligibility?.action !== 'reschedule' || !eligibility?.appointment?.id) {
      // Não há visita em aberto (visita cancelada/realizada há <30 dias/CPF inválido).
      const blocked = eligibility?.action === 'blocked'
      const releaseDate = eligibility?.releaseDate ?? null
      return json(409, {
        error:
          blocked && releaseDate
            ? `Este CPF visitou há menos de 30 dias. Uma nova visita pode ser agendada a partir de ${releaseDate}.`
            : 'Não há visita em aberto para remarcar com este CPF.',
        code: blocked ? 'cpf_blocked_30d' : 'no_open_visit',
        releaseDate,
      })
    }

    // 2) UPDATE da MESMA visita. Capacidade (10 por slot completo) e limite de
    //    remarcações são validados pela RPC via exceções P0001.
    const { data: resRaw, error: resErr } = await admin.rpc('reschedule_appointment', {
      p_user_id: userId,
      p_appointment_id: eligibility.appointment.id,
      p_cpf: digits,
      p_new_date: date,
      p_new_start: startTime,
      p_new_end: endTime,
    })
    if (resErr) {
      const mapped = mapRpcError(resErr.message || '')
      console.error('[reschedule-visit] RPC error:', resErr.message)
      return json(mapped.status, {
        error: mapped.message,
        ...(mapped.code ? { code: mapped.code } : {}),
      })
    }

    // Contrato da RPC: { appointment: {...} } direto (sem wrapper {ok}).
    const wrapper = Array.isArray(resRaw) ? resRaw[0] : resRaw
    const appointment = wrapper?.appointment ?? null
    if (!appointment) {
      return json(409, { error: 'Não foi possível remarcar a visita. Tente novamente.' })
    }

    return json(200, {
      ok: true,
      appointment,
      rescheduleCount: appointment.reschedule_count ?? null,
    })
  } catch (e: any) {
    console.error('[reschedule-visit] error:', e?.message || e)
    return json(500, { error: 'Erro interno ao remarcar a visita. Tente novamente.' })
  }
})
