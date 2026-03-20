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
import { MessageCircle } from 'lucide-react'
import { getIntegrations, saveIntegrations } from '@/services/settings'

export function WhatsAppCard({ targetUserId }: { targetUserId?: string }) {
  const [instanceId, setInstanceId] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!targetUserId) return
    setLoading(true)
    getIntegrations(targetUserId).then((data) => {
      if (data) {
        setInstanceId(data.whatsapp_instance_id || '')
        setApiToken(data.whatsapp_api_token || '')
        setConnected(data.whatsapp_connected || false)
      } else {
        setInstanceId('')
        setApiToken('')
        setConnected(false)
      }
      setLoading(false)
    })
  }, [targetUserId])

  const handleSave = async () => {
    if (!instanceId || !apiToken) {
      toast({
        title: 'Aviso',
        description: 'Preencha os campos para conectar.',
        variant: 'destructive',
      })
      return
    }
    await saveIntegrations(
      {
        whatsapp_instance_id: instanceId,
        whatsapp_api_token: apiToken,
        whatsapp_connected: true,
      },
      targetUserId,
    )
    setConnected(true)
    toast({ title: 'WhatsApp Conectado', description: 'Credenciais salvas com sucesso.' })
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
    setInstanceId('')
    setApiToken('')
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
        <CardTitle>WhatsApp Individual</CardTitle>
        <CardDescription>Vincule seu número pessoal ou corporativo via API.</CardDescription>
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
              <Label>Instance ID</Label>
              <Input
                value={instanceId}
                onChange={(e) => setInstanceId(e.target.value)}
                placeholder="Ex: id_12345"
                disabled={connected}
              />
            </div>
            <div className="space-y-2">
              <Label>API Token</Label>
              <Input
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Seu token de acesso seguro"
                type="password"
                disabled={connected}
              />
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
            disabled={loading || !instanceId || !apiToken}
          >
            Salvar e Conectar
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
