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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { Video, Save } from 'lucide-react'
import { getIntegrations, saveIntegrations } from '@/services/settings'

export function GoogleMeetCard({ targetUserId }: { targetUserId: string }) {
  const [email, setEmail] = useState('')
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [bodyText, setBodyText] = useState('')
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    if (!targetUserId) return
    setLoading(true)
    try {
      const data = await getIntegrations(targetUserId)
      if (data?.google_email) {
        setEmail(data.google_email)
        setConnected(true)
        setBodyText(data.google_invitation_body || '')
      } else {
        setEmail('')
        setConnected(false)
        setBodyText('')
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
    const clientId = localStorage.getItem('GOOGLE_CLIENT_ID') || 'mock-client-id'
    const redirectUri = window.location.origin + '/config'
    const scope =
      'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events'

    if (clientId === 'mock-client-id') {
      window.location.href = `${redirectUri}?code=mock_auth_code_meet&state=${targetUserId}`
    } else {
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
        redirectUri,
      )}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${targetUserId}`
      window.location.href = authUrl
    }
  }

  const handleSaveBody = async () => {
    setSaving(true)
    await saveIntegrations({ google_invitation_body: bodyText }, targetUserId)
    setSaving(false)
    toast({ title: 'Template Salvo', description: 'O corpo do convite foi atualizado.' })
  }

  if (!targetUserId) return null

  return (
    <Card className="flex flex-col shadow-subtle border-border/50">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="p-3 bg-teal-50 text-teal-600 rounded-lg mb-2">
            <Video className="h-6 w-6" />
          </div>
          <Badge
            variant={connected ? 'default' : 'secondary'}
            className={connected ? 'bg-green-600 hover:bg-green-700' : ''}
          >
            {connected ? 'Conectado' : 'Desconectado'}
          </Badge>
        </div>
        <CardTitle>Google Meet</CardTitle>
        <CardDescription>Gere links de reunião únicos para agendamentos.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {loading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-10 bg-muted rounded-md w-full"></div>
            <div className="h-24 bg-muted rounded-md w-full mt-4"></div>
          </div>
        ) : connected ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Template do Convite (Corpo do Evento)</Label>
              <Textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Olá! Segue o link para nossa reunião virtual..."
                className="resize-none h-24 text-sm"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSaveBody}
                disabled={saving}
                className="w-full gap-2 mt-2"
              >
                <Save className="h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar Template'}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Conecte a conta para gerar salas automaticamente e definir templates personalizados de
            convite.
          </p>
        )}
      </CardContent>
      {!connected && (
        <CardFooter className="flex flex-wrap gap-2">
          <Button onClick={handleConnect} className="w-full" disabled={loading}>
            Conectar Google
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
