import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CalendarDays } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { syncCalendarService } from '@/features/syncCalendarService'
import { toast } from '@/hooks/use-toast'

interface RescheduleDialogProps {
  appointmentId: string
  currentDate: string
  currentTime: string
  onSuccess: () => void
}

export function RescheduleDialog({
  appointmentId,
  currentDate,
  currentTime,
  onSuccess,
}: RescheduleDialogProps) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(currentDate)
  const [time, setTime] = useState(currentTime)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setDate(currentDate)
    setTime(currentTime)
  }, [currentDate, currentTime])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const [h, m] = time.split(':').map(Number)
      const endTime = `${(h + 1).toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`

      const { error } = await supabase
        .from('appointments')
        .update({ appointment_date: date, start_time: time, end_time: endTime })
        .eq('id', appointmentId)

      if (error) throw error

      try {
        const result = await syncCalendarService.syncUpdate(appointmentId, date, time)
        if (!result.success) throw new Error(result.error)
        toast({ title: 'Evento atualizado no Google Calendar' })
      } catch (syncErr: any) {
        console.error('Calendar sync error:', syncErr)
      }

      toast({
        title: 'Reagendamento Concluído',
        description: 'A visita foi reagendada com sucesso.',
      })
      setOpen(false)
      onSuccess()
    } catch (err: any) {
      toast({ title: 'Erro ao reagendar', description: err.message, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Reagendar">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Reagendar Visita</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data</Label>
                <Input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Horário</Label>
                <Input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Salvar Alteração'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
