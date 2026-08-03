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
import { PackageSearch } from 'lucide-react'
import { getIntegrations, saveIntegrations } from '@/services/settings'
import { supabase } from '@/lib/supabase/client'

export function MelhorEnvioCard({ targetUserId }: { targetUserId?: string }) {
  const [token, setToken] = useState('')
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!targetUserId) return
    setLoading(true)
    getIntegrations(targetUserId).then((data) => {
      const isConfigured =
        !!(data as any)?._has_melhor_envio || !!(data as any)?.melhor_envio_configured
      setConfigured(isConfigured)
      setToken('')
      setLoading(false)
    })
  }, [targetUserId])

  const handleSave = async () => {
    if (!token) {
      toast({
        title: 'Aviso',
        description: 'Preencha o token para conectar.',
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.functions.invoke('save-integration-secret', {
        body: {
          userId: targetUserId,
          credentialKey: 'melhor_envio_token',
          credentialValue: token.trim(),
        },
      })
      if (error) throw new Error('Falha ao salvar token seguro')

      await saveIntegrations({ melhor_envio_configured: true }, targetUserId)
      setConfigured(true)
      setToken('')
      toast({
        title: 'Melhor Envio Conectado',
        description: 'Token de integração salvo com segurança.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message || 'Falha ao salvar.',
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
        body: { userId: targetUserId, credentialKey: 'melhor_envio_token', clear: true },
      })
      await saveIntegrations({ melhor_envio_configured: false }, targetUserId)
      setConfigured(false)
      setToken('')
      toast({ title: 'Melhor Envio Desconectado' })
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

  if (!targetUserId) return null

  return (
    <Card className="flex flex-col shadow-subtle border-border/50">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg mb-2">
            <PackageSearch className="h-6 w-6" />
          </div>
          <Badge
            variant={configured ? 'default' : 'secondary'}
            className={configured ? 'bg-green-600 hover:bg-green-700' : ''}
          >
            {configured ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
        <CardTitle>Integração Melhor Envio</CardTitle>
        <CardDescription>
          Conecte para rastrear envios de kits e automatizar o status para "Entregue".
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {loading ? (
          <div className="animate-pulse h-10 bg-muted rounded w-full"></div>
        ) : (
          <div className="space-y-2">
            <Label>Token da API Melhor Envio</Label>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={configured ? '•••••• (Configurado ✅)' : 'Seu token de acesso (Bearer)'}
              type="password"
            />
            {configured && (
              <p className="text-xs text-muted-foreground">
                Token configurado e armazenado com segurança. Digite um novo token para substituir.
              </p>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {configured ? (
          <>
            {token && (
              <Button onClick={handleSave} className="flex-1" disabled={saving}>
                {saving ? 'Salvando...' : 'Atualizar Token'}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleDisconnect}
              className={
                token
                  ? 'flex-1 text-destructive hover:bg-destructive/10'
                  : 'w-full text-destructive hover:bg-destructive/10'
              }
              disabled={saving}
            >
              Desconectar
            </Button>
          </>
        ) : (
          <Button onClick={handleSave} className="w-full" disabled={loading || !token || saving}>
            {saving ? 'Salvando...' : 'Salvar Token'}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
