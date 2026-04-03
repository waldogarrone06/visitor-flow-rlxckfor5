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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { MessageCircle, Link2 } from 'lucide-react'
import { getIntegrations, saveIntegrations } from '@/services/settings'

export function WhatsAppCard({ targetUserId }: { targetUserId?: string }) {
  const [apiUrl, setApiUrl] = useState('')
  const [sessionId, setSessionId] = useState('FourLab')
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!targetUserId) return
    setLoading(true)
    getIntegrations(targetUserId).then((data) => {
      if (data) {
        setSessionId(data.whatsapp_instance_id || 'FourLab')
        setApiUrl(data.whatsapp_api_token || '')
        setConnected(data.whatsapp_connected || false)
      } else {
        setSessionId('FourLab')
        setApiUrl('')
        setConnected(false)
      }
      setLoading(false)
    })
  }, [targetUserId])

  const handleSave = async () => {
    if (!apiUrl || !sessionId) {
      toast({
        title: 'Aviso',
        description: 'Preencha a URL da API e o Session ID.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      const cleanUrl = apiUrl.replace(/\/$/, '')

      const response = await fetch(`${cleanUrl}/sessions/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {
        throw new Error('Erro de rede ou CORS ao acessar a API.')
      })

      if (response && !response.ok) {
        throw new Error(`Erro na API: ${response.statusText}`)
      }

      await saveIntegrations(
        {
          whatsapp_instance_id: sessionId,
          whatsapp_api_token: cleanUrl,
          whatsapp_connected: true,
        },
        targetUserId,
      )
      setConnected(true)
      toast({ title: 'WhatsApp Conectado', description: 'Sessão iniciada e credenciais salvas!' })
    } catch (error: any) {
      // Salva de qualquer forma pois a API pode ter bloqueio de CORS no navegador
      await saveIntegrations(
        {
          whatsapp_instance_id: sessionId,
          whatsapp_api_token: apiUrl.replace(/\/$/, ''),
          whatsapp_connected: true,
        },
        targetUserId,
      )
      setConnected(true)
      toast({
        title: 'Configuração Salva',
        description:
          'Credenciais salvas. Falha no teste local (CORS/Rede), mas o backend utilizará a configuração.',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    await saveIntegrations(
      {
        whatsapp_instance_id: null,
        whatsapp_api_token: null,
        whatsapp_connected: false,
      },
      targetUserId,
    )
    setApiUrl('')
    setSessionId('FourLab')
    setConnected(false)
    toast({ title: 'WhatsApp Desconectado' })
  }

  if (!targetUserId) return null

  return (
    <Card className="flex flex-col shadow-subtle border-border/50">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="p-3 bg-green-50 text-green-600 rounded-lg mb-2">
            <MessageCircle className="h-6 w-6" />
          </div>
          <Badge
            variant={connected ? 'default' : 'secondary'}
            className={connected ? 'bg-green-600 hover:bg-green-700' : ''}
          >
            {connected ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
        <CardTitle>WhatsApp Custom API</CardTitle>
        <CardDescription>
          Conecte sua API própria independente. Autenticação via Session ID.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-10 bg-muted rounded"></div>
            <div className="h-10 bg-muted rounded"></div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label>URL da API</Label>
              <div className="flex relative">
                <Link2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="http://sua-api.com:3000"
                  className="pl-9"
                  disabled={connected}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Session ID</Label>
              <Input
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="Ex: FourLab"
                disabled={connected}
              />
              <p className="text-xs text-muted-foreground">
                Usado para identificar o cliente em /sessions/start.
              </p>
            </div>
          </>
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
          <Button
            onClick={handleSave}
            className="w-full"
            disabled={loading || !apiUrl || !sessionId}
          >
            Iniciar Sessão
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
