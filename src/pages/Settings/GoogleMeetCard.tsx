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

  const handleToggle = () => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { googleMeetConnected: !connected } })
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
            className={connected ? 'bg-teal-600 hover:bg-teal-700' : ''}
          >
            {connected ? 'Conectado' : 'Desconectado'}
          </Badge>
        </div>
        <CardTitle>Google Meet</CardTitle>
        <CardDescription>Gere links de reunião para agendamentos virtuais.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
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
          {connected ? 'Desconectar Conta' : 'Autorizar Google Meet'}
        </Button>
      </CardFooter>
    </Card>
  )
}
