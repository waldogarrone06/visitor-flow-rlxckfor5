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

  useEffect(() => {
    getIntegrations().then((data) => {
      if (data?.google_email) {
        setEmail(data.google_email)
        setConnected(true)
      }
      setLoading(false)
    })
  }, [])

  const handleConnect = async () => {
    // In a real app, this redirects to Google OAuth
    const fakeEmail = prompt('Simulação de Integração. Digite a conta Google que deseja conectar:')
    if (fakeEmail) {
      await saveIntegrations({ google_email: fakeEmail, google_access_token: 'mock_token' })
      setEmail(fakeEmail)
      setConnected(true)
      toast({
        title: 'Google Calendar Conectado',
        description: 'Seus eventos agora serão sincronizados com a agenda.',
      })
    }
  }

  const handleDisconnect = async () => {
    await saveIntegrations({ google_email: null, google_access_token: null })
    setEmail('')
    setConnected(false)
    toast({
      title: 'Google Calendar Desconectado',
      description: 'Integração removida com sucesso.',
    })
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
        <CardTitle>Google Calendar Pessoal</CardTitle>
        <CardDescription>Sincronize visitas automaticamente na sua própria agenda.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {loading ? (
          <div className="animate-pulse h-10 bg-muted rounded-md w-full"></div>
        ) : connected ? (
          <div className="p-3 bg-muted/40 border border-border/50 rounded-md flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              Conta: <span className="text-muted-foreground font-normal">{email}</span>
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Conecte seu calendário individual para evitar conflitos e receber lembretes diretamente
            no seu celular.
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
            Conectar Google Calendar
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
