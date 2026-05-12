import { useMainStore } from '@/stores/main'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { CheckCircle2, Clock, CalendarDays } from 'lucide-react'
import { format, isToday, isTomorrow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from '@/hooks/use-toast'
import { DateRange } from 'react-day-picker'
import { isDateInRange } from '@/lib/utils'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function DashboardAgenda({ dateRange }: { dateRange?: DateRange }) {
  const { state, dispatch } = useMainStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [rescheduleData, setRescheduleData] = useState<{
    id: string
    date: string
    time: string
  } | null>(null)

  const upcoming = state.appointments
    .filter((a) => a.status === 'Scheduled' && isDateInRange(a.date, dateRange))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5)

  const handleMarkVisited = (id: string) => {
    dispatch({ type: 'MARK_VISITED', payload: { appointmentId: id } })
    toast({
      title: 'Visita Realizada',
      description: 'Contato movido para "Visitado" e kit agendado para envio.',
    })
  }

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rescheduleData) return

    setIsSubmitting(true)
    try {
      const newDate = new Date(`${rescheduleData.date}T${rescheduleData.time}:00`).toISOString()

      const startTimeStr = rescheduleData.time
      const [h, m] = startTimeStr.split(':').map(Number)
      const endH = h + 1
      const endTimeStr = `${endH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`

      const { error } = await supabase
        .from('appointments')
        .update({
          appointment_date: rescheduleData.date,
          start_time: startTimeStr,
          end_time: endTimeStr,
        })
        .eq('id', rescheduleData.id)

      if (error) throw error

      dispatch({
        type: 'RESCHEDULE_APPOINTMENT',
        payload: { appointmentId: rescheduleData.id, newDate },
      })

      toast({
        title: 'Reagendamento Concluído',
        description: 'A visita foi reagendada com sucesso.',
      })

      try {
        const { error: syncError } = await supabase.functions.invoke('sync-calendar-update', {
          body: {
            appointmentId: rescheduleData.id,
            newDate: rescheduleData.date,
            newTime: rescheduleData.time,
          },
        })

        if (syncError) throw syncError

        toast({
          title: 'Evento atualizado no Google Calendar',
        })
      } catch (syncErr: any) {
        console.error('Google Calendar Sync Update Error:', syncErr)
        toast({
          title: 'Falha ao atualizar Google Calendar. Tente novamente.',
          variant: 'destructive',
        })
      }

      setRescheduleData(null)
    } catch (err: any) {
      toast({
        title: 'Erro ao reagendar',
        description: err.message || 'Falha na atualização.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const getDateLabel = (dateStr: string) => {
    const d = new Date(dateStr)
    if (isToday(d)) return 'Hoje'
    if (isTomorrow(d)) return 'Amanhã'
    return format(d, "dd 'de' MMM", { locale: ptBR })
  }

  return (
    <Card className="shadow-subtle flex-1 flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          Próximas Visitas (Individual)
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto min-h-[200px]">
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            Nenhuma visita no período.
          </p>
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
                  <div className="flex items-center gap-1">
                    <Dialog
                      open={rescheduleData?.id === apt.id}
                      onOpenChange={(open) => (!open ? setRescheduleData(null) : null)}
                    >
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          title="Reagendar"
                          onClick={() =>
                            setRescheduleData({
                              id: apt.id,
                              date: apt.date.split('T')[0],
                              time: apt.date.split('T')[1].substring(0, 5),
                            })
                          }
                        >
                          <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <form onSubmit={handleReschedule}>
                          <DialogHeader>
                            <DialogTitle>Reagendar Visita</DialogTitle>
                          </DialogHeader>
                          <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Data</Label>
                                <Input
                                  type="date"
                                  required
                                  value={rescheduleData?.date || ''}
                                  onChange={(e) =>
                                    setRescheduleData((prev) =>
                                      prev ? { ...prev, date: e.target.value } : null,
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Horário</Label>
                                <Input
                                  type="time"
                                  required
                                  value={rescheduleData?.time || ''}
                                  onChange={(e) =>
                                    setRescheduleData((prev) =>
                                      prev ? { ...prev, time: e.target.value } : null,
                                    )
                                  }
                                />
                              </div>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setRescheduleData(null)}
                              disabled={isSubmitting}
                            >
                              Cancelar
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                              {isSubmitting ? 'Salvando...' : 'Salvar Alteração'}
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 h-8 px-2 sm:px-3"
                      onClick={() => handleMarkVisited(apt.id)}
                    >
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="hidden sm:inline">Realizada</span>
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
