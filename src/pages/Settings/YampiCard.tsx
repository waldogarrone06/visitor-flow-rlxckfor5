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
import { ShoppingBag, Key, Eye, EyeOff, Store, Sparkles, CheckCircle2 } from 'lucide-react'
import { getIntegrations, saveIntegrations } from '@/services/settings'
import { supabase } from '@/lib/supabase/client'
import { createYampiCouponDirect } from '@/services/yampi'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

export function YampiCard({ targetUserId }: { targetUserId?: string }) {
  const [alias, setAlias] = useState('')
  const [token, setToken] = useState('')
  const [secret, setSecret] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Test modal state
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [testCode, setTestCode] = useState('TEST-VIP-12')
  const [testValue, setTestValue] = useState('10')
  const [testValidityDays, setTestValidityDays] = useState('0')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)

  useEffect(() => {
    if (!targetUserId) return
    setLoading(true)
    getIntegrations(targetUserId).then((data) => {
      const isConfigured = !!(data as any)?._has_yampi || !!(data as any)?.yampi_configured
      setConfigured(isConfigured)
      setAlias((data as any)?.yampi_alias || '')
      setToken('')
      setSecret('')
      setLoading(false)
    })
  }, [targetUserId])

  const handleSave = async () => {
    if (!configured && (!token.trim() || !secret.trim())) {
      toast({
        title: 'Aviso',
        description:
          'A API da Yampi exige tanto o User-Token quanto o User-Secret-Key. Preencha ambos para conectar.',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      // 1. Save alias in user_integrations
      await saveIntegrations({ yampi_alias: alias.trim() }, targetUserId)

      // 2. Save yampi_token via save-integration-secret edge function if supplied
      if (token.trim()) {
        const { error: tokenErr } = await supabase.functions.invoke('save-integration-secret', {
          body: {
            userId: targetUserId,
            credentialKey: 'yampi_token',
            credentialValue: token.trim(),
          },
        })
        if (tokenErr) throw new Error('Falha ao salvar token da Yampi com segurança.')
      }

      // 3. Save yampi_secret via save-integration-secret edge function if supplied
      if (secret.trim()) {
        const { error: secretErr } = await supabase.functions.invoke('save-integration-secret', {
          body: {
            userId: targetUserId,
            credentialKey: 'yampi_secret',
            credentialValue: secret.trim(),
          },
        })
        if (secretErr) throw new Error('Falha ao salvar chave secreta da Yampi com segurança.')
      }

      await saveIntegrations({ yampi_configured: true }, targetUserId)
      setConfigured(true)
      setToken('')
      setSecret('')
      toast({
        title: 'Yampi Conectada',
        description: 'Credenciais e alias da loja salvos com segurança no cofre.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message || 'Falha ao salvar credenciais da Yampi.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    setSaving(true)
    try {
      await supabase.functions.invoke('save-integration-secret', {
        body: { userId: targetUserId, credentialKey: 'yampi_token', clear: true },
      })
      await supabase.functions.invoke('save-integration-secret', {
        body: { userId: targetUserId, credentialKey: 'yampi_secret', clear: true },
      })
      await saveIntegrations({ yampi_configured: false }, targetUserId)
      setConfigured(false)
      setToken('')
      setSecret('')
      toast({ title: 'Yampi Desconectada', description: 'Credenciais removidas do cofre seguro.' })
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message || 'Falha ao desconectar.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleTestCoupon = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const parsedDays = Number(testValidityDays)
      const res = await createYampiCouponDirect({
        userId: targetUserId,
        code: testCode.trim().toUpperCase(),
        value: Number(testValue) || 10,
        discount_type: 'p',
        validity_days: parsedDays > 0 ? parsedDays : null,
        description: 'Cupom de teste gerado pelo Visitor Flow',
      })

      setTestResult(res)
      if (res.success) {
        toast({
          title: 'Cupom Criado!',
          description: `Cupom ${res.code} gerado na Yampi (50 unidades fixas, ${res.value || 10}% de desconto).`,
        })
      } else {
        toast({
          title: 'Erro na Criação',
          description: res.error || 'Não foi possível criar o cupom na Yampi.',
          variant: 'destructive',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message || 'Falha ao testar cupom.',
        variant: 'destructive',
      })
    } finally {
      setTesting(false)
    }
  }

  if (!targetUserId) return null

  return (
    <>
      <Card className="flex flex-col shadow-subtle border-border/50">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div className="p-3 bg-red-50 text-red-600 rounded-lg mb-2">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <Badge
              variant={configured ? 'default' : 'secondary'}
              className={configured ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {configured ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
          <CardTitle>Integração Yampi</CardTitle>
          <CardDescription>
            Gere cupons automáticos de desconto para leads, pacientes e prescritores da loja.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 space-y-4">
          {loading ? (
            <div className="space-y-3">
              <div className="animate-pulse h-10 bg-muted rounded w-full"></div>
              <div className="animate-pulse h-10 bg-muted rounded w-full"></div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="yampi-alias"
                  className="flex items-center gap-1.5 text-xs font-medium"
                >
                  <Store className="h-3.5 w-3.5" /> Alias da Loja (Subdomínio)
                </Label>
                <Input
                  id="yampi-alias"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value.toLowerCase())}
                  placeholder="ex: minhaloja (de minhaloja.yampi.com.br)"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="yampi-token"
                  className="flex items-center gap-1.5 text-xs font-medium"
                >
                  <Key className="h-3.5 w-3.5" /> User-Token da Yampi
                </Label>
                <div className="relative">
                  <Input
                    id="yampi-token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={
                      configured ? '•••••••••••• (Salvo no cofre)' : 'Token de autenticação da API'
                    }
                    type={showToken ? 'text' : 'password'}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="yampi-secret"
                  className="flex items-center gap-1.5 text-xs font-medium"
                >
                  <Key className="h-3.5 w-3.5" /> User-Secret-Key da Yampi (Obrigatório)
                </Label>
                <div className="relative">
                  <Input
                    id="yampi-secret"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder={
                      configured
                        ? '•••••••••••• (Salvo no cofre)'
                        : 'Chave secreta da API (User-Secret-Key)'
                    }
                    type={showSecret ? 'text' : 'password'}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {configured && (
                <p className="text-xs text-muted-foreground">
                  Credenciais protegidas no cofre (integration_secrets). Digite novos valores para
                  atualizar.
                </p>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          {configured ? (
            <>
              {(token || secret || alias) && (
                <Button onClick={handleSave} className="flex-1" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setTestModalOpen(true)}
                className="flex-1 gap-1 text-xs"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Testar Cupom
              </Button>
              <Button
                variant="outline"
                onClick={handleDisconnect}
                className="w-full text-destructive hover:bg-destructive/10"
                disabled={saving}
              >
                Desconectar
              </Button>
            </>
          ) : (
            <Button
              onClick={handleSave}
              className="w-full"
              disabled={loading || (!token && !configured) || saving}
            >
              {saving ? 'Salvando...' : 'Salvar e Conectar'}
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Test Modal */}
      <Dialog open={testModalOpen} onOpenChange={setTestModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-red-600" /> Testar Criação de Cupom na Yampi
            </DialogTitle>
            <DialogDescription>
              Dispara a Edge Function{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">yampi-create-coupon</code> com
              credenciais seguras.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="font-semibold text-slate-800">Regras de Negócio Fixas:</div>
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                <li>
                  Total de cupons: <strong className="text-foreground">50 unidades</strong> (fixo)
                </li>
                <li>
                  Desconto: <strong className="text-foreground">Sempre em porcentagem (%)</strong>
                </li>
                <li>
                  Exceção: Produtos com <strong className="text-foreground">kit</strong> ou{' '}
                  <strong className="text-foreground">combo</strong> não entram
                </li>
              </ul>
            </div>

            <div className="space-y-1.5">
              <Label>Código do Cupom</Label>
              <Input
                value={testCode}
                onChange={(e) => setTestCode(e.target.value.toUpperCase())}
                placeholder="Ex: PROMO-10"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Input
                  value="Porcentagem (%)"
                  disabled
                  className="bg-muted text-muted-foreground text-xs font-medium cursor-not-allowed"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Desconto (%)</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={testValue}
                  onChange={(e) => setTestValue(e.target.value)}
                  placeholder="10"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Quantidade</Label>
                <Input
                  value="50 un"
                  disabled
                  className="bg-muted text-muted-foreground text-xs font-medium cursor-not-allowed"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center justify-between">
                <span>Validade (dias)</span>
                <span className="text-[11px] text-muted-foreground font-normal">
                  0 = Sem expiração (~10 anos)
                </span>
              </Label>
              <Input
                type="number"
                min="0"
                value={testValidityDays}
                onChange={(e) => setTestValidityDays(e.target.value)}
                placeholder="0"
              />
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-md text-xs space-y-2 ${
                  testResult.success
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                    : 'bg-red-50 text-red-900 border border-red-200'
                }`}
              >
                <div className="font-semibold flex items-center gap-1.5">
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <span className="shrink-0">⚠️</span>
                  )}
                  <span>
                    {testResult.success
                      ? 'Sucesso ao emitir cupom na Yampi'
                      : 'Falha na emissão do cupom'}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  Código:{' '}
                  <span className="font-semibold text-foreground">
                    {testResult.code || testResult.couponCode}
                  </span>
                </div>
                {testResult.id && (
                  <div className="font-mono text-[11px]">ID Yampi: {testResult.id}</div>
                )}
                {testResult.endpoint && (
                  <div className="font-mono text-[10px] text-muted-foreground break-all">
                    Rota final: {testResult.endpoint}
                  </div>
                )}

                {testResult.warning && (
                  <div className="text-xs text-amber-900 bg-amber-50 p-2 rounded border border-amber-200 leading-relaxed">
                    ⚠️ {testResult.warning}
                  </div>
                )}

                {testResult.fixedRulesApplied && (
                  <div className="text-[10px] text-muted-foreground border-t border-border/40 pt-1.5">
                    Regras: {testResult.fixedRulesApplied.quantity} un |{' '}
                    {testResult.fixedRulesApplied.discount_type === 'p'
                      ? 'Porcentagem (%)'
                      : 'Fixo'}{' '}
                    | {testResult.fixedRulesApplied.excluded_products_count} produtos kit/combo
                    filtrados
                  </div>
                )}

                {/* Mini-log of route attempts for fast diagnostics */}
                {Array.isArray(testResult.attempts) && testResult.attempts.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                    <div className="font-semibold text-[11px] text-muted-foreground">
                      Histórico de rotas tentadas ({testResult.attempts.length}):
                    </div>
                    <div className="space-y-1 font-mono text-[10px] bg-background/70 p-2 rounded border border-border/50 max-h-36 overflow-y-auto">
                      {testResult.attempts.map((att: any, idx: number) => {
                        const isOk = att.status >= 200 && att.status < 300
                        const isAuthFail = att.status === 401 || att.status === 403
                        const isDuplicateRetry = att.outcome === 'duplicate_retry'
                        const isHtml = att.isHtml

                        let badgeColor = 'bg-amber-100 text-amber-800'
                        if (isOk) badgeColor = 'bg-emerald-100 text-emerald-800'
                        else if (isDuplicateRetry) badgeColor = 'bg-blue-100 text-blue-800'
                        else if (isAuthFail && !isHtml) badgeColor = 'bg-red-100 text-red-800'
                        else if (isHtml) badgeColor = 'bg-rose-100 text-rose-800'

                        // Shorten endpoint url for readability
                        const shortUrl = att.endpoint.replace('https://', '')
                        const stepLabel =
                          att.step === 'preflight'
                            ? 'Validação Prévia (Pre-flight)'
                            : att.codeTried
                              ? `Tentativa (${att.codeTried})`
                              : `Tentativa #${idx + 1}`

                        return (
                          <div
                            key={idx}
                            className={`flex flex-col gap-0.5 border-b border-border/30 pb-1.5 last:border-b-0 last:pb-0 ${
                              att.step === 'preflight' ? 'bg-primary/5 p-1.5 rounded' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className="truncate text-foreground font-medium text-[10px]"
                                title={att.endpoint}
                              >
                                <span className="font-semibold text-primary/80 mr-1">
                                  [{att.method || (att.step === 'preflight' ? 'GET' : 'POST')}]
                                </span>
                                {shortUrl}
                              </span>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[9px] font-semibold whitespace-nowrap ${badgeColor}`}
                              >
                                {att.status > 0 ? `HTTP ${att.status}` : 'Rede'}
                                {isDuplicateRetry ? ' (Duplicado)' : isHtml ? ' (HTML/Bloq)' : ''}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                              <span>{stepLabel}</span>
                              <span className="font-mono text-[9px]">{att.outcome}</span>
                            </div>
                            {att.message && (
                              <div className="text-[10px] text-muted-foreground break-words italic">
                                {att.message}
                              </div>
                            )}
                            {att.responseSnippet && !isOk && (
                              <div className="text-[9px] text-muted-foreground/80 font-mono bg-muted/40 p-1 rounded break-all">
                                {att.responseSnippet}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {testResult.error && (
                  <div className="text-xs text-red-800 bg-red-100/70 p-2 rounded border border-red-200 break-words leading-relaxed">
                    {testResult.error}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setTestModalOpen(false)}>
              Fechar
            </Button>
            <Button onClick={handleTestCoupon} disabled={testing || !testCode.trim()}>
              {testing ? 'Criando Cupom...' : 'Emitir Cupom Agora'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
