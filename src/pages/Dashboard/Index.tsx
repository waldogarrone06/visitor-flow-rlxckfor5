import { useState } from 'react'
import { DateRange } from 'react-day-picker'
import { KpiCards } from './KpiCards'
import { DashboardAgenda } from './Agenda'
import { PerformancePanel } from './PerformancePanel'
import { StateVisitsTrendChart } from './StateVisitsTrendChart'
import { TopPerformersWidget } from './TopPerformersWidget'
import { UpcomingOnlineMeetings } from './UpcomingOnlineMeetings'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarIcon, X } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>()

  return (
    <div className="space-y-6 animate-slide-up pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visão Geral</h1>
          <p className="text-muted-foreground">Acompanhe seus agendamentos, funil e logística.</p>
        </div>

        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={`w-full sm:w-[280px] justify-start text-left font-normal ${!dateRange ? 'text-muted-foreground' : ''}`}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "dd 'de' MMM, yyyy", { locale: ptBR })} -{' '}
                      {format(dateRange.to, "dd 'de' MMM, yyyy", { locale: ptBR })}
                    </>
                  ) : (
                    format(dateRange.from, "dd 'de' MMM, yyyy", { locale: ptBR })
                  )
                ) : (
                  <span>Filtrar por data...</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
          {dateRange && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDateRange(undefined)}
              title="Limpar filtro"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <KpiCards dateRange={dateRange} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4 flex flex-col">
          <StateVisitsTrendChart dateRange={dateRange} />
          <TopPerformersWidget />
        </div>
        <div className="space-y-4 flex flex-col h-full">
          <UpcomingOnlineMeetings dateRange={dateRange} />
          <DashboardAgenda dateRange={dateRange} />
          <PerformancePanel dateRange={dateRange} />
        </div>
      </div>
    </div>
  )
}
