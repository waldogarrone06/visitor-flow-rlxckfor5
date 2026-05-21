import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Users, Video, ExternalLink, FileText, Loader2 } from 'lucide-react'
import { useMainStore } from '@/stores/main'
import { DateRange } from 'react-day-picker'
import { isDateInRange } from '@/lib/utils'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { MeetingReportDialog } from './MeetingReportDialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'

export function UpcomingOnlineMeetings({ dateRange }: { dateRange?: DateRange }) {
  const { state } = useMainStore()
  const { user } = useAuth()
  const [dbAppointments, setDbAppointments] = useState<any[]>([])
  const [selectedSlot, setSelectedSlot] = useState<any>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sendingLink, setSendingLink] = useState<string | null>(null)

  const handleSendMeetLink = async (slot: any) => {
    setSendingLink(slot.date)
    try {
      let successCount = 0
      let lastError = null
      for (const id of slot.ids) {
        const { data, error } = await supabase.functions.invoke('send-meet-link', {
          body: { appointmentId: id },
        })
        if (error || data?.error) {
          lastError = error?.message || data?.error
        } else {
          successCount++
        }
      }

      if (successCount > 0) {
        toast({
          title: 'Link Enviado',
          description: `Link enviado com sucesso para ${successCount} participante(s).`,
        })
      }
      if (lastError && successCount < slot.ids.length) {
        toast({
          title: 'Aviso',
          description: `Falha ao enviar para alguns: ${lastError}`,
          variant: 'destructive',
        })
      }
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' })
    } finally {
      setSendingLink(null)
    }
  }

  useEffect(() => {
    if (!user) return

    const fetchAppointments = async () => {
      const { data } = await supabase.from('appointments').select('*').eq('user_id', user.id)

      if (data) setDbAppointments(data)
    }

    fetchAppointments()

    const channel = supabase
      .channel('upcoming-online-meetings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `user_id=eq.${user.id}` },
        () => fetchAppointments(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  const slots = useMemo(() => {
    // Map db appointments to local structure
    const mappedDbApps = dbAppointments
      .filter((a) => a.google_meet_link)
      .map((a) => ({
        id: a.id,
        date: `${a.appointment_date}T${a.start_time}:00`,
        meetLink: a.google_meet_link,
        isVirtual: true,
      }))

    const combinedApps = [
      ...state.appointments.filter(
        (a) => a.isVirtual && !mappedDbApps.find((db) => db.id === a.id),
      ),
      ...mappedDbApps,
    ]

    const virtualApps = combinedApps.filter((a) => a.isVirtual && isDateInRange(a.date, dateRange))

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
                      <>
                        <a
                          href={slot.meetLink}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 flex items-center justify-center gap-2 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-md transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Ingressar
                        </a>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSendMeetLink(slot)}
                          disabled={sendingLink === slot.date}
                          className="flex-1 gap-2 h-8 text-xs text-purple-600 border-purple-200 hover:bg-purple-50 hover:text-purple-700"
                        >
                          {sendingLink === slot.date ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Video className="h-3.5 w-3.5" />
                          )}
                          Enviar Link
                        </Button>
                      </>
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
