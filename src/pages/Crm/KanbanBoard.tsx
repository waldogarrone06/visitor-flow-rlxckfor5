import { useState } from 'react'
import { useMainStore } from '@/stores/main'
import { LeadStage } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { format, isSameDay, isWithinInterval, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calendar as CalendarIcon, Filter, X } from 'lucide-react'
import { DateRange } from 'react-day-picker'
import { LeadCard } from './LeadCard'

const STAGES: { id: LeadStage; label: string; color: string }[] = [
  { id: 'Agendado', label: 'Agendados', color: 'bg-blue-100 text-blue-700' },
  { id: 'Visitado', label: 'Visitados', color: 'bg-indigo-100 text-indigo-700' },
  { id: 'Revisitar', label: 'Revisitar', color: 'bg-orange-100 text-orange-700' },
]

export function KanbanBoard() {
  const { state, dispatch } = useMainStore()

  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>('all')

  const neighborhoods = Array.from(
    new Set(state.leads.map((l) => l.neighborhood).filter(Boolean)),
  ) as string[]

  const onDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData('leadId', leadId)
  }

  const onDrop = (e: React.DragEvent, stage: LeadStage) => {
    const leadId = e.dataTransfer.getData('leadId')
    if (leadId) {
      dispatch({ type: 'UPDATE_LEAD_STAGE', payload: { id: leadId, stage } })
    }
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const filteredLeads = state.leads.filter((lead) => {
    let matchesLocation = true
    if (selectedNeighborhood && selectedNeighborhood !== 'all') {
      matchesLocation = lead.neighborhood === selectedNeighborhood
    }

    let matchesDate = true
    if (dateRange?.from) {
      const leadDate = startOfDay(new Date(lead.lastInteraction))
      if (dateRange.to) {
        matchesDate = isWithinInterval(leadDate, {
          start: startOfDay(dateRange.from),
          end: startOfDay(dateRange.to),
        })
      } else {
        matchesDate = isSameDay(leadDate, dateRange.from)
      }
    }

    return matchesLocation && matchesDate
  })

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex flex-col sm:flex-row gap-4 items-center mb-6 p-4 bg-white border border-border/60 rounded-lg shadow-sm">
        <div className="flex items-center gap-2 font-medium text-sm text-muted-foreground mr-2 shrink-0">
          <Filter className="h-4 w-4" /> Filtros:
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={`w-full sm:w-[260px] justify-start text-left font-normal ${!dateRange ? 'text-muted-foreground' : ''}`}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateRange?.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, "dd 'de' MMM", { locale: ptBR })} -{' '}
                    {format(dateRange.to, "dd 'de' MMM", { locale: ptBR })}
                  </>
                ) : (
                  format(dateRange.from, "dd 'de' MMM", { locale: ptBR })
                )
              ) : (
                <span>Filtrar por data</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={setDateRange}
              numberOfMonths={1}
              locale={ptBR}
            />
          </PopoverContent>
        </Popover>

        <Select value={selectedNeighborhood} onValueChange={setSelectedNeighborhood}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Bairro / Região" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as Regiões</SelectItem>
            {neighborhoods.map((n) => (
              <SelectItem key={n} value={n}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(dateRange || selectedNeighborhood !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDateRange(undefined)
              setSelectedNeighborhood('all')
            }}
            className="text-muted-foreground hover:text-foreground w-full sm:w-auto mt-2 sm:mt-0"
          >
            <X className="h-4 w-4 mr-2" /> Limpar
          </Button>
        )}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 h-full min-h-[500px] items-stretch">
        {STAGES.map((stage) => {
          const columnLeads = filteredLeads.filter((l) => l.stage === stage.id)

          return (
            <div
              key={stage.id}
              className="flex-shrink-0 w-80 bg-slate-100/50 border border-border rounded-xl flex flex-col"
              onDrop={(e) => onDrop(e, stage.id)}
              onDragOver={onDragOver}
            >
              <div className="p-3 border-b border-border/50 flex justify-between items-center bg-slate-100/80 rounded-t-xl">
                <h3 className="font-semibold text-sm">{stage.label}</h3>
                <Badge variant="secondary" className={`${stage.color} border-none`}>
                  {columnLeads.length}
                </Badge>
              </div>
              <div className="p-3 flex-1 overflow-y-auto space-y-3">
                {columnLeads.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} onDragStart={onDragStart} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
