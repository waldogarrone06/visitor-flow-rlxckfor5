import { useState, useMemo, useEffect } from 'react'
import { DateRange } from 'react-day-picker'
import { KpiCards } from './KpiCards'
import { DashboardAgenda } from './Agenda'
import { PerformancePanel } from './PerformancePanel'
import { StateVisitsTrendChart } from './StateVisitsTrendChart'
import { TopPerformersWidget } from './TopPerformersWidget'
import { UpcomingOnlineMeetings } from './UpcomingOnlineMeetings'
import { InventoryAlerts } from './InventoryAlerts'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { CalendarRange, Calendar as CalendarIcon } from 'lucide-react'
import { DateFilterType, dateFilterLabels, getDateRangeFromFilter } from '@/lib/date-filters'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'

export default function DashboardPage() {
  const [dateFilter, setDateFilter] = useState<DateFilterType>('current_month')
  const [customRange, setCustomRange] = useState<DateRange | undefined>()
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const dateRange = useMemo(() => {
    if (dateFilter === 'custom') return customRange
    return getDateRangeFromFilter(dateFilter)
  }, [dateFilter, customRange])

  const handleSelectFilter = (value: string) => {
    setDateFilter(value as DateFilterType)
  }

  const handleRangeSelect = (range: DateRange | undefined) => {
    setCustomRange(range)
    if (range?.from && range?.to) {
      setCalendarOpen(false)
    }
  }

  const formatDateRangeLabel = () => {
    if (!customRange?.from) return 'Selecionar datas'
    if (customRange.to) {
      return `${format(customRange.from, 'dd/MM/yyyy')} - ${format(customRange.to, 'dd/MM/yyyy')}`
    }
    return format(customRange.from, 'dd/MM/yyyy')
  }

  return (
    <div className="space-y-6 animate-slide-up pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visão Geral</h1>
          <p className="text-muted-foreground">Acompanhe seus agendamentos, funil e logística.</p>
        </div>

        <div className="flex items-center gap-2 flex-col sm:flex-row w-full sm:w-auto">
          <Select value={dateFilter} onValueChange={handleSelectFilter}>
            <SelectTrigger className="w-full sm:w-[200px] gap-2">
              <CalendarRange className="h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Selecione o período" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(dateFilterLabels) as DateFilterType[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {dateFilterLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {dateFilter === 'custom' && (
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full sm:w-auto justify-start text-left font-normal gap-2',
                    !customRange?.from && 'text-muted-foreground',
                  )}
                >
                  <CalendarIcon className="h-4 w-4" />
                  {formatDateRangeLabel()}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={customRange}
                  onSelect={handleRangeSelect}
                  numberOfMonths={isMobile ? 1 : 2}
                  locale={ptBR}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {dateFilter === 'custom' && (!customRange?.from || !customRange?.to) && (
        <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-md px-3 py-2">
          <CalendarRange className="h-4 w-4 shrink-0" />
          <span>Selecione um intervalo de datas no calendário acima para filtrar os dados.</span>
        </div>
      )}

      {dateFilter === 'custom' && customRange?.from && customRange?.to && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2 w-fit">
          <CalendarRange className="h-4 w-4 shrink-0" />
          <span>
            Período:{' '}
            <strong className="text-foreground">{format(customRange.from, 'dd/MM/yyyy')}</strong>{' '}
            até <strong className="text-foreground">{format(customRange.to, 'dd/MM/yyyy')}</strong>
          </span>
        </div>
      )}

      <KpiCards dateRange={dateRange} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4 flex flex-col">
          <StateVisitsTrendChart dateRange={dateRange} />
          <InventoryAlerts />
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
