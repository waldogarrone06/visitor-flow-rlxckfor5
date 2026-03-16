import { useMainStore } from '@/stores/main'
import { LeadStage, Lead } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { format } from 'date-fns'

const STAGES: { id: LeadStage; label: string; color: string }[] = [
  { id: 'Agendado', label: 'Agendados', color: 'bg-blue-100 text-blue-700' },
  { id: 'Visitado', label: 'Visitados', color: 'bg-indigo-100 text-indigo-700' },
]

export function KanbanBoard() {
  const { state, dispatch } = useMainStore()

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

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 pt-2 h-[calc(100vh-220px)] min-h-[500px]">
      {STAGES.map((stage) => {
        const columnLeads = state.leads.filter((l) => l.stage === stage.id)

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
  )
}

function LeadCard({
  lead,
  onDragStart,
}: {
  lead: Lead
  onDragStart: (e: React.DragEvent, id: string) => void
}) {
  const { state } = useMainStore()
  const kit = lead.assignedKitId ? state.kits.find((k) => k.id === lead.assignedKitId) : null

  return (
    <Card
      draggable
      onDragStart={(e) => onDragStart(e, lead.id)}
      className="cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow border-border/60"
    >
      <CardContent className="p-3">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={`https://img.usecurling.com/ppl/thumbnail?gender=female&seed=${lead.avatarSeed || 1}`}
              />
              <AvatarFallback>{lead.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium leading-none truncate w-[140px]">{lead.name}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {lead.type === 'B2B' ? lead.company : 'Consumidor'}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] px-1 h-4">
            {lead.score} ⭐
          </Badge>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <div className="text-xs text-muted-foreground flex justify-between items-center w-full">
            <span>{format(new Date(lead.lastInteraction), 'dd/MM/yyyy')}</span>
          </div>
          {kit && (
            <Badge
              variant="secondary"
              className="w-fit text-[10px] bg-primary/10 text-primary hover:bg-primary/20 pointer-events-none"
            >
              Kit Atribuído: {kit.name}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
