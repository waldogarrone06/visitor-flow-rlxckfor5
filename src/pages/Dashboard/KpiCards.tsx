import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, CalendarCheck, Truck, AlertTriangle } from 'lucide-react'
import { useMainStore } from '@/stores/main'

export function KpiCards() {
  const { state } = useMainStore()

  const kpis = useMemo(() => {
    const scheduled = state.appointments.filter((a) => a.status === 'Scheduled').length
    const newLeads = state.leads.filter((l) => l.stage === 'Prospect' || l.stage === 'Lead').length
    const activeShipments = state.shipments.filter(
      (s) => s.status === 'Requested' || s.status === 'In Transit',
    ).length
    const lowStock = state.kits.filter((k) => k.stock <= k.threshold).length

    return [
      {
        title: 'Visitas Agendadas',
        value: scheduled,
        icon: CalendarCheck,
        trend: '+2 esta semana',
        color: 'text-primary',
      },
      {
        title: 'Novos Leads',
        value: newLeads,
        icon: Users,
        trend: '+15% vs mês anterior',
        color: 'text-success',
      },
      {
        title: 'Kits em Trânsito',
        value: activeShipments,
        icon: Truck,
        trend: '4 entregues hoje',
        color: 'text-blue-500',
      },
      {
        title: 'Alertas de Estoque',
        value: lowStock,
        icon: AlertTriangle,
        trend: 'Atenção necessária',
        color: lowStock > 0 ? 'text-destructive' : 'text-muted-foreground',
      },
    ]
  }, [state])

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi, i) => (
        <Card key={i} className="border-border/50 shadow-subtle hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.title}</CardTitle>
            <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{kpi.trend}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
