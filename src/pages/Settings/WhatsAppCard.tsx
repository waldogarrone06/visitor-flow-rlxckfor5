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
import { MessageCircle, Link2, Send, Key, Server, Phone, Copy } from 'lucide-react'
import { getIntegrations, saveIntegrations } from '@/services/settings'
import { supabase } from '@/lib/supabase/client'
import { FunctionsHttpError } from '@supabase/supabase-js'

export function WhatsAppCard({ targetUserId }: { targetUserId?: string }) {
  const [apiUrl, setApiUrl] = useState('')
  const [instanceName, setInstanceName] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [testNumber, setTestNumber] = useState('')
  const [connected, setConnected] = useState(false)
  const [connectionState, setConnectionState] = useState<
    'connected' | 'connecting' | 'disconnected' | 'unknown'
  >('unknown')
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)

  const webhookUrl = 'https://zbtaxosxmxoidrtmojfx.supabase.co/functions/v1/whatsapp-webhook'

  useEffect(() => {
    if (!targetUserId) return
    setLoading(true)
    getIntegrations(targetUserId)
      .then((data) => {
        if (data) {
          setApiUrl(data.whatsapp_api_url || '')
          setInstanceName(data.whatsapp_instance_id || '')
          setApiToken(data.whatsapp_api_token || '')
          setConnected(data.whatsapp_connected || false)
          setConnectionState(data.whatsapp_connected ? 'connected' : 'disconnected')
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error('Error fetching integrations:', err)
        setLoading(false)
      })
  }, [targetUserId])

  useEffect(() => {
    if (!instanceName) return

    const fetchLatestStatus = async () => {
      const { data } = await supabase
        .from('whatsapp_events')
        .select('message')
        .eq('instance', instanceName)
        .eq('message_type', 'connection.update')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data && data.message) {
        const payload = data.message as any
        const state = payload?.data?.state || payload?.state
        if (state === 'connecting') setConnectionState('connecting')
        else if (state === 'open') {
          setConnectionState('connected')
          setConnected(true)
        } else if (state === 'close') {
          setConnectionState('disconnected')
          setConnected(false)
        }
      }
    }

    fetchLatestStatus()

    const channel = supabase
      .channel('whatsapp_status_events')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_events',
          filter: `instance=eq.${instanceName}`,
        },
        (payload) => {
          const newEvent = payload.new as any
          if (newEvent.message_type === 'connection.update') {
            const state = newEvent.message?.data?.state || newEvent.message?.state
            if (state === 'connecting') setConnectionState('connecting')
            else if (state === 'open') {
              setConnectionState('connected')
              setConnected(true)
            } else if (state === 'close') {
              setConnectionState('disconnected')
              setConnected(false)
            }
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [instanceName])

  const handleSave = async () => {
    if (!apiUrl || !instanceName || !apiToken) {
      toast({
        title: 'Aviso',
        description: 'Preencha a URL da API, Instância e Token.',
        variant: 'destructive',
      })
      return false
    }

    setLoading(true)
    try {
      const cleanUrl = apiUrl.trim().replace(/\/$/, '')
      const cleanToken = apiToken.trim()
      const cleanInstance = instanceName.trim()

      await saveIntegrations(
        {
          whatsapp_api_url: cleanUrl,
          whatsapp_instance_id: cleanInstance,
          whatsapp_api_token: cleanToken,
          whatsapp_connected: true,
        },
        targetUserId,
      )
      setConnected(true)
      toast({
        title: 'Configuração Salva',
        description: 'Credenciais da Evolution API salvas com sucesso!',
      })
      return true
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      })
      return false
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
    setConnectionState('disconnected')
    toast({ title: 'WhatsApp Desconectado' })
  }

  const handleTestConnection = async () => {
    if (!testNumber) {
      toast({
        title: 'Aviso',
        description: 'Preencha o número para teste.',
        variant: 'destructive',
      })
      return
    }

    setTesting(true)
    try {
      const cleanUrl = apiUrl.trim().replace(/\/$/, '')
      const cleanToken = apiToken.trim()
      const cleanInstance = instanceName.trim()

      const { data, error } = await supabase.functions.invoke('whatsapp-send', {
        body: {
          to: testNumber,
          text: 'Teste de conexão Evolution API v2.2.3 via Visitor Flow!',
          userId: targetUserId,
          testCredentials: {
            apiUrl: cleanUrl,
            instanceId: cleanInstance,
            apiToken: cleanToken,
          },
        },
      })

      if (error && error instanceof FunctionsHttpError) {
        let errorMessage
        try {
          errorMessage = await error.context.json()
        } catch (e) {
          errorMessage = { error: await error.context.text() }
        }
        console.log('Function returned an error', errorMessage)
        throw new Error(`Erro na chamada da função: ${errorMessage?.error || error.message}`)
      } else if (error) {
        console.error('Status:', (error as any).status)
        console.error('Mensagem:', error.message)
        throw new Error(`Erro na chamada da função: ${error.message}`)
      }

      if (data?.error) {
        throw new Error(data.error)
      }

      toast({
        title: 'Mensagem enviada!',
        description: 'Mensagem enviada com sucesso. Verifique seu WhatsApp!',
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

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl)
    toast({
      title: 'Copiado!',
      description: 'URL do Webhook copiada para a área de transferência.',
    })
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
            variant={
              connectionState === 'connected'
                ? 'default'
                : connectionState === 'connecting'
                  ? 'secondary'
                  : 'destructive'
            }
            className={
              connectionState === 'connected'
                ? 'bg-green-600 hover:bg-green-700'
                : connectionState === 'connecting'
                  ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                  : ''
            }
          >
            {connectionState === 'connected'
              ? 'Conectado'
              : connectionState === 'connecting'
                ? 'Conectando...'
                : 'Desconectado'}
          </Badge>
        </div>
        <CardTitle>WhatsApp (Evolution API v2.2.3)</CardTitle>
        <CardDescription>
          Conecte sua instância da Evolution API hospedada no seu servidor VPS para trocar mensagens
          em tempo real.
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
                  placeholder="http://129.121.44.86:8080"
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
                  placeholder="Ex: Wal ou Junior"
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

            <div className="space-y-2 pt-4 border-t">
              <Label>URL do Webhook (Retorno de Dados)</Label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Link2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input readOnly value={webhookUrl} className="pl-9 bg-muted/50 text-xs" />
                </div>
                <Button variant="outline" size="icon" onClick={copyWebhook}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Na Evolution API 2.2.3, configure a integração do tipo <strong>WEBHOOK</strong> (não
                Work Exchange/RabbitMQ) e cole esta URL. Marque os eventos:{' '}
                <code>messages-upsert</code>, <code>messages-update</code> e{' '}
                <code>connection-update</code>.
              </p>
            </div>

            <div className="space-y-2 pt-4 border-t">
              <Label>Número para Teste</Label>
              <div className="flex relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={testNumber}
                  onChange={(e) => setTestNumber(e.target.value)}
                  placeholder="Ex: 5511999999999"
                  className="pl-9"
                  disabled={testing}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Insira o seu número com DDI e DDD para receber a mensagem de teste.
              </p>
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
              disabled={testing || !testNumber}
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
            {apiUrl && instanceName && apiToken && testNumber && (
              <Button
                variant="outline"
                onClick={async () => {
                  const saved = await handleSave()
                  if (saved) await handleTestConnection()
                }}
                disabled={testing || loading}
                className="w-full border-green-600 text-green-600 hover:bg-green-50"
              >
                <Send className="w-4 h-4 mr-2" />
                {testing ? 'Testando...' : 'Salvar e Testar Conexão'}
              </Button>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  )
}
