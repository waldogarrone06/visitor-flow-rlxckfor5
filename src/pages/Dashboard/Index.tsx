import { KpiCards } from './KpiCards'
import { DashboardCharts } from './Charts'
import { DashboardAgenda } from './Agenda'

export default function DashboardPage() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Visão Geral</h1>
        <p className="text-muted-foreground">Acompanhe seus agendamentos, funil e logística.</p>
      </div>
      <KpiCards />
      <DashboardCharts />
      <div className="grid gap-4 md:grid-cols-2">
        <DashboardAgenda />
        {/* Placeholder for future widgets to keep layout balanced */}
        <div className="rounded-lg border border-dashed border-border/60 bg-slate-50/50 flex flex-col items-center justify-center p-8 text-center text-muted-foreground min-h-[300px]">
          <p className="text-sm font-medium">Espaço para novos widgets</p>
          <p className="text-xs mt-1">Ex: Timeline de atividades recentes</p>
        </div>
      </div>
    </div>
  )
}
