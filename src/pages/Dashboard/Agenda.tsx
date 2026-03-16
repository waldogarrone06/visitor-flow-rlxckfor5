import { useMainStore } from '@/stores/main'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { CheckCircle2, Clock } from 'lucide-react'
import { format, isToday, isTomorrow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from '@/hooks/use-toast'

export function DashboardAgenda() {
  const { state, dispatch } = useMainStore()

  const upcoming = state.appointments
    .filter((a) => a.status === 'Scheduled')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5)

  const handleMarkVisited = (id: string) => {
    dispatch({ type: 'MARK_VISITED', payload: { appointmentId: id } })
    toast({
      title: 'Visita Realizada',
      description: 'Contato movido para "Visitado" e kit agendado para envio.',
    })
  }

  const getDateLabel = (dateStr: string) => {
    const d = new Date(dateStr)
    if (isToday(d)) return 'Hoje'
    if (isTomorrow(d)) return 'Amanhã'
    return format(d, "dd 'de' MMM", { locale: ptBR })
  }

  return (
    <Card className="shadow-subtle">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          Próximas Visitas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">Nenhuma visita agendada.</p>
        ) : (
          <div className="space-y-4">
            {upcoming.map((apt) => {
              const lead = state.leads.find((l) => l.id === apt.leadId)
              if (!lead) return null
              return (
                <div
                  key={apt.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-border">
                      <AvatarImage
                        src={`https://img.usecurling.com/ppl/thumbnail?gender=male&seed=${lead.avatarSeed || 1}`}
                      />
                      <AvatarFallback>{lead.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium leading-none">{lead.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-normal">
                          {getDateLabel(apt.date)} às {format(new Date(apt.date), 'HH:mm')}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{lead.type}</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 h-8"
                    onClick={() => handleMarkVisited(apt.id)}
                  >
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="hidden sm:inline">Realizada</span>
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
