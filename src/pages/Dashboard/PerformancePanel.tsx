import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { useMainStore } from '@/stores/main'
import { CheckCircle } from 'lucide-react'

export function PerformancePanel() {
  const { state } = useMainStore()

  const { scheduled, visited } = useMemo(() => {
    const s = state.appointments.filter((a) => a.status === 'Scheduled').length
    const v = state.appointments.filter((a) => a.status === 'Visited').length
    return { scheduled: s, visited: v }
  }, [state.appointments])

  const pieData = [
    { name: 'Realizadas', value: visited, color: 'hsl(var(--success))' },
    { name: 'Agendadas', value: scheduled, color: 'hsl(var(--primary))' },
  ]

  return (
    <Card className="shadow-subtle flex flex-col h-full">
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
  )
}
