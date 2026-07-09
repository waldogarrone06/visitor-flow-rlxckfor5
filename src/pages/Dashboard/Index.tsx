import { useState, useMemo } from 'react'
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
import { CalendarRange } from 'lucide-react'
import { DateFilterType, dateFilterLabels, getDateRangeFromFilter } from '@/lib/date-filters'

export default function DashboardPage() {
  const [dateFilter, setDateFilter] = useState<DateFilterType>('current_month')
  const dateRange = useMemo(() => getDateRangeFromFilter(dateFilter), [dateFilter])

  return (
    <div className="space-y-6 animate-slide-up pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visão Geral</h1>
          <p className="text-muted-foreground">Acompanhe seus agendamentos, funil e logística.</p>
        </div>

        <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilterType)}>
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
      </div>

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
