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

export function EmailSettingsCard() {
  const [active, setActive] = useState(true)
  const [senderName, setSenderName] = useState('FourLab Nutrition')
  const [testEmail, setTestEmail] = useState('waldogarrone@yahoo.com.br')
  const [loading, setLoading] = useState(false)

  const testConnection = async () => {
    if (!testEmail) {
      toast({
        title: 'E-mail Inválido',
        description: 'Por favor, informe um e-mail de destino para receber o teste.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: testEmail,
          template: 'test',
          senderName: senderName,
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
        description: `Um e-mail de teste automático foi disparado para ${testEmail}. Verifique sua caixa de entrada.`,
      })
    } catch (err: any) {
      console.error('Error sending test email:', err)
      toast({
        title: 'Falha no envio',
        description:
          err.message ||
          'Não foi possível disparar o e-mail de teste. Verifique as configurações e a chave de API.',
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
          Gerencie a automação de e-mails para envio automático via fourlabnutrition.com.br.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label
              className="text-sm text-muted-foreground cursor-pointer pr-4"
              htmlFor="auto-confirm"
            >
              <span className="font-medium text-foreground block mb-1">
                Confirmação Automática de Agendamento
              </span>
              Disparar e-mail de confirmação aos clientes imediatamente após o agendamento no site
              ou CRM.
            </Label>
            <Switch
              id="auto-confirm"
              checked={active}
              onCheckedChange={setActive}
              disabled={loading}
            />
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t">
          <h4 className="text-sm font-semibold">Configuração e Teste</h4>
          <div className="space-y-2">
            <Label htmlFor="sender-name">Nome do Remetente</Label>
            <Input
              id="sender-name"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              disabled={!active || loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="test-email">E-mail de Destino (Teste)</Label>
            <Input
              id="test-email"
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="seu-email@exemplo.com"
              disabled={!active || loading}
            />
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button
          variant="secondary"
          onClick={testConnection}
          className="flex-1 gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
          disabled={!active || loading || !testEmail}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {loading ? 'Enviando Teste...' : 'Testar Disparo'}
        </Button>
      </CardFooter>
    </Card>
  )
}
