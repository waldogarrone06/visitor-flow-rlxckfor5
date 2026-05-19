import { useMainStore } from '@/stores/main'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Video, Calendar, Clock } from 'lucide-react'
import { format, isToday, subMinutes, isTomorrow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

export function UpcomingMeetingsWidget() {
  const { state } = useMainStore()

  const now = new Date()

  const upcomingMeetings = (state.appointments || [])
    .filter((app: any) => {
      if (!app.google_meet_link) return false
      if (!app.appointment_date || !app.end_time || !app.start_time) return false

      const [year, month, day] = app.appointment_date.split('-').map(Number)
      const [endHour, endMinute] = app.end_time.split(':').map(Number)
      const endDate = new Date(year, month - 1, day, endHour, endMinute)

      return endDate >= now
    })
    .sort((a: any, b: any) => {
      const [aYear, aMonth, aDay] = a.appointment_date.split('-').map(Number)
      const [aHour, aMinute] = a.start_time.split(':').map(Number)
      const dateA = new Date(aYear, aMonth - 1, aDay, aHour, aMinute)

      const [bYear, bMonth, bDay] = b.appointment_date.split('-').map(Number)
      const [bHour, bMinute] = b.start_time.split(':').map(Number)
      const dateB = new Date(bYear, bMonth - 1, bDay, bHour, bMinute)

      return dateA.getTime() - dateB.getTime()
    })

  return (
    <Card className="flex flex-col h-full shadow-subtle border-slate-200">
      <CardHeader className="pb-3 border-b bg-slate-50/50">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Video className="h-4 w-4 text-teal-600" />
          Reuniões Online
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 flex flex-col min-h-0">
        <ScrollArea className="flex-1 h-full">
          {upcomingMeetings.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground h-full min-h-[200px]">
              <div className="bg-slate-100 p-3 rounded-full mb-3">
                <Video className="h-6 w-6 text-slate-300" />
              </div>
              <p className="text-sm">Nenhuma reunião online agendada.</p>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {upcomingMeetings.map((app: any) => {
                const [year, month, day] = app.appointment_date.split('-').map(Number)
                const [startHour, startMinute] = app.start_time.split(':').map(Number)
                const [endHour, endMinute] = app.end_time.split(':').map(Number)

                const startDate = new Date(year, month - 1, day, startHour, startMinute)
                const endDate = new Date(year, month - 1, day, endHour, endMinute)

                const fifteenMinsBefore = subMinutes(startDate, 15)
                const isNow = now >= fifteenMinsBefore && now <= endDate
                const isAppToday = isToday(startDate)
                const isAppTomorrow = isTomorrow(startDate)

                let statusText = 'Em breve'
                let badgeColor = 'bg-slate-100 text-slate-700 border-slate-200'

                if (isNow) {
                  statusText = 'Agora'
                  badgeColor = 'bg-red-100 text-red-700 border-red-200 animate-pulse'
                } else if (isAppToday) {
                  statusText = 'Hoje'
                  badgeColor = 'bg-blue-100 text-blue-700 border-blue-200'
                } else if (isAppTomorrow) {
                  statusText = 'Amanhã'
                  badgeColor = 'bg-amber-100 text-amber-700 border-amber-200'
                }

                return (
                  <div
                    key={app.id}
                    className="group flex flex-col gap-3 p-3 rounded-lg border bg-card hover:border-teal-100/50 hover:shadow-sm transition-all"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div
                        className="font-medium text-sm line-clamp-1 flex-1"
                        title={app.client_name}
                      >
                        {app.client_name}
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-semibold px-2 py-0.5 whitespace-nowrap ${badgeColor}`}
                      >
                        {statusText}
                      </Badge>
                    </div>

                    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{format(startDate, "dd 'de' MMM, yyyy", { locale: ptBR })}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        <span>
                          {app.start_time} - {app.end_time}
                        </span>
                      </div>
                    </div>

                    <Button
                      className="w-full gap-2 mt-1"
                      size="sm"
                      onClick={() => window.open(app.google_meet_link, '_blank')}
                      variant={isNow ? 'default' : 'secondary'}
                    >
                      <Video className="h-3.5 w-3.5" />
                      {isNow ? 'Entrar Agora' : 'Acessar Link'}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
