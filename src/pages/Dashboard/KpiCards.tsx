import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CalendarCheck, Users, Package, Star } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import { DateRange } from 'react-day-picker'
import { format } from 'date-fns'

interface KpiData {
  totalVisits: number
  totalPrescribers: number
  totalKits: number
  averageNps: number
  hasNps: boolean
}

export function KpiCards({ dateRange }: { dateRange?: DateRange }) {
  const { user } = useAuth()
  const [data, setData] = useState<KpiData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const fetchKpis = async () => {
      setLoading(true)
      try {
        const fromDate = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : null
        const toDate = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : null

        let visitsQuery = supabase
          .from('appointments')
          .select('id', { count: 'exact' })
          .eq('user_id', user.id)
        if (fromDate) visitsQuery = visitsQuery.gte('appointment_date', fromDate)
        if (toDate) visitsQuery = visitsQuery.lte('appointment_date', toDate)
        const { count: totalVisits } = await visitsQuery

        const { count: totalPrescribers } = await supabase
          .from('contacts')
          .select('id', { count: 'exact' })
          .eq('user_id', user.id)

        let kitsQuery = supabase
          .from('kits')
          .select('id', { count: 'exact' })
          .eq('user_id', user.id)
        if (fromDate) kitsQuery = kitsQuery.gte('created_at', fromDate)
        if (toDate) kitsQuery = kitsQuery.lte('created_at', toDate + 'T23:59:59')
        const { count: totalKits } = await kitsQuery

        let npsAptsQuery = supabase.from('appointments').select('id').eq('user_id', user.id)
        if (fromDate) npsAptsQuery = npsAptsQuery.gte('appointment_date', fromDate)
        if (toDate) npsAptsQuery = npsAptsQuery.lte('appointment_date', toDate)
        const { data: userAppointments } = await npsAptsQuery

        let averageNps = 0
        let hasNps = false
        if (userAppointments && userAppointments.length > 0) {
          const appointmentIds = userAppointments.map((a) => a.id)
          const { data: npsData } = await supabase
            .from('nps_responses')
            .select('score')
            .in('appointment_id', appointmentIds)

          if (npsData && npsData.length > 0) {
            averageNps = npsData.reduce((sum, n) => sum + n.score, 0) / npsData.length
            hasNps = true
          }
        }

        setData({
          totalVisits: totalVisits || 0,
          totalPrescribers: totalPrescribers || 0,
          totalKits: totalKits || 0,
          averageNps: Math.round(averageNps * 10) / 10,
          hasNps,
        })
      } catch (err) {
        console.error('Error fetching KPIs:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchKpis()
  }, [user, dateRange])

  const kpis = [
    {
      title: 'Total de Visitas',
      value: data?.totalVisits,
      icon: CalendarCheck,
      color: 'text-primary',
      trend: 'No período',
    },
    {
      title: 'Prescritores',
      value: data?.totalPrescribers,
      icon: Users,
      color: 'text-success',
      trend: 'Cadastrados',
    },
    {
      title: 'Kits Solicitados',
      value: data?.totalKits,
      icon: Package,
      color: 'text-blue-500',
      trend: 'Total',
    },
    {
      title: 'NPS Médio',
      value: data?.hasNps ? data.averageNps.toFixed(1) : 'N/A',
      icon: Star,
      color: 'text-amber-500',
      trend: 'Avaliação média',
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi, i) => (
        <Card key={i} className="border-border/50 shadow-subtle hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.title}</CardTitle>
            <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{kpi.value ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">{kpi.trend}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
