import { useState, useEffect, useCallback } from 'react'
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
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { Calendar } from 'lucide-react'
import { getIntegrations, saveIntegrations } from '@/services/settings'

export function GoogleCalendarCard({ targetUserId }: { targetUserId: string }) {
  const [email, setEmail] = useState('')
  const [connected, setConnected] = useState(false)
  const [syncEnabled, setSyncEnabled] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!targetUserId) return
    setLoading(true)
    try {
      const data = await getIntegrations(targetUserId)
      if (data?.google_access_token) {
        setEmail(data.google_email || 'Conta Integrada')
        setConnected(true)
        setSyncEnabled(data.sync_enabled || false)
      } else {
        setEmail('')
        setConnected(false)
        setSyncEnabled(false)
      }
    } finally {
      setLoading(false)
    }
  }, [targetUserId])

  useEffect(() => {
    loadData()
    const handleUpdate = (e: any) => {
      if (!e.detail || e.detail.userId === targetUserId) loadData()
    }
    window.addEventListener('integrations_updated', handleUpdate)
    return () => window.removeEventListener('integrations_updated', handleUpdate)
  }, [loadData, targetUserId])

  const handleConnect = () => {
    if (!targetUserId) return
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'mock-client-id'
    const redirectUri = window.location.origin + '/auth/callback/google'
    const scope =
      'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email'

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri,
    )}&response_type=code&scope=${encodeURIComponent(
      scope,
    )}&access_type=offline&prompt=consent&state=${targetUserId}`

    window.location.href = authUrl
  }

  const handleDisconnect = async () => {
    await saveIntegrations(
      {
        google_email: null,
        google_access_token: null,
        google_refresh_token: null,
        sync_enabled: false,
      },
      targetUserId,
    )
    toast({
      title: 'Google Calendar Desconectado',
      description: 'Integração removida com sucesso.',
    })
    window.dispatchEvent(
      new CustomEvent('integrations_updated', { detail: { userId: targetUserId } }),
    )
  }

  const handleSyncToggle = async (checked: boolean) => {
    setSyncEnabled(checked)
    await saveIntegrations({ sync_enabled: checked }, targetUserId)
    toast({
      title: checked ? 'Sincronização Ativa' : 'Sincronização Pausada',
      description: 'As configurações de bloqueio automático foram atualizadas.',
    })
  }

  if (!targetUserId) return null

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
        <CardDescription>Sincronize visitas e evite conflitos de horário.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {loading ? (
          <div className="animate-pulse h-10 bg-muted rounded-md w-full"></div>
        ) : connected ? (
          <div className="space-y-4">
            <div className="p-3 bg-muted/40 border border-border/50 rounded-md flex items-center gap-2 overflow-hidden">
              <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium truncate" title={email}>
                <span className="text-muted-foreground font-normal">{email}</span>
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <Label
                className="text-sm text-muted-foreground cursor-pointer"
                htmlFor="sync-calendar"
              >
                Bloquear horários ocupados
              </Label>
              <Switch id="sync-calendar" checked={syncEnabled} onCheckedChange={handleSyncToggle} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Conecte a conta via OAuth para habilitar o bloqueio bidirecional de disponibilidade.
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
