import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { useMainStore } from '@/stores/main'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts'
import { useMemo } from 'react'

export function DashboardCharts() {
  const { state } = useMainStore()

  const funnelData = useMemo(() => {
    const stages = ['Prospect', 'Lead', 'Agendado', 'Visitado', 'Cliente']
    return stages.map((stage) => ({
      stage,
      count: state.leads.filter((l) => l.stage === stage).length,
    }))
  }, [state.leads])

  const revenueData = [
    { month: 'Jan', revenue: 4000 },
    { month: 'Fev', revenue: 5500 },
    { month: 'Mar', revenue: 7200 },
    { month: 'Abr', revenue: 6800 },
    { month: 'Mai', revenue: 8900 },
    { month: 'Jun', revenue: 10500 },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="shadow-subtle">
        <CardHeader>
          <CardTitle className="text-lg">Funil de Vendas (CRM)</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{ count: { color: 'hsl(var(--primary))', label: 'Contatos' } }}
            className="h-[250px] w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={funnelData}
                layout="vertical"
                margin={{ top: 0, right: 0, left: 20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="stage" type="category" axisLine={false} tickLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="shadow-subtle">
        <CardHeader>
          <CardTitle className="text-lg">Previsão de Receita</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{ revenue: { color: 'hsl(var(--success))', label: 'Receita (R$)' } }}
            className="h-[250px] w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => `R$${val / 1000}k`}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-revenue)"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}
