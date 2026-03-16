import { useMemo } from 'react'
import { useMainStore } from '@/stores/main'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { BRAZIL_STATES } from '@/lib/brazil-map-data'
import { isDateInRange, interpolateColor } from '@/lib/utils'
import { DateRange } from 'react-day-picker'
import { Map } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { HeatmapSettingsDialog } from './HeatmapSettingsDialog'

export function BrazilMapDashboard({ dateRange }: { dateRange: DateRange | undefined }) {
  const { state } = useMainStore()

  const stateVisits = useMemo(() => {
    const counts: Record<string, number> = {}
    state.appointments.forEach((apt) => {
      if (!isDateInRange(apt.date, dateRange)) return
      const lead = state.leads.find((l) => l.id === apt.leadId)
      if (lead?.state) {
        counts[lead.state] = (counts[lead.state] || 0) + 1
      }
    })
    return counts
  }, [state.appointments, state.leads, dateRange])

  const { minThreshold, maxThreshold, lowColor, highColor } = state.heatmapConfig

  const getStateColor = (uf: string) => {
    const count = stateVisits[uf] || 0
    if (count <= 0) return '#f1f5f9' // Empty state color (slate-100)
    const range = maxThreshold - minThreshold || 1
    const factor = (count - minThreshold) / range
    return interpolateColor(lowColor, highColor, factor)
  }

  return (
    <Card className="shadow-subtle h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/50">
        <CardTitle className="text-lg flex items-center gap-2">
          <Map className="h-5 w-5 text-muted-foreground" />
          Mapa de Visitas (Heatmap)
        </CardTitle>
        <HeatmapSettingsDialog />
      </CardHeader>
      <CardContent className="flex-1 flex flex-col items-center justify-center p-6 relative">
        <div className="w-full max-w-[450px] aspect-[1/1] relative">
          <svg viewBox="150 50 850 850" className="w-full h-full drop-shadow-sm filter">
            {BRAZIL_STATES.map((brState) => {
              const count = stateVisits[brState.id] || 0
              return (
                <Tooltip key={brState.id} delayDuration={100}>
                  <TooltipTrigger asChild>
                    <path
                      d={brState.path}
                      fill={getStateColor(brState.id)}
                      stroke="#ffffff"
                      strokeWidth="3"
                      strokeLinejoin="round"
                      className="transition-colors duration-300 hover:opacity-75 hover:stroke-foreground cursor-pointer outline-none"
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <div className="text-center">
                      <p className="font-semibold text-sm">{brState.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {count} visita{count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </svg>
        </div>

        <div className="flex items-center gap-2 mt-6 text-xs text-muted-foreground w-full max-w-[300px] bg-slate-50 p-3 rounded-lg border border-border/50">
          <span className="font-medium whitespace-nowrap">{minThreshold}</span>
          <div
            className="flex-1 h-2 rounded-full border border-border/50"
            style={{
              background: `linear-gradient(to right, ${lowColor}, ${highColor})`,
            }}
          />
          <span className="font-medium whitespace-nowrap">{maxThreshold}+ Visitas</span>
        </div>
      </CardContent>
    </Card>
  )
}
