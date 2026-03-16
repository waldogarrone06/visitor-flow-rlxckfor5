import { KpiCards } from './KpiCards'
import { DashboardAgenda } from './Agenda'
import { PerformancePanel } from './PerformancePanel'

export default function DashboardPage() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Visão Geral</h1>
        <p className="text-muted-foreground">Acompanhe seus agendamentos, funil e logística.</p>
      </div>
      <KpiCards />
      <div className="grid gap-4 md:grid-cols-2">
        <PerformancePanel />
        <DashboardAgenda />
      </div>
    </div>
  )
}
