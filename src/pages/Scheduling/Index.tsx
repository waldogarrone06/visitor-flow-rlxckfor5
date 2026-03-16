import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { ScheduleForm } from './ScheduleForm'
import { FourLabLogo } from '@/components/FourLabLogo'
import { ptBR } from 'date-fns/locale'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function SchedulingPage() {
  const [date, setDate] = useState<Date | undefined>(new Date())

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

      <div className="flex flex-col gap-6">
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
              className="rounded-md border shadow-sm p-4 sm:p-6 w-full max-w-4xl flex justify-center [--cell-size:2.5rem] sm:[--cell-size:4rem] md:[--cell-size:5rem] bg-white"
              disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
            />
          </CardContent>
        </Card>

        <Card className="shadow-subtle border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Novo Agendamento</CardTitle>
          </CardHeader>
          <CardContent>
            <ScheduleForm selectedDate={date} onSuccess={() => {}} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
