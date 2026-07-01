import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { FourLabLogo } from '@/components/FourLabLogo'
import { ptBR } from 'date-fns/locale'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import { Copy, ExternalLink } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { getIntegrations } from '@/services/settings'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RecurringSchedule } from './RecurringSchedule'
import { SpecificSchedule } from './SpecificSchedule'
import { LeadsTab } from './LeadsTab'

export default function SchedulingPage() {
  const [viewMode, setViewMode] = useState<string>('appointments')
  const [date, setDate] = useState<Date | undefined>(new Date())
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date())
  const [monthAppointments, setMonthAppointments] = useState<Date[]>([])
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [catalogLink, setCatalogLink] = useState<string | null>(null)
  const [duplicateData, setDuplicateData] = useState<any | null>(null)
  const { user } = useAuth()
  const { state } = useMainStore()

  useEffect(() => {
    if (user?.id) {
      getIntegrations(user.id).then((res) => setCatalogLink(res?.catalog_link || null))
    }
  }, [user?.id])

  useEffect(() => {
    if (!user) return

    const loadAppointments = async () => {
      const start = startOfMonth(currentMonth)
      const end = endOfMonth(currentMonth)

      const { data } = await supabase
        .from('appointments')
        .select('appointment_date')
        .eq('user_id', user.id)
        .neq('status', 'Cancelled')
        .gte('appointment_date', format(start, 'yyyy-MM-dd'))
        .lte('appointment_date', format(end, 'yyyy-MM-dd'))

      const publicDates = data
        ? data.map((d) => {
            const [year, month, day] = d.appointment_date.split('-')
            return new Date(Number(year), Number(month) - 1, Number(day))
          })
        : []

      const crmDates = state.appointments
        .filter((a) => a.status !== 'Cancelled')
        .map((a) => {
          const d = new Date(a.date)
          return new Date(d.getFullYear(), d.getMonth(), d.getDate())
        })
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
          {catalogLink ? (
            <Button
              variant="outline"
              onClick={() => window.open(catalogLink, '_blank')}
              className="gap-2"
              title="Abrir catálogo"
            >
              <ExternalLink className="h-4 w-4" /> Ver Catálogo
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled
              className="gap-2"
              title="Configure o link do catálogo nas configurações"
            >
              <ExternalLink className="h-4 w-4" /> Ver Catálogo
            </Button>
          )}
          <Button
            variant="default"
            onClick={handleCopyLink}
            className="gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <Copy className="h-4 w-4" /> Copiar Link Público
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (!user?.id) return
              const url = `${window.location.origin}/contato/${user.id}`
              navigator.clipboard.writeText(url)
              toast({
                title: 'Link copiado!',
                description: 'O link de captura de leads foi copiado.',
              })
            }}
            className="gap-2"
          >
            <Copy className="h-4 w-4" /> Copiar Link de Captura
          </Button>
        </div>
      </div>

      <Tabs value={viewMode} onValueChange={setViewMode} className="w-full">
        <TabsList className="mb-6 h-auto flex-wrap w-full justify-start bg-transparent border-b p-0 gap-4">
          <TabsTrigger
            value="appointments"
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-2 py-2"
          >
            Agenda Diária
          </TabsTrigger>
          <TabsTrigger
            value="recurring"
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-2 py-2"
          >
            Recorrente Semanal
          </TabsTrigger>
          <TabsTrigger
            value="specific"
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-2 py-2"
          >
            Exceções por Data
          </TabsTrigger>
          <TabsTrigger
            value="leads"
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-2 py-2"
          >
            Leads
          </TabsTrigger>
        </TabsList>

        <TabsContent value="appointments" className="mt-0">
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
                    modifiersClassNames={{
                      hasAppointment:
                        "relative after:content-[''] after:absolute after:bottom-[2px] sm:after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-blue-500 after:rounded-full font-bold",
                    }}
                    locale={ptBR}
                    className="rounded-md border shadow-sm p-4 sm:p-6 w-full max-w-full flex justify-center [--cell-size:2.5rem] sm:[--cell-size:3.5rem] md:[--cell-size:4.5rem] bg-white"
                  />
                </CardContent>
              </Card>

              <DayAppointments
                date={date}
                onUpdate={() => setRefreshTrigger((prev) => prev + 1)}
                onDuplicate={(app) => {
                  setDuplicateData(app)
                  toast({ title: 'Duplicação', description: 'Selecione a nova data e horário.' })
                }}
              />
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
                    duplicateData={duplicateData}
                    onDuplicateClear={() => setDuplicateData(null)}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="recurring" className="mt-0">
          <RecurringSchedule />
        </TabsContent>

        <TabsContent value="specific" className="mt-0">
          <SpecificSchedule />
        </TabsContent>

        <TabsContent value="leads" className="mt-0">
          <LeadsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
