import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { FourLabLogo } from '@/components/FourLabLogo'
import { ptBR } from 'date-fns/locale'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import { Copy } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DayAppointments } from './DayAppointments'
import { ScheduleForm } from './ScheduleForm'
import { supabase } from '@/lib/supabase/client'
import { useMainStore } from '@/stores/main'

export default function SchedulingPage() {
  const [date, setDate] = useState<Date | undefined>(new Date())
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date())
  const [monthAppointments, setMonthAppointments] = useState<Date[]>([])
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const { user } = useAuth()
  const { state } = useMainStore()

  useEffect(() => {
    if (!user) return

    const loadAppointments = async () => {
      const start = startOfMonth(currentMonth)
      const end = endOfMonth(currentMonth)

      const { data } = await supabase
        .from('appointments')
        .select('appointment_date')
        .eq('user_id', user.id)
        .gte('appointment_date', format(start, 'yyyy-MM-dd'))
        .lte('appointment_date', format(end, 'yyyy-MM-dd'))

      const publicDates = data ? data.map((d) => new Date(d.appointment_date + 'T12:00:00')) : []

      const crmDates = state.appointments
        .map((a) => new Date(a.date))
        .filter((d) => d >= start && d <= end)

      setMonthAppointments([...publicDates, ...crmDates])
    }

    loadAppointments()
  }, [currentMonth, user, state.appointments, refreshTrigger])

  const handleCopyLink = () => {
    if (!user?.id) return
    const url = `${window.location.origin}/agendar/${user.id}`
    navigator.clipboard.writeText(url)
    toast({ title: 'Link copiado!', description: 'O link de agendamento público foi copiado.' })
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <FourLabLogo className="h-16 w-auto text-foreground" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gestão de Agenda</h1>
            <p className="text-muted-foreground">
              Controle seus horários, bloqueios e agendamentos.
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 pt-4 sm:pt-0 w-full sm:w-auto">
          <Select defaultValue="v1">
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Selecione o Vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="v1">Meu Calendário</SelectItem>
              <SelectItem value="v2">Equipe</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="default"
            onClick={handleCopyLink}
            className="gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <Copy className="h-4 w-4" /> Copiar Link Público
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="flex flex-col gap-6 xl:col-span-7">
          <Card className="shadow-subtle border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Calendário</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center pb-8 w-full overflow-x-auto">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                onMonthChange={setCurrentMonth}
                modifiers={{ hasAppointment: monthAppointments }}
                locale={ptBR}
                className="rounded-md border shadow-sm p-4 sm:p-6 w-full max-w-full flex justify-center [--cell-size:2.5rem] sm:[--cell-size:3.5rem] md:[--cell-size:4.5rem] bg-white"
              />
            </CardContent>
          </Card>

          <DayAppointments date={date} />
        </div>

        <div className="xl:col-span-5">
          <Card className="shadow-subtle border-border/50 h-full">
            <CardHeader>
              <CardTitle className="text-lg">Agendamento Manual (Interno)</CardTitle>
            </CardHeader>
            <CardContent>
              <ScheduleForm
                selectedDate={date}
                onSuccess={() => setRefreshTrigger((prev) => prev + 1)}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
