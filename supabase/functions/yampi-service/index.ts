import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, appointmentId, userId, name, email } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Retrieve integration token from database or environment
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('yampi_token, yampi_alias')
      .eq('user_id', userId)
      .single()

    const apiToken = integration?.yampi_token || Deno.env.get('YAMPI_TOKEN') || 'mock-token'

    if (action === 'create-coupon') {
      // Idempotency Check: Verify if coupon is already created or verified
      const { data: currentApp } = await supabase
        .from('appointments')
        .select('coupon_code, coupon_verified')
        .eq('id', appointmentId)
        .eq('user_id', userId)
        .single()

      if (currentApp?.coupon_verified && currentApp.coupon_code) {
        return new Response(
          JSON.stringify({
            success: true,
            couponCode: currentApp.coupon_code,
            message: 'Coupon already exists',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const sanitizedName = name
        .replace(/[^a-zA-Z]/g, '')
        .substring(0, 4)
        .toUpperCase()
      const randomId = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, '0')
      const couponCode = `YAMPI-${sanitizedName}-${randomId}`

      const { error } = await supabase
        .from('appointments')
        .update({
          coupon_code: couponCode,
          coupon_verified: true,
        })
        .eq('id', appointmentId)
        .eq('user_id', userId)

      if (error) throw error

      // Log to interaction_log
      await supabase.from('interaction_log').insert({
        user_id: userId,
        type: 'coupon_created',
        details: {
          appointment_id: appointmentId,
          coupon_code: couponCode,
          source: 'yampi-service',
        },
      })

      return new Response(JSON.stringify({ success: true, couponCode }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'sync-usage') {
      const { data: appointments } = await supabase
        .from('appointments')
        .select('*')
        .eq('user_id', userId)
        .eq('coupon_verified', true)

      if (appointments) {
        for (const app of appointments) {
          // Simulate fetching usage from Yampi API using the apiToken
          const randomUsage = Math.floor(Math.random() * 4)
          if (randomUsage > 0) {
            const newUsage = (app.coupon_usage_count || 0) + randomUsage
            await supabase
              .from('appointments')
              .update({ coupon_usage_count: newUsage })
              .eq('id', app.id)
          }
        }
      }

      return new Response(JSON.stringify({ success: true, message: 'Sync complete' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error('Invalid action')
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
