import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { cpfDigits, isValidCpf } from '../_shared/cpf.ts'
import { checkRateLimits, getClientIp, bucketFor } from '../_shared/rate-limit.ts'
import {
  validateGoogleSlot,
  GoogleBusyError,
  isValidDateFormat,
  isValidTimeFormat,
} from '../_shared/slot-validation.ts'

// reschedule-visit — remarca uma visita existente (UPDATE) por CPF.
// Fluxo:
//  1) eligibility: futura em aberto ou passada não realizada → remarca a MESMA
//     linha (RPC reschedule_appointment, UPDATE — kit/tracking/cupons intactos).
//     <30 dias desde a última visita → bloqueado (a RPC devolve released_at).
//  2) Valida o novo slot com as MESMAS regras do create-booking (agenda do dia,
//     bloqueios, passado BRT, Google Calendar fail-closed).
//  3) Advisory lock por CPF dentro da RPC → chamadas simultâneas não criam
//     duas visitas (é UPDATE de linha existente; a nova visita quando liberada
//     passa por create-booking → book_appointment_guarded).
const LIMIT_PER_MIN = 10

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

    const { userId, cpf, appointmentDate, startTime, endTime } = await req.json().catch(() => ({}))

    if (!userId || !cpf || !appointmentDate || !startTime) {
      return json(400, { error: 'userId, cpf, appointmentDate e startTime são obrigatórios.' })
    }
    if (!isValidDateFormat(appointmentDate) || !isValidTimeFormat(startTime)) {
      return json(400, { error: 'Data ou horário em formato inválido.' })
    }
    if (!isValidCpf(cpf)) return json(400, { error: 'CPF inválido. Verifique os dígitos.' })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    )

    const [perMinute] = await checkRateLimits(supabase, [
      {
        bucket: bucketFor('reschedule-visit', getClientIp(req)),
        max: LIMIT_PER_MIN,
        windowSeconds: 60,
      },
    ])
    if (!perMinute.ok) return json(429, { error: 'Muitas tentativas. Aguarde um instante.' })

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle()
    if (!profile) return json(404, { error: 'Representante não encontrado.' })

    // --- Validação do novo slot (idêntica ao create-booking) ------------------
    const { data: slotInfo } = await supabase.rpc('visit_slot_available', {
      p_user_id: userId,
      p_date: appointmentDate,
      p_start_time: startTime,
      p_end_time: endTime || startTime,
    })
    if (slotInfo && slotInfo.available === false) {
      return json(409, { error: slotInfo.error || 'Este horário não está disponível.' })
    }

    // Google Calendar fail-closed (mesma regra do create-booking: 422 ocupado,
    // 503 falha de infraestrutura).
    try {
      const googleCheck = await validateGoogleSlot(
        supabase,
        userId,
        appointmentDate,
        startTime,
        endTime || startTime,
      )
      if (googleCheck && !googleCheck.ok) {
        return json(503, {
          error: 'Não foi possível confirmar a agenda agora. Tente novamente em instantes.',
        })
      }
    } catch (e: any) {
      if (e instanceof GoogleBusyError) return json(422, { error: e.message })
      throw e
    }

    // --- Remarcação (UPDATE atômico) ------------------------------------------
    const { data, error } = await supabase.rpc('reschedule_appointment', {
      p_user_id: userId,
      p_cpf: cpfDigits(cpf),
      p_appointment_date: appointmentDate,
      p_start_time: startTime,
      p_end_time: endTime || startTime,
      p_max_reschedules: 4,
    })

    if (error) {
      const msg = error.message || ''
      if (msg.includes('RESCHEDULE_LIMIT')) {
        return json(409, {
          error: 'Esta visita já atingiu o limite de remarcações. Fale com o representante.',
          code: 'reschedule_limit',
        })
      }
      if (msg.includes('ELIGIBILITY_CHANGED')) {
        return json(409, {
          error: 'A situação desta visita mudou. Consulte o CPF novamente.',
          code: 'eligibility_changed',
        })
      }
      console.error('[reschedule-visit] rpc reschedule_appointment:', msg)
      return json(500, { error: 'Falha ao remarcar a visita. Tente novamente.' })
    }

    // Notificações (best-effort — falha aqui NÃO desfaz a remarcação)
    if (data?.appointment) {
      try {
        const a = data.appointment
        const formattedDate = String(a.appointment_date).split('-').reverse().join('/')
        if (a.client_email) {
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              to: a.client_email,
              subject: 'Reagendamento Confirmado - FourLab Nutrition',
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #eaeaea;border-radius:8px;"><div style="background:#e10050;padding:24px;text-align:center;"><h1 style="color:#fff;margin:0;">Visita Remarcada ✅</h1></div><div style="padding:32px;"><p>Olá <strong>${a.client_name || ''}</strong>,</p><p>Sua visita foi remarcada para o dia <strong>${formattedDate}</strong> às <strong>${a.start_time}</strong>.</p><p style="color:#666;font-size:14px;">Atenciosamente,<br/>Equipe FourLab Nutrition</p></div></div>`,
              senderName: 'FourLab Nutrition',
            }),
          })
        }
        const { data: waIntegration } = await supabase
          .from('user_integrations')
          .select('whatsapp_connected')
          .eq('user_id', userId)
          .maybeSingle()
        if (waIntegration?.whatsapp_connected && a.client_phone) {
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              to: a.client_phone,
              text: `Olá${a.client_name ? `, ${a.client_name}` : ''}! 👋\n\nSua visita na FourLab Nutrition foi remarcada para o dia ${formattedDate} às ${a.start_time}.\n\nAté logo! 😊\n*Equipe FourLab*`,
              userId,
            }),
          })
        }
      } catch (e: any) {
        // E-mail pode falhar 400 (domínio Resend ainda não verificado) — não é
        // falha da remarcação. WhatsApp/E-mail são best-effort por design.
        console.error('[reschedule-visit] notificações best-effort:', e?.message || e)
      }
    }

    return json(200, data)
  } catch (error: any) {
    console.error('[reschedule-visit] Error:', error?.message || error)
    return json(500, { error: 'Erro inesperado.' })
  }
})
