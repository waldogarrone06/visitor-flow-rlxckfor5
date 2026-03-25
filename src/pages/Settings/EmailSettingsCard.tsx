import { useState } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { Mail, Loader2, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useMainStore } from '@/stores/main'

export function EmailSettingsCard() {
  const [active, setActive] = useState(true)
  const [senderName, setSenderName] = useState('FourLab Nutrição')
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()
  const { state } = useMainStore()

  const testConnection = async () => {
    if (!user?.email) {
      toast({
        title: 'Erro de Usuário',
        description: 'Seu usuário não possui um e-mail configurado para receber o teste.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)

    // Safely extract the Resend API Key from the Secrets Vault
    const rawSecrets = state.settings?.secrets
    const secrets = Array.isArray(rawSecrets) ? rawSecrets : []
    const userResendKey = secrets.find((s: any) => s.key === 'RESEND_API_KEY')?.value

    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: user.email,
          subject: 'Teste de Integração de E-mail - FourLab',
          html: `
            <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
              <div style="background-color: #6d28d9; padding: 24px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 20px;">Integração Confirmada! 🎉</h1>
              </div>
              <div style="padding: 32px; background-color: #ffffff;">
                <p style="font-size: 16px; line-height: 1.5;">Olá,</p>
                <p style="font-size: 16px; line-height: 1.5;">Este é um e-mail de teste disparado pelo sistema <strong>${senderName}</strong> utilizando a infraestrutura do <strong>Resend</strong>.</p>
                <p style="font-size: 16px; line-height: 1.5;">Se você está lendo esta mensagem, significa que suas <em>Edge Functions</em> estão conectadas com sucesso à API de e-mail e prontas para realizar disparos transacionais de agendamentos e alertas.</p>
                <br/>
                <p style="font-size: 14px; color: #666;">Atenciosamente,<br/>Equipe Técnica</p>
              </div>
            </div>
          `,
          senderName: senderName,
          resendApiKey: userResendKey, // Passes the dynamically configured key if available
        },
      })

      if (error) {
        let errorMessage = error.message || 'Erro desconhecido ao chamar a API de envio.'
        try {
          if ('context' in error && typeof (error as any).context?.json === 'function') {
            const errorBody = await (error as any).context.json()
            if (errorBody && errorBody.error) {
              errorMessage = errorBody.error
            }
          }
        } catch (_) {
          console.error('Failed to parse error context', _)
        }
        throw new Error(errorMessage)
      }

      if (data?.error) {
        throw new Error(data.error)
      }

      toast({
        title: 'E-mail Enviado!',
        description: `Um e-mail de teste foi disparado para ${user.email}. Verifique sua caixa de entrada.`,
      })
    } catch (err: any) {
      console.error('Error sending test email:', err)
      toast({
        title: 'Falha no envio',
        description:
          err.message || 'Não foi possível disparar o e-mail de teste. Verifique suas credenciais.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="flex flex-col shadow-subtle border-border/50">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg mb-2">
            <Mail className="h-6 w-6" />
          </div>
          <Badge
            variant={active ? 'default' : 'secondary'}
            className={active ? 'bg-purple-600 hover:bg-purple-700' : ''}
          >
            {active ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
        <CardTitle>Disparo de E-mails</CardTitle>
        <CardDescription>
          Configure notificações transacionais e integração via Resend.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="sender-name">Nome do Remetente</Label>
          <Input
            id="sender-name"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            disabled={!active || loading}
          />
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground cursor-pointer" htmlFor="delay-email">
              Alertas de Atraso de Kits
            </Label>
            <Switch
              id="delay-email"
              checked={active}
              onCheckedChange={setActive}
              disabled={loading}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground cursor-pointer" htmlFor="weekly-email">
              Relatório Semanal de Conversão
            </Label>
            <Switch id="weekly-email" defaultChecked disabled={loading} />
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button
          variant="secondary"
          onClick={testConnection}
          className="flex-1 gap-2"
          disabled={!active || loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {loading ? 'Enviando...' : 'Testar Disparo'}
        </Button>
      </CardFooter>
    </Card>
  )
}
