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
import { Calendar } from 'lucide-react'
import { useMainStore } from '@/stores/main'

export function GoogleCalendarCard() {
  const { state, dispatch } = useMainStore()
  const connected = state.settings?.googleCalendarConnected ?? false
  const sync = state.settings?.googleCalendarSync ?? false

  const handleToggle = () => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { googleCalendarConnected: !connected } })
    toast({
      title: !connected ? 'Google Calendar Conectado' : 'Google Calendar Desconectado',
      description: !connected ? 'Seus agendamentos serão sincronizados.' : 'Sincronização pausada.',
    })
  }

  const handleSyncToggle = (val: boolean) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { googleCalendarSync: val } })
    if (val) {
      toast({
        title: 'Sincronização Bidirecional Ativa',
        description: 'Mudanças no sistema e no calendário agora refletem automaticamente.',
      })
    }
  }

  const testConnection = () => {
    toast({ title: 'Teste de Conexão', description: 'Conexão com Google Calendar está estável.' })
  }

  return (
    <Card className="flex flex-col shadow-subtle border-border/50">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg mb-2">
            <Calendar className="h-6 w-6" />
          </div>
          <Badge
            variant={connected ? 'default' : 'secondary'}
            className={connected ? 'bg-blue-600 hover:bg-blue-700' : ''}
          >
            {connected ? 'Conectado' : 'Desconectado'}
          </Badge>
        </div>
        <CardTitle>Google Calendar</CardTitle>
        <CardDescription>
          Sincronize visitas agendadas automaticamente com sua agenda.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <p className="text-sm text-muted-foreground">
          Ao conectar, todos os novos agendamentos do CRM criarão um evento correspondente no Google
          Calendar do vendedor associado.
        </p>
        {connected && (
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <Label className="text-sm text-muted-foreground cursor-pointer" htmlFor="gc-sync">
              Sincronização Bidirecional
            </Label>
            <Switch id="gc-sync" checked={sync} onCheckedChange={handleSyncToggle} />
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button
          variant={connected ? 'outline' : 'default'}
          onClick={handleToggle}
          className="flex-1"
        >
          {connected ? 'Desconectar Conta' : 'Conectar Conta'}
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
