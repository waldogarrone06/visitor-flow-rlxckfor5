import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let body = {}
    try {
      body = await req.json()
    } catch (e) {
      console.log('Falha ao fazer parse do JSON do request ou body vazio.')
    }

    console.log('RECEBIDO DO VISITOR FLOW:', body)

    console.log('Executando teste direto temporário na VPS conforme solicitado...')

    const r = await fetch('http://129.121.44.86:3000/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'Jr',
        number: '5511980224076',
        message: 'Teste via Supabase direto!',
      }),
    })

    const responseText = await r.text().catch(() => '')
    console.log('VPS Response status:', r.status, 'text:', responseText)

    if (!r.ok) {
      throw new Error(`Falha na API externa (${r.status}): ${responseText}`)
    }

    let parsedResult
    try {
      parsedResult = JSON.parse(responseText)
    } catch (e) {
      parsedResult = { rawText: responseText }
    }

    return new Response(JSON.stringify({ success: true, result: parsedResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
