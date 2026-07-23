import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useMainStore } from '@/stores/main'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface MeetingSlot {
  date: string
  meetLink?: string
  participants: number
  ids: string[]
}

interface Props {
  slot: MeetingSlot | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MeetingReportDialog({ slot, open, onOpenChange }: Props) {
  const { state, dispatch } = useMainStore()
  const [attendedIds, setAttendedIds] = useState<string[]>([])

  const leads = useMemo(
    () =>
      state.leads.filter((l) =>
        state.appointments
          .filter((a) => slot?.ids.includes(a.id))
          .map((a) => a.leadId)
          .includes(l.id),
      ),
    [state.leads, state.appointments, slot],
  )

  const existingReport = state.meetingReports?.find((r) => r.date === slot?.date)
  const isViewMode = !!existingReport

  useEffect(() => {
    if (open && slot) {
      if (existingReport) {
        setAttendedIds(existingReport.attendedLeadIds)
      } else if (state.settings?.autoGenerateParticipationReports) {
        // Simulate auto-generation by checking all participants
        setAttendedIds(leads.map((l) => l.id))
      } else {
        setAttendedIds([])
      }
    }
  }, [open, slot, existingReport, leads.length, state.settings?.autoGenerateParticipationReports])

  if (!slot) return null

  const attendanceRate =
    leads.length > 0 ? Math.round((attendedIds.length / leads.length) * 100) : 0

  const handleToggle = (leadId: string) => {
    if (isViewMode) return
    setAttendedIds((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId],
    )
  }

  const handleSave = () => {
    if (!slot) return

    const report = {
      id: `rep-${Date.now()}`,
      date: slot.date,
      meetLink: slot.meetLink || '',
      invitedLeadIds: leads.map((l) => l.id),
      attendedLeadIds: attendedIds,
      durationMinutes: 60,
    }

    const interactions = []
    if (state.settings?.autoExportToCRM) {
      leads.forEach((l) => {
        interactions.push({
          id: `int-${Date.now()}-${l.id}`,
          leadId: l.id,
          type: 'Meeting' as const,
          date: slot.date,
          description: 'Reunião Virtual via Google Meet',
          status: attendedIds.includes(l.id) ? ('Presente' as const) : ('Ausente' as const),
          link: slot.meetLink,
          durationMinutes: 60,
        })
      })
    }

    dispatch({
      type: 'SAVE_MEETING_REPORT',
      payload: {
        report,
        interactions,
        appointmentIds: slot.ids,
      },
    })

    toast.success('Relatório Salvo', {
      description: state.settings?.autoExportToCRM
        ? 'Participação registrada e prontuários atualizados com sucesso.'
        : 'Relatório de participação gerado com sucesso.',
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Relatório de Participação</DialogTitle>
          <DialogDescription>
            {format(new Date(slot.date), "dd 'de' MMMM, yyyy 'às' HH:mm", { locale: ptBR })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="bg-muted/50 p-4 rounded-lg space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground font-medium">Taxa de Presença</span>
              <span className="font-bold">{attendanceRate}%</span>
            </div>
            <Progress value={attendanceRate} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {attendedIds.length} de {leads.length} convidados presentes.
            </p>
          </div>

          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Convidados ({leads.length})
            </h4>
            {leads.map((lead) => {
              const isAttended = attendedIds.includes(lead.id)
              return (
                <div
                  key={lead.id}
                  className={`flex items-center justify-between p-2 rounded-md border transition-colors ${
                    isAttended
                      ? 'bg-success/10 border-success/30'
                      : 'bg-background border-border/50'
                  }`}
                  onClick={() => handleToggle(lead.id)}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src={`https://img.usecurling.com/ppl/thumbnail?gender=male&seed=${lead.avatarSeed || 1}`}
                      />
                      <AvatarFallback>{lead.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{lead.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {lead.company || lead.type}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isViewMode && (
                      <Badge
                        variant={isAttended ? 'default' : 'secondary'}
                        className={isAttended ? 'bg-success hover:bg-success/90' : ''}
                      >
                        {isAttended ? 'Presente' : 'Ausente'}
                      </Badge>
                    )}
                    {!isViewMode && (
                      <Checkbox
                        checked={isAttended}
                        onCheckedChange={() => handleToggle(lead.id)}
                        className="data-[state=checked]:bg-success data-[state=checked]:text-success-foreground data-[state=checked]:border-success"
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <DialogFooter className="sm:justify-between items-center border-t pt-4">
          {isViewMode ? (
            <p className="text-xs text-muted-foreground w-full text-center">
              Este relatório já foi finalizado e os prontuários foram atualizados.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground max-w-[200px]">
                {state.settings?.autoExportToCRM
                  ? 'Os dados serão exportados para o prontuário de cada prescritor.'
                  : 'A exportação para CRM está desativada.'}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSave}>Salvar Relatório</Button>
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
