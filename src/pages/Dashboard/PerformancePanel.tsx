import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { CheckCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { DateRange } from 'react-day-picker'
import { format } from 'date-fns'

export function PerformancePanel({ dateRange }: { dateRange?: DateRange }) {
  const { user } = useAuth()
  const [stats, setStats] = useState<{ scheduled: number; visited: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const fetchStats = async () => {
      setLoading(true)
      let query = supabase.from('appointments').select('status').eq('user_id', user.id)

      if (dateRange?.from) {
        query = query.gte('appointment_date', format(dateRange.from, 'yyyy-MM-dd'))
      }
      if (dateRange?.to) {
        query = query.lte('appointment_date', format(dateRange.to, 'yyyy-MM-dd'))
      }

      const { data } = await query
      const scheduled = (data || []).filter((a) => a.status?.toLowerCase() === 'scheduled').length
      const visited = (data || []).filter((a) => a.status?.toLowerCase() === 'visited').length
      setStats({ scheduled, visited })
      setLoading(false)
    }
    fetchStats()
  }, [user, dateRange])

  const pieData = useMemo(
    () => [
      { name: 'Realizadas', value: stats?.visited || 0, color: 'hsl(var(--success))' },
      { name: 'Agendadas', value: stats?.scheduled || 0, color: 'hsl(var(--primary))' },
    ],
    [stats],
  )

  const isEmpty = !loading && stats?.scheduled === 0 && stats?.visited === 0

  return (
    <Card className="shadow-subtle flex flex-col h-full min-h-[300px]">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Efetividade de Visitas</CardTitle>
        <CardDescription>Comparativo do período selecionado</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-center pb-6">
        {loading ? (
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="h-[140px] w-[140px] rounded-full" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma visita encontrada no período.</p>
          </div>
        ) : (
          <>
            <div className="h-[180px] w-full">
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
                      innerRadius={50}
                      outerRadius={70}
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
                  <CheckCircle className="h-5 w-5" /> {stats?.visited || 0}
                </div>
                <p className="text-xs text-muted-foreground">Realizadas</p>
              </div>
              <div className="space-y-1 border-l border-border/50">
                <div className="text-2xl font-bold text-primary">{stats?.scheduled || 0}</div>
                <p className="text-xs text-muted-foreground">Em Aberto</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
