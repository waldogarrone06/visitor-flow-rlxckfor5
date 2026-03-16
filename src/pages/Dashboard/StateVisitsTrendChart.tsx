import { useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'
import { useMainStore } from '@/stores/main'
import { DateRange } from 'react-day-picker'
import { MapPin } from 'lucide-react'
import { isDateInRange } from '@/lib/utils'

export function StateVisitsTrendChart({ dateRange }: { dateRange?: DateRange }) {
  const { state } = useMainStore()

  const chartData = useMemo(() => {
    const visitsByState: Record<string, number> = {}

    state.appointments.forEach((apt) => {
      if (isDateInRange(apt.date, dateRange)) {
        const lead = state.leads.find((l) => l.id === apt.leadId)
        if (lead?.state) {
          visitsByState[lead.state] = (visitsByState[lead.state] || 0) + 1
        }
      }
    })

    return Object.entries(visitsByState)
      .map(([uf, total]) => ({ uf, total }))
      .sort((a, b) => b.total - a.total)
  }, [state.appointments, state.leads, dateRange])

  const chartConfig = {
    total: { label: 'Visitas', color: 'hsl(var(--primary))' },
  }

  return (
    <Card className="shadow-subtle h-full flex flex-col">
      <CardHeader className="pb-2 border-b border-border/50">
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="h-5 w-5 text-muted-foreground" />
          Visitas por Estado
        </CardTitle>
        <CardDescription>
          Volume total de visitas (agendadas e realizadas) por região
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 p-6">
        {chartData.length === 0 ? (
          <div className="h-full min-h-[300px] flex items-center justify-center text-muted-foreground">
            Sem dados no período
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-full min-h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="uf" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="total"
                  fill="var(--color-total)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={60}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
