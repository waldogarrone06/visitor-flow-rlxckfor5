import { useState, useEffect } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { Calendar } from 'lucide-react'
import { getIntegrations, saveIntegrations } from '@/services/settings'

export function GoogleCalendarCard() {
  const [email, setEmail] = useState('')
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    try {
      const data = await getIntegrations()
      if (data?.google_email) {
        setEmail(data.google_email)
        setConnected(true)
      } else {
        setEmail('')
        setConnected(false)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    window.addEventListener('integrations_updated', loadData)
    return () => window.removeEventListener('integrations_updated', loadData)
  }, [])

  const handleConnect = () => {
    const clientId = localStorage.getItem('GOOGLE_CLIENT_ID') || 'mock-client-id'
    const redirectUri = window.location.origin + '/config'
    const scope =
      'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events'

    if (clientId === 'mock-client-id') {
      // Simulate OAuth redirect when running without a real client ID
      window.location.href = `${redirectUri}?code=mock_auth_code_calendar_12345`
    } else {
      // Real OAuth flow
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
        redirectUri,
      )}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`
      window.location.href = authUrl
    }
  }

  const handleDisconnect = async () => {
    await saveIntegrations({
      google_email: null,
      google_access_token: null,
      google_refresh_token: null,
    })
    toast({
      title: 'Google Calendar Desconectado',
      description: 'Integração removida com sucesso.',
    })
    window.dispatchEvent(new Event('integrations_updated'))
  }

  return (
    <Card className="flex flex-col shadow-subtle border-border/50">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg mb-2">
            <Calendar className="h-6 w-6" />
          </div>
          <Badge
            variant={connected ? 'default' : 'secondary'}
            className={connected ? 'bg-green-600 hover:bg-green-700' : ''}
          >
            {connected ? 'Conectado' : 'Desconectado'}
          </Badge>
        </div>
        <CardTitle>Google Calendar</CardTitle>
        <CardDescription>Sincronize visitas automaticamente na sua própria agenda.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {loading ? (
          <div className="animate-pulse h-10 bg-muted rounded-md w-full"></div>
        ) : connected ? (
          <div className="p-3 bg-muted/40 border border-border/50 rounded-md flex items-center gap-2 overflow-hidden">
            <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium truncate">
              <span className="text-muted-foreground font-normal">{email}</span>
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Conecte sua conta via OAuth 2.0 para evitar conflitos de horários e receber lembretes.
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {connected ? (
          <Button
            variant="outline"
            onClick={handleDisconnect}
            className="w-full text-destructive hover:bg-destructive/10"
          >
            Desconectar Conta
          </Button>
        ) : (
          <Button onClick={handleConnect} className="w-full" disabled={loading}>
            Conectar Google
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
