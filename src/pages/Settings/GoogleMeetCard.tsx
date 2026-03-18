import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Video } from 'lucide-react'
import { useMainStore } from '@/stores/main'
import { toast } from '@/hooks/use-toast'

export function GoogleMeetCard() {
  const { state, dispatch } = useMainStore()
  const connected = state.settings?.googleMeetConnected ?? false
  const email = state.settings?.googleAccountEmail || 'usuario@empresa.com'

  const handleToggle = () => {
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        googleMeetConnected: !connected,
        googleAccountEmail: !connected ? email : undefined,
      },
    })
    toast({
      title: !connected ? 'Google Meet Conectado' : 'Google Meet Desconectado',
      description: !connected
        ? 'Links de reunião serão gerados automaticamente.'
        : 'Geração de links pausada.',
    })
  }

  return (
    <Card className="flex flex-col shadow-subtle border-border/50">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="p-3 bg-teal-50 text-teal-600 rounded-lg mb-2">
            <Video className="h-6 w-6" />
          </div>
          <Badge
            variant={connected ? 'default' : 'secondary'}
            className={connected ? 'bg-green-600 hover:bg-green-700' : ''}
          >
            {connected ? 'Conectado' : 'Desconectado'}
          </Badge>
        </div>
        <CardTitle>Google Meet</CardTitle>
        <CardDescription>Gere links de reunião para agendamentos virtuais.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {connected && (
          <div className="p-3 bg-muted/40 border border-border/50 rounded-md flex items-center gap-2">
            <Video className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              Conta: <span className="text-muted-foreground font-normal">{email}</span>
            </span>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Conecte sua conta do Google Workspace para criar salas de videoconferência únicas em cada
          novo agendamento marcado como "Reunião Virtual".
        </p>
      </CardContent>
      <CardFooter>
        <Button
          variant={connected ? 'outline' : 'default'}
          onClick={handleToggle}
          className="w-full"
        >
          {connected ? 'Desconectar Conta' : 'Conectar Conta'}
        </Button>
      </CardFooter>
    </Card>
  )
}
