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
import { Video, Save, Loader2 } from 'lucide-react'
import { getIntegrations, saveIntegrations } from '@/services/settings'
import { supabase } from '@/lib/supabase/client'

export function GoogleMeetCard({ targetUserId }: { targetUserId: string }) {
  const [connected, setConnected] = useState(false)
  const [isMock, setIsMock] = useState(false)
  const [loading, setLoading] = useState(true)
  const [bodyText, setBodyText] = useState('')
  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState(false)

  const loadData = useCallback(async () => {
    if (!targetUserId) return
    setLoading(true)
    try {
      const data = await getIntegrations(targetUserId)
      if (data?.google_access_token) {
        setConnected(true)
        setIsMock(data.google_email?.includes('demo.integration') || false)
        setBodyText(data.google_invitation_body || '')
      } else {
        setConnected(false)
        setIsMock(false)
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

  const handleConnect = async () => {
    if (!targetUserId) return
    setConnecting(true)

    try {
      const redirectUri = window.location.origin + '/auth/callback/google'

      const { data, error } = await supabase.functions.invoke('google-oauth-url', {
        body: { redirectUri, targetUserId },
      })

      if (error || data?.error) {
        toast({
          title: 'Erro de Configuração',
          description: data?.error || error?.message || 'Falha ao gerar URL de login do Google.',
          variant: 'destructive',
        })
        setConnecting(false)
        return
      }

      if (data?.mock || !data?.url) {
        toast({
          title: 'Modo de Demonstração',
          description:
            'Client ID não configurado no backend. Redirecionando com credenciais de teste...',
        })
        setTimeout(() => {
          window.location.href = `${redirectUri}?code=mock_code_${Date.now()}&state=${targetUserId}`
        }, 1500)
        return
      }

      window.location.href = data.url
    } catch (err: any) {
      toast({
        title: 'Erro de Conexão',
        description: 'Não foi possível iniciar a conexão com o Google.',
        variant: 'destructive',
      })
      setConnecting(false)
    }
  }

  const handleMockConnect = async () => {
    if (!targetUserId) return
    setConnecting(true)
    const redirectUri = window.location.origin + '/auth/callback/google'
    toast({
      title: 'Modo de Simulação',
      description: 'Simulando retorno do Google para contornar bloqueios (Erro 403)...',
    })
    setTimeout(() => {
      window.location.href = `${redirectUri}?code=mock_code_${Date.now()}&state=${targetUserId}`
    }, 1500)
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
          <div className="flex gap-2">
            {isMock && (
              <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">
                Simulação
              </Badge>
            )}
            <Badge
              variant={connected ? 'default' : 'secondary'}
              className={connected ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {connected ? 'Conectado' : 'Desconectado'}
            </Badge>
          </div>
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
            A conexão é compartilhada com o Google Calendar. Conecte sua conta para habilitar a
            geração de salas.
          </p>
        )}
      </CardContent>
      {!connected && (
        <CardFooter className="flex flex-col gap-2">
          <Button onClick={handleConnect} className="w-full gap-2" disabled={loading || connecting}>
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {connecting ? 'Conectando...' : 'Conectar Google'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMockConnect}
            className="w-full text-xs text-muted-foreground hover:text-primary"
            disabled={loading || connecting}
          >
            Simular Conexão (Bypass Erro 403)
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
