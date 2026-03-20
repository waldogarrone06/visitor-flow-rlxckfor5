import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'

export default function GoogleCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const processed = useRef(false)
  const { loading, session } = useAuth()

  useEffect(() => {
    if (loading) return

    const processCode = async () => {
      if (processed.current) return
      processed.current = true

      const code = searchParams.get('code')
      const state = searchParams.get('state') // This carries the targetUserId
      const error = searchParams.get('error')

      if (error) {
        navigate('/config?error=access_denied', { replace: true })
        return
      }

      if (!code || !state) {
        navigate('/config?error=invalid_request', { replace: true })
        return
      }

      if (!session?.access_token) {
        navigate('/config?error=unauthorized', { replace: true })
        return
      }

      try {
        const redirectUri = window.location.origin + '/auth/callback/google'

        const { data, error: fnError } = await supabase.functions.invoke('google-oauth-exchange', {
          body: { code, redirectUri, targetUserId: state },
        })

        if (fnError || data?.error) {
          console.error('Exchange error:', fnError || data?.error)
          throw new Error(data?.error || fnError?.message || 'Failed to exchange token')
        }

        navigate('/config?success=google_connected', { replace: true })
      } catch (err) {
        console.error('OAuth Exchange Caught Error:', err)
        navigate('/config?error=exchange_failed', { replace: true })
      }
    }

    processCode()
  }, [searchParams, navigate, loading, session])

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
      <h2 className="text-xl font-semibold">Conectando ao Google...</h2>
      <p className="text-muted-foreground mt-2">
        Por favor, aguarde enquanto validamos e integramos sua conta de forma segura.
      </p>
    </div>
  )
}
