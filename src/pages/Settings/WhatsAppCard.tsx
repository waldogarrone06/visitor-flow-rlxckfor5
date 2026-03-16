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
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { MessageCircle } from 'lucide-react'
import { useMainStore } from '@/stores/main'

export function WhatsAppCard() {
  const { state, dispatch } = useMainStore()
  const connected = state.settings?.whatsappConnected ?? false
  const [welcomeMsg, setWelcomeMsg] = useState(true)

  const handleConnect = () => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { whatsappConnected: !connected } })
    toast({
      title: connected ? 'WhatsApp Desconectado' : 'WhatsApp Conectado',
      description: connected ? 'A integração foi pausada.' : 'QR Code escaneado com sucesso.',
    })
  }

  const testConnection = () => {
    toast({
      title: 'Mensagem de Teste',
      description: 'Um ping de teste foi enviado para o seu número.',
    })
  }

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
            {connected ? 'Conectado' : 'Desconectado'}
          </Badge>
        </div>
        <CardTitle>Integração WhatsApp</CardTitle>
        <CardDescription>Envie mensagens diretas via WhatsApp Web API.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground cursor-pointer" htmlFor="wa-welcome">
              Mensagem de Boas-vindas p/ Prescritores
            </Label>
            <Switch
              id="wa-welcome"
              checked={welcomeMsg}
              onCheckedChange={setWelcomeMsg}
              disabled={!connected}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground cursor-pointer" htmlFor="wa-delay">
              Alertas Automáticos de Atraso
            </Label>
            <Switch id="wa-delay" defaultChecked disabled={!connected} />
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button
          variant={connected ? 'outline' : 'default'}
          onClick={handleConnect}
          className="flex-1"
        >
          {connected ? 'Desconectar' : 'Escanear QR Code'}
        </Button>
        {connected && (
          <Button variant="secondary" onClick={testConnection}>
            Testar
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
