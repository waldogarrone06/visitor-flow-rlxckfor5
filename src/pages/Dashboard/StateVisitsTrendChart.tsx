import { useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import { useMainStore } from '@/stores/main'
import { DateRange } from 'react-day-picker'
import { format, eachDayOfInterval, subDays, startOfDay, endOfDay, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { TrendingUp } from 'lucide-react'

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
]

export function StateVisitsTrendChart({ dateRange }: { dateRange?: DateRange }) {
  const { state } = useMainStore()

  const chartData = useMemo(() => {
    let start = dateRange?.from
    let end = dateRange?.to

    if (!start) {
      const dates = state.appointments.map((a) => new Date(a.date).getTime())
      if (dates.length > 0) {
        start = startOfDay(new Date(Math.min(...dates)))
        end = endOfDay(new Date(Math.max(...dates)))
      } else {
        start = subDays(new Date(), 7)
        end = new Date()
      }
    }

    if (!end) end = start

    const days = eachDayOfInterval({ start: startOfDay(start), end: endOfDay(end) })
    const statesPresent = new Set<string>()

    const data = days.map((day) => {
      const dayData: any = {
        date: format(day, 'dd/MM', { locale: ptBR }),
        originalDate: day,
        total: 0,
      }

      state.appointments.forEach((apt) => {
        if (isSameDay(new Date(apt.date), day)) {
          dayData.total += 1
          const lead = state.leads.find((l) => l.id === apt.leadId)
          if (lead?.state) {
            dayData[lead.state] = (dayData[lead.state] || 0) + 1
            statesPresent.add(lead.state)
          }
        }
      })

      return dayData
    })

    return { data, states: Array.from(statesPresent) }
  }, [state.appointments, state.leads, dateRange])

  const chartConfig = {
    total: { label: 'Total Geral', color: 'hsl(var(--primary))' },
    ...Object.fromEntries(
      chartData.states.map((uf, i) => [
        uf,
        { label: uf, color: CHART_COLORS[i % CHART_COLORS.length] },
      ]),
    ),
  }

  return (
    <Card className="shadow-subtle h-full flex flex-col">
      <CardHeader className="pb-2 border-b border-border/50">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
          Evolução de Visitas por Estado
        </CardTitle>
        <CardDescription>
          Comparativo de visitas totais (barras) e por região (linhas)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 p-6">
        {chartData.data.length === 0 ? (
          <div className="h-full min-h-[300px] flex items-center justify-center text-muted-foreground">
            Sem dados no período
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-full min-h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData.data}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar
                  dataKey="total"
                  fill="var(--color-total)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
                {chartData.states.map((uf) => (
                  <Line
                    key={uf}
                    type="monotone"
                    dataKey={uf}
                    stroke={`var(--color-${uf})`}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
