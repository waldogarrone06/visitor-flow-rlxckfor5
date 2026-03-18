import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { ScheduleForm } from './ScheduleForm'
import { FourLabLogo } from '@/components/FourLabLogo'
import { ptBR } from 'date-fns/locale'
import { isSameDay, format } from 'date-fns'
import { Video, MapPin, ExternalLink } from 'lucide-react'
import { useMainStore } from '@/stores/main'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function SchedulingPage() {
  const [date, setDate] = useState<Date | undefined>(new Date())
  const { state } = useMainStore()

  const dayAppointments = state.appointments
    .filter((a) => date && isSameDay(new Date(a.date), date))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <FourLabLogo className="h-16 w-auto text-foreground" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Agendamento de Visitas</h1>
            <p className="text-muted-foreground">
              Selecione uma data e cadastre um novo compromisso.
            </p>
          </div>
        </div>
        <div className="w-full sm:w-64 pt-4 sm:pt-0">
          <Select defaultValue="v1">
            <SelectTrigger>
              <SelectValue placeholder="Selecione o Vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="v1">Ana Vendedora</SelectItem>
              <SelectItem value="v2">Marcos Sales</SelectItem>
              <SelectItem value="v3">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="flex flex-col gap-6 xl:col-span-7">
          <Card className="shadow-subtle border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Calendário de Disponibilidade</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center pb-8 w-full overflow-x-auto">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                locale={ptBR}
                className="rounded-md border shadow-sm p-4 sm:p-6 w-full max-w-full flex justify-center [--cell-size:2.5rem] sm:[--cell-size:3.5rem] md:[--cell-size:4.5rem] bg-white"
                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
              />
            </CardContent>
          </Card>

          <Card className="shadow-subtle border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">
                Agendamentos em {date ? format(date, 'dd/MM/yyyy') : 'Selecionado'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dayAppointments.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-6">
                  Nenhum agendamento para esta data.
                </p>
              ) : (
                <div className="space-y-3">
                  {dayAppointments.map((app) => {
                    const lead = state.leads.find((l) => l.id === app.leadId)
                    return (
                      <div
                        key={app.id}
                        className="p-4 border rounded-md bg-muted/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-primary">
                              {format(new Date(app.date), 'HH:mm')}
                            </span>
                            <span className="font-medium text-foreground">
                              {lead?.name || 'Cliente'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            {app.isVirtual ? (
                              <Video className="h-3.5 w-3.5" />
                            ) : (
                              <MapPin className="h-3.5 w-3.5" />
                            )}
                            {app.isVirtual ? 'Reunião Virtual' : 'Visita Presencial'}
                          </div>
                        </div>
                        {app.isVirtual && app.meetLink && (
                          <a
                            href={app.meetLink}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700 bg-teal-50 px-3 py-2 rounded-md font-medium transition-colors shrink-0"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Acessar Reunião
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-5">
          <Card className="shadow-subtle border-border/50 h-full">
            <CardHeader>
              <CardTitle className="text-lg">Novo Agendamento</CardTitle>
            </CardHeader>
            <CardContent>
              <ScheduleForm selectedDate={date} onSuccess={() => {}} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
