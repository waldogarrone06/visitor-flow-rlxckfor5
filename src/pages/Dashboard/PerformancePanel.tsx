import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { useMainStore } from '@/stores/main'
import { Target, TrendingUp, CheckCircle } from 'lucide-react'

export function PerformancePanel() {
  const { state } = useMainStore()

  const { scheduled, visited, roiData } = useMemo(() => {
    const s = state.appointments.filter((a) => a.status === 'Scheduled').length
    const v = state.appointments.filter((a) => a.status === 'Visited').length

    // Simulate some ROI progression data
    const roiProgression = [
      { name: 'Sem 1', visits: 12, leadsGenerated: 4 },
      { name: 'Sem 2', visits: 19, leadsGenerated: 7 },
      { name: 'Sem 3', visits: 15, leadsGenerated: 5 },
      { name: 'Sem 4', visits: v + s, leadsGenerated: Math.floor((v + s) * 0.4) },
    ]

    return { scheduled: s, visited: v, roiData: roiProgression }
  }, [state.appointments])

  const total = scheduled + visited
  const effectiveness = total > 0 ? Math.round((visited / total) * 100) : 0

  const pieData = [
    { name: 'Realizadas', value: visited, color: 'hsl(var(--success))' },
    { name: 'Agendadas', value: scheduled, color: 'hsl(var(--primary))' },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card className="lg:col-span-1 shadow-subtle flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Efetividade de Visitas</CardTitle>
          <CardDescription>Comparativo do ciclo atual</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col justify-center pb-6">
          <div className="h-[200px] w-full">
            <ChartContainer
              config={{
                realizadas: { label: 'Realizadas', color: 'hsl(var(--success))' },
                agendadas: { label: 'Agendadas', color: 'hsl(var(--primary))' },
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4 text-center">
            <div className="space-y-1">
              <div className="text-2xl font-bold text-success flex items-center justify-center gap-1">
                <CheckCircle className="h-5 w-5" /> {visited}
              </div>
              <p className="text-xs text-muted-foreground">Realizadas</p>
            </div>
            <div className="space-y-1 border-l border-border/50">
              <div className="text-2xl font-bold text-primary">{scheduled}</div>
              <p className="text-xs text-muted-foreground">Em Aberto</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2 shadow-subtle">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-lg">Métricas de Performance (ROI)</CardTitle>
            <CardDescription>Conversão de visitas em novos contatos</CardDescription>
          </div>
          <div className="flex items-center gap-2 bg-success/10 text-success px-3 py-1 rounded-full text-sm font-medium">
            <TrendingUp className="h-4 w-4" />
            <span>Taxa de Efetividade: {effectiveness}%</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[240px] w-full mt-4">
            <ChartContainer
              config={{
                visits: { label: 'Visitas Feitas', color: 'hsl(var(--primary))' },
                leadsGenerated: { label: 'Conversões (Leads)', color: 'hsl(var(--success))' },
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roiData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="visits"
                    fill="var(--color-visits)"
                    radius={[4, 4, 0, 0]}
                    barSize={32}
                  />
                  <Bar
                    dataKey="leadsGenerated"
                    fill="var(--color-leadsGenerated)"
                    radius={[4, 4, 0, 0]}
                    barSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
