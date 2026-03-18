import { useState, useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Users, Video, ExternalLink, FileText } from 'lucide-react'
import { useMainStore } from '@/stores/main'
import { DateRange } from 'react-day-picker'
import { isDateInRange } from '@/lib/utils'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { MeetingReportDialog } from './MeetingReportDialog'
import { Button } from '@/components/ui/button'

export function UpcomingOnlineMeetings({ dateRange }: { dateRange?: DateRange }) {
  const { state } = useMainStore()
  const [selectedSlot, setSelectedSlot] = useState<any>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const slots = useMemo(() => {
    // Include both Scheduled and Visited (finished) virtual meetings
    const virtualApps = state.appointments.filter(
      (a) => a.isVirtual && isDateInRange(a.date, dateRange),
    )

    const grouped = virtualApps.reduce(
      (acc, app) => {
        if (!acc[app.date]) {
          acc[app.date] = {
            date: app.date,
            meetLink: app.meetLink,
            participants: 0,
            ids: [],
          }
        }
        acc[app.date].participants++
        acc[app.date].ids.push(app.id)
        return acc
      },
      {} as Record<
        string,
        { date: string; meetLink?: string; participants: number; ids: string[] }
      >,
    )

    return Object.values(grouped).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(), // Sort descending to see newest first
    )
  }, [state.appointments, dateRange])

  const openReport = (slot: any) => {
    setSelectedSlot(slot)
    setDialogOpen(true)
  }

  return (
    <Card className="shadow-subtle flex-1 flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Video className="h-5 w-5 text-teal-600" />
          Reuniões Online (Google Meet)
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto max-h-[350px]">
        {slots.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            Nenhuma reunião online no período.
          </p>
        ) : (
          <div className="space-y-3">
            {slots.map((slot) => {
              const isPast = new Date(slot.date) < new Date()
              const hasReport = state.meetingReports?.some((r) => r.date === slot.date)

              return (
                <div
                  key={slot.date}
                  className={`p-3 border rounded-lg flex flex-col gap-3 transition-colors ${
                    isPast && !hasReport
                      ? 'bg-orange-50/40 hover:bg-orange-50/60 border-orange-200'
                      : 'bg-teal-50/40 hover:bg-teal-50/60'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-semibold text-sm block">
                        {format(new Date(slot.date), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </span>
                      {isPast && (
                        <span className="text-[10px] font-medium text-muted-foreground uppercase">
                          {hasReport ? 'Concluída' : 'Aguardando Relatório'}
                        </span>
                      )}
                    </div>
                    <div
                      className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${
                        isPast && !hasReport
                          ? 'bg-orange-100 text-orange-800 border-orange-200'
                          : 'bg-teal-100/80 text-teal-800 border-teal-200'
                      }`}
                    >
                      <Users className="h-3.5 w-3.5" />
                      {slot.participants} / 30
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 w-full">
                    {!isPast && slot.meetLink && (
                      <a
                        href={slot.meetLink}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-md transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Ingressar
                      </a>
                    )}

                    {isPast && (
                      <Button
                        variant={hasReport ? 'outline' : 'default'}
                        size="sm"
                        onClick={() => openReport(slot)}
                        className={`flex-1 gap-2 h-8 text-xs ${hasReport ? '' : 'bg-orange-600 hover:bg-orange-700 text-white'}`}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {hasReport ? 'Ver Relatório' : 'Gerar Relatório'}
                      </Button>
                    )}

                    {!isPast && !slot.meetLink && (
                      <span className="flex-1 text-xs text-muted-foreground text-center py-2 bg-muted rounded-md">
                        Link indisponível
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      <MeetingReportDialog slot={selectedSlot} open={dialogOpen} onOpenChange={setDialogOpen} />
    </Card>
  )
}
