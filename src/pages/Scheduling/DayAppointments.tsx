import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { useAuth } from '@/hooks/use-auth'
import { Loader2, Clock, User, Trash2, Copy, CheckCircle2, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { triggerDualCouponsFlow } from '@/services/coupons-flow'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/hooks/use-toast'
import { syncCalendarService } from '@/features/syncCalendarService'

interface DayAppointmentsProps {
  date: Date | undefined
  onUpdate: () => void
  onDuplicate: (appointment: any) => void
}

export function DayAppointments({ date, onUpdate, onDuplicate }: DayAppointmentsProps) {
  const { user } = useAuth()
  const [appointments, setAppointments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const fetchAppointments = useCallback(async () => {
    if (!date || !user) return
    setLoading(true)
    const dateStr = format(date, 'yyyy-MM-dd')

    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('user_id', user.id)
      .eq('appointment_date', dateStr)
      .order('start_time', { ascending: true })

    if (error) {
      console.error(error)
    } else if (data) {
      setAppointments(data)
    }
    setLoading(false)
  }, [date, user])

  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)

    try {
      if (deleteTarget.google_event_id) {
        const result = await syncCalendarService.syncDelete(deleteTarget.id)
        if (!result.success) {
          console.error('Calendar sync error:', result.error)
          toast({
            title: 'Aviso',
            description:
              'Falha ao remover evento do Google Calendar, mas o agendamento será cancelado.',
          })
        }
      }

      const { error } = await supabase.from('appointments').delete().eq('id', deleteTarget.id)

      if (error) throw error

      toast({
        title: 'Agendamento Cancelado',
        description: 'O horário foi liberado para novos agendamentos.',
      })

      setDeleteTarget(null)
      await fetchAppointments()
      onUpdate()
    } catch (err: any) {
      toast({
        title: 'Erro ao cancelar',
        description: err.message || 'Falha na operação.',
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDuplicate = (app: any) => {
    onDuplicate(app)
  }

  const handleMarkVisited = async (app: any) => {
    setProcessingId(app.id)
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'Visited' })
        .eq('id', app.id)

      if (error) throw error

      toast({
        title: 'Visita Concluída!',
        description: 'Gerando cupons Yampi (10% paciente e 30% pessoal) e enviando no WhatsApp...',
      })

      const dualResult = await triggerDualCouponsFlow({
        appointmentId: app.id,
        userId: user?.id,
      })

      if (dualResult.success) {
        if (dualResult.isExisting) {
          const pat = dualResult.coupons?.patient?.code
          const pers = dualResult.coupons?.personal?.code
          toast({
            title: 'Cupons Já Existentes',
            description: `A nutricionista já possui cupons: Paciente (${pat}) | Pessoal (${pers}).`,
          })
        } else {
          const pat = dualResult.coupons?.patient?.code
          const pers = dualResult.coupons?.personal?.code
          const comm = dualResult.communication

          if (comm?.channel === 'whatsapp' && comm.status === 'sent') {
            toast({
              title: '2 Cupons Criados e Enviados!',
              description: `Cupons (${pat} e ${pers}) enviados no WhatsApp da nutricionista.`,
            })
          } else if (comm?.channel === 'email' && comm.status === 'sent') {
            toast({
              title: '2 Cupons Criados (Enviados por E-mail)',
              description: `WhatsApp indisponível. Cupons (${pat} e ${pers}) enviados para ${comm.recipient}.`,
            })
          } else {
            toast({
              title: '2 Cupons Criados na Yampi!',
              description: `Paciente (10%): ${pat} | Pessoal (30%): ${pers}. Aviso: envio automático pendente (${comm?.error || 'verificar contato'}).`,
            })
          }
        }
      } else {
        toast({
          title: 'Visita Concluída com Aviso',
          description: `Visita registrada, mas houve falha ao emitir cupons: ${dualResult.error}`,
          variant: 'destructive',
        })
      }

      await fetchAppointments()
      onUpdate()
    } catch (err: any) {
      toast({
        title: 'Erro ao concluir visita',
        description: err.message || 'Falha na operação.',
        variant: 'destructive',
      })
    } finally {
      setProcessingId(null)
    }
  }

  if (!date) return null

  return (
    <Card className="shadow-subtle border-border/50 h-full">
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Agendamentos do Dia</span>
          <span className="text-sm font-normal text-muted-foreground">
            {format(date, 'dd/MM/yyyy')}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : appointments.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
            Nenhum agendamento para esta data.
          </div>
        ) : (
          <div className="space-y-4">
            {appointments.map((app) => (
              <div
                key={app.id}
                className="p-4 border rounded-xl bg-card flex flex-col gap-4 shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div className="space-y-1">
                    <div className="font-semibold text-base flex items-center gap-2">
                      <User className="h-4 w-4 text-primary" />
                      {app.client_name}
                    </div>
                    {app.client_email && (
                      <div className="text-sm text-muted-foreground ml-6">{app.client_email}</div>
                    )}
                    <div className="text-sm font-medium flex items-center gap-2 mt-2 bg-primary/5 text-primary w-fit px-2 py-1 rounded-md">
                      <Clock className="h-4 w-4" />
                      {app.start_time} às {app.end_time}
                    </div>
                  </div>
                  <Badge
                    variant={
                      app.status === 'Cancelled'
                        ? 'destructive'
                        : app.status === 'Visited'
                          ? 'default'
                          : 'secondary'
                    }
                    className="capitalize shadow-none"
                  >
                    {app.status === 'Scheduled'
                      ? 'Agendado'
                      : app.status === 'Visited'
                        ? 'Visitado'
                        : app.status === 'Cancelled'
                          ? 'Cancelado'
                          : app.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t">
                  {app.status !== 'Visited' && app.status !== 'Cancelled' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={processingId === app.id}
                      className="gap-1 h-8 px-2.5 text-success border-success/30 hover:bg-success/10 hover:text-success"
                      onClick={() => handleMarkVisited(app)}
                    >
                      {processingId === app.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      <span>{processingId === app.id ? 'Emitindo...' : 'Concluir Visita'}</span>
                    </Button>
                  )}
                  {app.status === 'Visited' && (app.patient_coupon || app.nutritionist_coupon) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 px-2 py-1 rounded">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      <span>Cupons: {app.patient_coupon || app.nutritionist_coupon}</span>
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 h-8 px-2"
                    onClick={() => handleDuplicate(app)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Duplicar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteTarget(app)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Cancelar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && !isDeleting && setDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Cancelamento</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja cancelar o agendamento de{' '}
                <strong>{deleteTarget?.client_name}</strong>? O horário será liberado para novos
                agendamentos. Os dados do contato serão preservados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Voltar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  handleDelete()
                }}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? 'Cancelando...' : 'Sim, Cancelar'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
