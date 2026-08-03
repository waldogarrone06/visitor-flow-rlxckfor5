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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { toast } from '@/hooks/use-toast'
import {
  MessageCircle,
  Link2,
  Send,
  Key,
  Server,
  Phone,
  Copy,
  ShieldCheck,
  Zap,
  AlertTriangle,
} from 'lucide-react'
import { getIntegrations, saveIntegrations } from '@/services/settings'
import { supabase } from '@/lib/supabase/client'
import { FunctionsHttpError } from '@supabase/supabase-js'
import {
  WhatsAppTemplateSelector,
  type SelectedTemplate,
} from '@/components/whatsapp-template-selector'

const DEFAULT_VERIFY_TOKEN = 'vf_wh_2026_k9Xm2pQ7nR4tZ'
const WEBHOOK_URL = 'https://zbtaxosxmxoidrtmojfx.supabase.co/functions/v1/meta-webhook'

export function WhatsAppCard({ targetUserId }: { targetUserId?: string }) {
  const [providerType, setProviderType] = useState<'official' | 'evolution'>('evolution')

  const [officialPhoneId, setOfficialPhoneId] = useState('')
  const [officialWabaId, setOfficialWabaId] = useState('')
  const [officialToken, setOfficialToken] = useState('')
  const [hasOfficialToken, setHasOfficialToken] = useState(false)
  const [savedAccessToken, setSavedAccessToken] = useState('')
  const [officialVerifyToken, setOfficialVerifyToken] = useState(DEFAULT_VERIFY_TOKEN)

  const [apiUrl, setApiUrl] = useState('')
  const [instanceName, setInstanceName] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [hasApiToken, setHasApiToken] = useState(false)

  const [testNumber, setTestNumber] = useState('')
  const [testMode, setTestMode] = useState<'template' | 'freetext'>('template')
  const [freeText, setFreeText] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<SelectedTemplate | null>(null)
  const [connected, setConnected] = useState(false)
  const [connectionState, setConnectionState] = useState<
    'connected' | 'connecting' | 'disconnected' | 'unknown'
  >('unknown')
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [templateRefetchTrigger, setTemplateRefetchTrigger] = useState(0)

  useEffect(() => {
    if (!targetUserId) return
    setLoading(true)
    getIntegrations(targetUserId)
      .then((data) => {
        if (data) {
          const pType = (data.primary_provider || data.whatsapp_provider_type || 'evolution') as
            | 'official'
            | 'evolution'
          setProviderType(pType)
          setOfficialPhoneId(data.whatsapp_official_phone_number_id || '')
          setOfficialWabaId(data.whatsapp_official_waba_id || '')
          setHasOfficialToken(
            !!(data as any).whatsapp_official_configured ||
              !!(data as any)._has_official_access_token,
          )
          setSavedAccessToken('')
          setOfficialToken('')
          setOfficialVerifyToken(data.whatsapp_official_verify_token || DEFAULT_VERIFY_TOKEN)
          setApiUrl(data.whatsapp_api_url || '')
          setInstanceName(data.whatsapp_instance_id || '')
          setHasApiToken(!!(data as any).whatsapp_api_configured)
          setApiToken('')
          setConnected(data.whatsapp_connected || false)
          setConnectionState(data.whatsapp_connected ? 'connected' : 'disconnected')
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [targetUserId])

  useEffect(() => {
    if (!instanceName || providerType !== 'evolution') return

    const fetchLatestStatus = async () => {
      const { data } = await supabase
        .from('whatsapp_events')
        .select('message')
        .eq('instance', instanceName)
        .eq('message_type', 'connection.update')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data?.message) {
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
  }, [instanceName, providerType])

  const isOfficialConnected = !!(officialPhoneId && hasOfficialToken)
  const isEvolutionConnected = connected
  const isProviderConnected =
    providerType === 'official' ? isOfficialConnected : isEvolutionConnected

  const statusBadge =
    providerType === 'official'
      ? isOfficialConnected
        ? 'connected'
        : 'disconnected'
      : connectionState

  const handleSave = async () => {
    setLoading(true)
    try {
      if (providerType === 'evolution') {
        if (!apiUrl || !instanceName || !apiToken) {
          toast({
            title: 'Aviso',
            description: 'Preencha URL da API, Instância e Token.',
            variant: 'destructive',
          })
          return false
        }
        let cleanUrl = apiUrl
          .trim()
          .replace(/^(POST|GET|PUT|DELETE)\s+/i, '')
          .replace(/\/$/, '')
        if (cleanUrl.includes('/message/sendText'))
          cleanUrl = cleanUrl.split('/message/sendText')[0]
        await saveIntegrations(
          {
            primary_provider: 'evolution',
            whatsapp_provider_type: 'evolution',
            whatsapp_api_url: cleanUrl,
            whatsapp_instance_id: instanceName.trim(),
            whatsapp_connected: true,
          },
          targetUserId,
        )
        if (apiToken.trim()) {
          const { error: secretError } = await supabase.functions.invoke(
            'save-integration-secret',
            {
              body: {
                userId: targetUserId,
                credentialKey: 'whatsapp_api_token',
                credentialValue: apiToken.trim(),
              },
            },
          )
          if (secretError) throw new Error('Falha ao salvar token seguro')
          setHasApiToken(true)
          setApiToken('')
        }
        setConnected(true)
      } else {
        if (!officialPhoneId) {
          toast({
            title: 'Aviso',
            description: 'Preencha o Phone Number ID.',
            variant: 'destructive',
          })
          return false
        }
        const updates: Record<string, any> = {
          primary_provider: 'official',
          whatsapp_provider_type: 'official',
          whatsapp_official_phone_number_id: officialPhoneId.trim(),
          whatsapp_official_waba_id: officialWabaId.trim(),
          whatsapp_official_verify_token: officialVerifyToken.trim() || DEFAULT_VERIFY_TOKEN,
          whatsapp_connected: true,
        }
        await saveIntegrations(updates, targetUserId)

        if (officialToken.trim()) {
          const { error: secretError } = await supabase.functions.invoke(
            'save-integration-secret',
            {
              body: { userId: targetUserId, accessToken: officialToken.trim() },
            },
          )
          if (secretError) throw new Error('Falha ao salvar token seguro')
          setOfficialToken('')
        }

        const refreshedData = await getIntegrations(targetUserId)
        if (refreshedData) {
          setHasOfficialToken(
            !!(refreshedData as any).whatsapp_official_configured ||
              !!(refreshedData as any)._has_official_access_token,
          )
          setSavedAccessToken('')
          setOfficialToken('')
        } else {
          setHasOfficialToken(true)
          setSavedAccessToken('')
        }
        setConnected(true)
        setTemplateRefetchTrigger((prev) => prev + 1)
      }
      toast({ title: 'Configuração Salva', description: 'Credenciais salvas com sucesso!' })
      return true
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: error?.message || 'Falha ao salvar.',
        variant: 'destructive',
      })
      return false
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    if (providerType === 'evolution') {
      await saveIntegrations(
        {
          whatsapp_api_url: null,
          whatsapp_instance_id: null,
          whatsapp_connected: false,
        },
        targetUserId,
      )
      await supabase.functions
        .invoke('save-integration-secret', {
          body: { userId: targetUserId, credentialKey: 'whatsapp_api_token', clear: true },
        })
        .catch(() => {})
      setApiUrl('')
      setInstanceName('')
      setApiToken('')
      setHasApiToken(false)
      setConnected(false)
      setConnectionState('disconnected')
    } else {
      await saveIntegrations(
        {
          whatsapp_official_phone_number_id: null,
          whatsapp_official_waba_id: null,
          whatsapp_official_configured: false,
          whatsapp_connected: false,
        },
        targetUserId,
      )
      await supabase.functions
        .invoke('save-integration-secret', {
          body: { userId: targetUserId, clear: true },
        })
        .catch(() => {})
      setOfficialPhoneId('')
      setOfficialWabaId('')
      setHasOfficialToken(false)
      setOfficialToken('')
      setSavedAccessToken('')
      setConnected(false)
      setTemplateRefetchTrigger((prev) => prev + 1)
    }
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

    if (testMode === 'template' && providerType === 'official' && !selectedTemplate) {
      toast({ title: 'Aviso', description: 'Selecione um template.', variant: 'destructive' })
      return
    }

    setTesting(true)
    try {
      const testCredentials: any = { providerType: providerType || 'evolution' }
      if (providerType === 'official') {
        testCredentials.officialPhoneNumberId = officialPhoneId.trim()
        testCredentials.officialWabaId = officialWabaId.trim()
      } else {
        let cleanUrl = apiUrl
          .trim()
          .replace(/^(POST|GET|PUT|DELETE)\s+/i, '')
          .replace(/\/$/, '')
        if (cleanUrl.includes('/message/sendText'))
          cleanUrl = cleanUrl.split('/message/sendText')[0]
        testCredentials.apiUrl = cleanUrl
        testCredentials.instanceId = instanceName.trim()
        testCredentials.apiToken = apiToken.trim()
      }

      const useTemplate = providerType === 'official' && testMode === 'template'

      const { data, error } = await supabase.functions.invoke('whatsapp-send', {
        body: {
          to: testNumber,
          text: freeText || 'Testando envio via WhatsApp',
          userId: targetUserId,
          testCredentials,
          isTemplate: useTemplate,
          templateName: useTemplate ? selectedTemplate?.name : undefined,
          templateLanguage: useTemplate ? selectedTemplate?.language : undefined,
          parameterFormat: useTemplate ? selectedTemplate?.parameter_format : undefined,
          parameters: useTemplate
            ? selectedTemplate?.parameters?.map((p) => ({
                type: 'text',
                text: p.value,
                parameter_name: p.name,
              }))
            : undefined,
        },
      })

      if (error && error instanceof FunctionsHttpError) {
        let errorMessage
        try {
          errorMessage = await error.context.json()
        } catch {
          errorMessage = { error: await error.context.text() }
        }
        throw new Error(`Erro na chamada da função: ${errorMessage?.error || error.message}`)
      } else if (error) {
        throw new Error(`Erro na chamada da função: ${error.message}`)
      }
      if (data?.error) throw new Error(data.error)

      toast({
        title: 'Mensagem enviada!',
        description: 'Mensagem enviada com sucesso. Verifique seu WhatsApp!',
      })
    } catch (error: any) {
      toast({ title: 'Falha no teste', description: error.message, variant: 'destructive' })
    } finally {
      setTesting(false)
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast({ title: 'Copiado!', description: `${label} copiada para a área de transferência.` })
  }

  const handleTemplateChange = useCallback((template: SelectedTemplate | null) => {
    setSelectedTemplate(template)
  }, [])

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
              statusBadge === 'connected'
                ? 'default'
                : statusBadge === 'connecting'
                  ? 'secondary'
                  : 'destructive'
            }
            className={
              statusBadge === 'connected'
                ? 'bg-green-600 hover:bg-green-700'
                : statusBadge === 'connecting'
                  ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                  : ''
            }
          >
            {statusBadge === 'connected'
              ? 'Conectado'
              : statusBadge === 'connecting'
                ? 'Conectando...'
                : 'Desconectado'}
          </Badge>
        </div>
        <CardTitle>WhatsApp</CardTitle>
        <CardDescription>
          Escolha entre a API Oficial do WhatsApp (Meta Cloud) ou a Evolution API.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <Label>Provedor Principal</Label>
              <RadioGroup
                value={providerType}
                onValueChange={(v) => setProviderType(v as 'official' | 'evolution')}
                className="grid grid-cols-2 gap-3"
              >
                <div
                  className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${providerType === 'official' ? 'border-green-500 bg-green-50/50' : 'border-border hover:bg-muted/50'}`}
                >
                  <RadioGroupItem value="official" id="official" className="mt-1" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-semibold">API Oficial</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Meta Cloud API</p>
                  </div>
                </div>
                <div
                  className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${providerType === 'evolution' ? 'border-blue-500 bg-blue-50/50' : 'border-border hover:bg-muted/50'}`}
                >
                  <RadioGroupItem value="evolution" id="evolution" className="mt-1" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Zap className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-semibold">Evolution API</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Work-Exchange</p>
                  </div>
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                O provedor principal é tentado primeiro. Se falhar, o outro é usado como fallback.
              </p>
            </div>

            {providerType === 'official' ? (
              <>
                <div className="space-y-2">
                  <Label>Phone Number ID</Label>
                  <div className="flex relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={officialPhoneId}
                      onChange={(e) => setOfficialPhoneId(e.target.value)}
                      placeholder="Ex: 106123456789012"
                      className="pl-9"
                      disabled={isOfficialConnected && !officialToken}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp Business Account ID (WABA ID)</Label>
                  <div className="flex relative">
                    <Server className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={officialWabaId}
                      onChange={(e) => setOfficialWabaId(e.target.value)}
                      placeholder="Ex: 123456789012345"
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Permanent Access Token</Label>
                  <div className="flex relative">
                    <Key className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={officialToken}
                      onChange={(e) => setOfficialToken(e.target.value)}
                      placeholder={
                        hasOfficialToken ? '•••••• (Configurado ✅)' : 'SUA_ACCESS_TOKEN'
                      }
                      type="password"
                      className="pl-9"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {hasOfficialToken
                      ? 'Token configurado e armazenado com segurança. Digite um novo token para substituir.'
                      : 'O token é armazenado de forma segura e não é exibido após salvar.'}
                  </p>
                </div>
                <div className="space-y-2 pt-4 border-t">
                  <Label>Verify Token (Webhook)</Label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Key className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={officialVerifyToken}
                        onChange={(e) => setOfficialVerifyToken(e.target.value)}
                        className="pl-9 bg-muted/50 text-xs"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(officialVerifyToken, 'Verify Token')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>URL do Webhook (Meta Cloud API)</Label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Link2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input readOnly value={WEBHOOK_URL} className="pl-9 bg-muted/50 text-xs" />
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(WEBHOOK_URL, 'URL do Webhook')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    No Meta Business Manager, configure o webhook com esta URL e o Verify Token
                    acima. Marque os campos: <code>messages</code> e <code>message_status</code>.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>URL da API</Label>
                  <div className="flex relative">
                    <Link2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={apiUrl}
                      onChange={(e) =>
                        setApiUrl(e.target.value.replace(/^(POST|GET|PUT|DELETE)\s+/i, ''))
                      }
                      placeholder="Ex: https://4labnutri.online"
                      className="pl-9"
                      disabled={isEvolutionConnected}
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
                      disabled={isEvolutionConnected}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Global API Key / Access Key Secret</Label>
                  <div className="flex relative">
                    <Key className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                      placeholder={
                        hasApiToken ? '•••••• (Configurado ✅)' : 'SUA_ACCESS_KEY_SECRET'
                      }
                      type="password"
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-2 pt-4 border-t">
                  <Label>URL do Webhook (Retorno de Dados)</Label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Link2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        readOnly
                        value="https://zbtaxosxmxoidrtmojfx.supabase.co/functions/v1/whatsapp-webhook"
                        className="pl-9 bg-muted/50 text-xs"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        copyToClipboard(
                          'https://zbtaxosxmxoidrtmojfx.supabase.co/functions/v1/whatsapp-webhook',
                          'URL do Webhook',
                        )
                      }
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Na Evolution API v2, configure a integração do tipo <strong>WEBHOOK</strong> e
                    cole esta URL. Marque os eventos: <code>messages.upsert</code>,{' '}
                    <code>messages.update</code> e <code>connection.update</code>.
                  </p>
                </div>
              </>
            )}

            <div className="space-y-3 pt-4 border-t">
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

              {providerType === 'official' && isOfficialConnected && (
                <>
                  <div className="flex gap-2">
                    <Button
                      variant={testMode === 'template' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTestMode('template')}
                    >
                      Template
                    </Button>
                    <Button
                      variant={testMode === 'freetext' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTestMode('freetext')}
                    >
                      Texto Livre
                    </Button>
                  </div>

                  {testMode === 'template' ? (
                    <WhatsAppTemplateSelector
                      userId={targetUserId}
                      enabled={isOfficialConnected}
                      onTemplateChange={handleTemplateChange}
                      refetchTrigger={templateRefetchTrigger}
                    />
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label className="text-xs">Mensagem</Label>
                        <Input
                          value={freeText}
                          onChange={(e) => setFreeText(e.target.value)}
                          placeholder="Digite a mensagem..."
                        />
                      </div>
                      <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                        <p className="text-xs text-yellow-800">
                          Texto livre só é permitido se o contato respondeu nas últimas 24 horas.
                          Caso contrário, use um template.
                        </p>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        {isProviderConnected ? (
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
          <Button
            onClick={handleSave}
            className="w-full"
            disabled={
              loading ||
              (providerType === 'official'
                ? !officialPhoneId
                : !apiUrl || !instanceName || !apiToken)
            }
          >
            Salvar Configuração
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
