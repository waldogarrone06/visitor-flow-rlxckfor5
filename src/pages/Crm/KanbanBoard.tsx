import { useState, useEffect } from 'react'
import { useMainStore } from '@/stores/main'
import { LeadStage, Lead } from '@/lib/types'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
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
  const { user } = useAuth()
  const [dbLeads, setDbLeads] = useState<Lead[]>([])

  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [selectedStateFilter, setSelectedStateFilter] = useState<string>('all')

  useEffect(() => {
    if (!user) return

    const fetchAppointments = async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (data && !error) {
        const mappedLeads: Lead[] = data.map(
          (app: any) =>
            ({
              id: app.id,
              name: app.client_name,
              type: 'B2B',
              stage:
                app.status === 'visited'
                  ? 'Visitado'
                  : app.status === 'revisit'
                    ? 'Revisitar'
                    : 'Agendado',
              score: 3,
              document: '',
              address: '',
              profession: '',
              specialty: '',
              registrationNumber: '',
              phone: app.client_phone || '',
              email: app.client_email || '',
              lastInteraction: app.created_at || new Date().toISOString(),
              avatarSeed: app.client_email ? app.client_email.length : 1,
              state: 'SP', // Padrão
              meetLink: app.google_meet_link,
              confirmationCode: app.id.split('-')[0].toUpperCase(),
            }) as Lead & { meetLink?: string; confirmationCode?: string },
        )

        const unique = new Map<string, Lead>()
        mappedLeads.forEach((l) => {
          if (l.email) {
            if (!unique.has(l.email)) unique.set(l.email, l)
          } else {
            unique.set(l.id, l)
          }
        })

        setDbLeads(Array.from(unique.values()))
      }
    }

    fetchAppointments()

    const channel = supabase
      .channel('appointments-kanban-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `user_id=eq.${user.id}` },
        () => {
          fetchAppointments()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  const dbEmails = new Set(dbLeads.map((l) => l.email).filter(Boolean))
  const localLeadsFiltered = state.leads.filter((l) => !l.email || !dbEmails.has(l.email))
  const allLeads = [...localLeadsFiltered, ...dbLeads]

  const availableStates = Array.from(
    new Set(allLeads.map((l) => l.state).filter(Boolean)),
  ) as string[]

  const onDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData('leadId', leadId)
  }

  const onDrop = async (e: React.DragEvent, stage: LeadStage) => {
    const leadId = e.dataTransfer.getData('leadId')
    if (leadId) {
      const isDbLead = dbLeads.find((l) => l.id === leadId)
      if (isDbLead) {
        let newStatus = 'scheduled'
        if (stage === 'Visitado') newStatus = 'visited'
        if (stage === 'Revisitar') newStatus = 'revisit'

        await supabase.from('appointments').update({ status: newStatus }).eq('id', leadId)
        setDbLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage } : l)))
      } else {
        dispatch({ type: 'UPDATE_LEAD_STAGE', payload: { id: leadId, stage } })
      }
    }
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const filteredLeads = allLeads.filter((lead) => {
    let matchesState = true
    if (selectedStateFilter && selectedStateFilter !== 'all') {
      matchesState = lead.state === selectedStateFilter
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

    return matchesState && matchesDate
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

        <Select value={selectedStateFilter} onValueChange={setSelectedStateFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Estado / Região" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Estados</SelectItem>
            {availableStates.map((uf) => (
              <SelectItem key={uf} value={uf}>
                {uf}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(dateRange || selectedStateFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDateRange(undefined)
              setSelectedStateFilter('all')
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
