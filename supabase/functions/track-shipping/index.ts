import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

// Remove prefixo LGI- que não faz parte do código de rastreio
const normalizeTracking = (code: string) => code.replace(/^LGI-/i, '').trim()

function checkIfDelivered(trackInfo: any): { delivered: boolean; deliveredAt: string | null } {
  const fallbackDate = new Date().toISOString()

  const extractStatusText = (val: any): string => {
    if (!val) return ''
    if (typeof val === 'string') return val.toLowerCase()
    if (typeof val === 'object') {
      return [val.description, val.status, val.name, val.label]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
    }
    return String(val).toLowerCase()
  }

  const DELIVERED_KEYWORDS = [
    'entregue',
    'delivered',
    'finalizado',
    'recebido',
    'objeto entregue',
    'entregue ao destinatário',
    'entrega realizada',
  ]
  const isDeliveredText = (text: string) => DELIVERED_KEYWORDS.some((kw) => text.includes(kw))

  // Checa status raiz
  const rootStatus = extractStatusText(trackInfo.status)
  if (isDeliveredText(rootStatus)) {
    return {
      delivered: true,
      deliveredAt: trackInfo.delivered_at || trackInfo.updated_at || fallbackDate,
    }
  }

  // Checa array de eventos (suporta events, tracking, steps)
  const events = trackInfo.events || trackInfo.tracking || trackInfo.steps || []
  const eventList = Array.isArray(events) ? events : Object.values(events)

  for (const event of eventList as any[]) {
    const texts = [
      extractStatusText(event.status),
      extractStatusText(event.status_description),
      extractStatusText(event.description),
      extractStatusText(event.detail),
      extractStatusText(event.message),
      extractStatusText(event.label),
    ].join(' ')

    if (isDeliveredText(texts)) {
      const rawDate = event.date || event.created_at || event.happened_at || event.time
      let deliveredAt = fallbackDate
      try {
        if (rawDate) deliveredAt = new Date(rawDate).toISOString()
      } catch (_) {}
      return { delivered: true, deliveredAt }
    }
  }

  return { delivered: false, deliveredAt: null }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let appointmentIdToRefresh: string | null = null
    const isDebug = new URL(req.url).searchParams.get('debug') === 'true'

    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (body?.appointmentId) appointmentIdToRefresh = body.appointmentId
      } catch (_) {}
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Busca appointments com rastreio que ainda não foram entregues
    let query = supabase
      .from('appointments')
      .select('id, user_id, tracking_number, kit_status')
      .not('tracking_number', 'is', null)
      .neq('kit_status', 'Delivered')
      .neq('kit_status', 'Entregue')

    if (appointmentIdToRefresh) {
      query = query.eq('id', appointmentIdToRefresh)
    }

    const { data: appointments, error: appErr } = await query
    if (appErr) throw appErr

    if (!appointments || appointments.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No shipments to track' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const updates: string[] = []
    const debugLog: any[] = []

    for (const app of appointments) {
      const normalizedCode = normalizeTracking(app.tracking_number)

      try {
        // Melhor Rastreio aceita o código de rastreio diretamente, sem autenticação
        const response = await fetch(
          `https://melhorrastreio.com.br/api/v2/trackings/${normalizedCode}`,
          {
            headers: {
              Accept: 'application/json',
              'User-Agent': 'Fourlab Integration',
            },
          },
        )

        if (!response.ok) {
          console.warn(
            `[track-shipping] Melhor Rastreio retornou ${response.status} para ${normalizedCode}`,
          )

          let apiResponse: any = null
          let rawText = ''
          try {
            rawText = await response.text()
            apiResponse = JSON.parse(rawText)
          } catch (e) {
            apiResponse = rawText
          }

          if (isDebug) {
            debugLog.push({
              appointmentId: app.id,
              code: normalizedCode,
              status: response.status,
              errorResponse: apiResponse,
            })
          }

          // Registra erro apenas se não for 404 (código ainda não postado)
          if (response.status !== 404) {
            await supabase.from('interaction_log').insert({
              user_id: app.user_id,
              type: 'tracking_error',
              details: {
                error: `Melhor Rastreio API returned ${response.status}`,
                statusText: response.statusText,
                trackingNumbers: [normalizedCode],
                apiResponse: apiResponse,
                appointment_id: app.id,
              },
            })
          }
          continue
        }

        const trackInfo = await response.json()

        if (isDebug) {
          debugLog.push({ appointmentId: app.id, code: normalizedCode, rawResponse: trackInfo })
        }

        const { delivered, deliveredAt } = checkIfDelivered(trackInfo)

        if (delivered) {
          const { error: updateErr } = await supabase
            .from('appointments')
            .update({
              kit_status: 'Entregue',
              delivered_at: deliveredAt,
            })
            .eq('id', app.id)

          if (updateErr) {
            console.error(
              `[track-shipping] Erro ao atualizar appointment ${app.id}:`,
              updateErr.message,
            )
          } else {
            updates.push(app.id)
            console.log(`[track-shipping] Entregue: appointment ${app.id} (${normalizedCode})`)
          }
        } else {
          console.log(
            `[track-shipping] Em trânsito: ${normalizedCode} — status: ${JSON.stringify(trackInfo.status)}`,
          )
        }
      } catch (e: any) {
        console.error(`[track-shipping] Exceção para ${normalizedCode}:`, e.message)
      }

      // Pequena pausa entre chamadas para não sobrecarregar a API
      await new Promise((r) => setTimeout(r, 300))
    }

    return new Response(
      JSON.stringify({
        success: true,
        updatedCount: updates.length,
        updatedIds: updates,
        ...(isDebug && { debug: debugLog }),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
