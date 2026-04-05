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
import { MessageCircle, Link2, Send, Key, Server } from 'lucide-react'
import { getIntegrations, saveIntegrations } from '@/services/settings'
import { supabase } from '@/lib/supabase/client'

export function WhatsAppCard({ targetUserId }: { targetUserId?: string }) {
  const [apiUrl, setApiUrl] = useState('')
  const [instanceName, setInstanceName] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (!targetUserId) return
    setLoading(true)
    getIntegrations(targetUserId).then((data) => {
      if (data) {
        setApiUrl(data.whatsapp_api_url || '')
        setInstanceName(data.whatsapp_instance_id || '')
        setApiToken(data.whatsapp_api_token || '')
        setConnected(data.whatsapp_connected || false)
      }
      setLoading(false)
    })
  }, [targetUserId])

  const handleSave = async () => {
    if (!apiUrl || !instanceName || !apiToken) {
      toast({
        title: 'Aviso',
        description: 'Preencha a URL da API, Instância e Token.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      const cleanUrl = apiUrl.replace(/\/$/, '')

      await saveIntegrations(
        {
          whatsapp_api_url: cleanUrl,
          whatsapp_instance_id: instanceName,
          whatsapp_api_token: apiToken,
          whatsapp_connected: true,
        },
        targetUserId,
      )
      setConnected(true)
      toast({
        title: 'Configuração Salva',
        description: 'Credenciais da Evolution API salvas com sucesso!',
      })
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    await saveIntegrations(
      {
        whatsapp_api_url: null,
        whatsapp_instance_id: null,
        whatsapp_api_token: null,
        whatsapp_connected: false,
      },
      targetUserId,
    )
    setApiUrl('')
    setInstanceName('')
    setApiToken('')
    setConnected(false)
    toast({ title: 'WhatsApp Desconectado' })
  }

  const handleTestConnection = async () => {
    setTesting(true)
    try {
      const cleanUrl = apiUrl.replace(/\/$/, '')
      let instanceReady = false

      try {
        const response = await fetch(`${cleanUrl}/instance/connectionState/${instanceName}`, {
          method: 'GET',
          headers: {
            apikey: apiToken,
            Authorization: `Bearer ${apiToken}`,
          },
        })
        if (response.ok) {
          const data = await response.json()
          if (data?.instance?.state === 'open' || data?.state === 'open') {
            instanceReady = true
          }
        }
      } catch (err) {
        console.warn(
          'Não foi possível checar o estado da instância diretamente (CORS/Rede), testando envio de mensagem...',
          err,
        )
      }

      const { data, error } = await supabase.functions.invoke('whatsapp-send', {
        body: {
          to: '5511980224076', // Mock ou próprio número de teste
          text: 'Teste de conexão Evolution API via Visitor Flow!',
          userId: targetUserId,
        },
      })

      if (error) {
        throw new Error(`Erro de conexão: ${error.message}`)
      }

      if (data?.error) {
        throw new Error(data.error)
      }

      toast({
        title: 'Mensagem enviada!',
        description: instanceReady
          ? 'Instância conectada (Evolution API) e mensagem enviada.'
          : 'Mensagem enviada com sucesso.',
      })
    } catch (error: any) {
      console.error('Erro na chamada do WhatsApp:', error)
      toast({
        title: 'Falha no teste',
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setTesting(false)
    }
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
        <CardTitle>WhatsApp (Evolution API)</CardTitle>
        <CardDescription>
          Conecte sua instância da Evolution API hospedada no seu servidor VPS.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-10 bg-muted rounded"></div>
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
                  placeholder="http://seu-ip-vps:8080"
                  className="pl-9"
                  disabled={connected}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nome da Instância</Label>
              <div className="flex relative">
                <Server className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  placeholder="Ex: MyInstance"
                  className="pl-9"
                  disabled={connected}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Global API Key / Token</Label>
              <div className="flex relative">
                <Key className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="Seu token de autenticação"
                  type="password"
                  className="pl-9"
                  disabled={connected}
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        {connected ? (
          <div className="flex w-full gap-2">
            <Button
              variant="default"
              onClick={handleTestConnection}
              disabled={testing}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              <Send className="w-4 h-4 mr-2" />
              {testing ? 'Testando...' : 'Testar Conexão'}
            </Button>
            <Button
              variant="outline"
              onClick={handleDisconnect}
              className="flex-1 text-destructive hover:bg-destructive/10"
            >
              Desconectar
            </Button>
          </div>
        ) : (
          <div className="flex flex-col w-full gap-2">
            <Button
              onClick={handleSave}
              className="w-full"
              disabled={loading || !apiUrl || !instanceName || !apiToken}
            >
              Salvar Configuração
            </Button>
            {apiUrl && instanceName && apiToken && (
              <Button
                variant="outline"
                onClick={async () => {
                  await handleSave()
                  await handleTestConnection()
                }}
                disabled={testing || loading}
                className="w-full border-green-600 text-green-600 hover:bg-green-50"
              >
                <Send className="w-4 h-4 mr-2" />
                {testing ? 'Testando...' : 'Testar Conexão WhatsApp'}
              </Button>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  )
}
