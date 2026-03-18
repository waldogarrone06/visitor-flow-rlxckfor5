import { useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Users, Video, ExternalLink } from 'lucide-react'
import { useMainStore } from '@/stores/main'
import { DateRange } from 'react-day-picker'
import { isDateInRange } from '@/lib/utils'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function UpcomingOnlineMeetings({ dateRange }: { dateRange?: DateRange }) {
  const { state } = useMainStore()

  const slots = useMemo(() => {
    const virtualApps = state.appointments.filter(
      (a) => a.isVirtual && a.status === 'Scheduled' && isDateInRange(a.date, dateRange),
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
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    )
  }, [state.appointments, dateRange])

  return (
    <Card className="shadow-subtle flex-1 flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Video className="h-5 w-5 text-teal-600" />
          Próximas Reuniões Online
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto max-h-[300px]">
        {slots.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            Nenhuma reunião online no período.
          </p>
        ) : (
          <div className="space-y-3">
            {slots.map((slot) => (
              <div
                key={slot.date}
                className="p-3 border rounded-lg bg-teal-50/40 flex flex-col gap-3 hover:bg-teal-50/60 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-sm">
                    {format(new Date(slot.date), "dd/MM 'às' HH:mm", { locale: ptBR })}
                  </span>
                  <div className="flex items-center gap-1 text-xs font-medium text-teal-800 bg-teal-100/80 px-2 py-1 rounded-full border border-teal-200">
                    <Users className="h-3.5 w-3.5" />
                    {slot.participants} / 30
                  </div>
                </div>
                {slot.meetLink ? (
                  <a
                    href={slot.meetLink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 w-full text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-md transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ingressar no Meet
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground text-center block py-1 bg-muted rounded-md">
                    Link indisponível
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
