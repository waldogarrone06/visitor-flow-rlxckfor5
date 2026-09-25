import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useMainStore } from '@/stores/main'
import { supabase } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { CheckCircle2, Clock, Trash2, Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { format, isToday, isTomorrow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from '@/hooks/use-toast'
import { DateRange } from 'react-day-picker'
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
import { syncCalendarService } from '@/features/syncCalendarService'
import { triggerDualCouponsFlow } from '@/services/coupons-flow'
import { RescheduleDialog } from './RescheduleDialog'

interface DbAppointment {
  id: string
  client_name: string
  appointment_date: string
  start_time: string
  end_time: string
  status: string | null
  nutritionist_coupon?: string | null
  patient_coupon?: string | null
}

export function DashboardAgenda({ dateRange }: { dateRange?: DateRange }) {
  const { user } = useAuth()
  const { dispatch } = useMainStore()
  const [appointments, setAppointments] = useState<DbAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const fetchAppointments = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      let query = supabase
        .from('appointments')
        .select(
          'id, client_name, appointment_date, start_time, end_time, status, nutritionist_coupon, patient_coupon',
        )
        .eq('user_id', user.id)
        .neq('status', 'Cancelled')
        .order('appointment_date', { ascending: true })
        .order('start_time', { ascending: true })

      if (dateRange?.from) {
        query = query.gte('appointment_date', format(dateRange.from, 'yyyy-MM-dd'))
      } else {
        query = query.gte('appointment_date', format(new Date(), 'yyyy-MM-dd'))
      }
      if (dateRange?.to) {
        query = query.lte('appointment_date', format(dateRange.to, 'yyyy-MM-dd'))
      }

      const { data } = await query.limit(5)
      setAppointments(data || [])
    } catch (err) {
      console.error('Error fetching appointments:', err)
    } finally {
      setLoading(false)
    }
  }, [user, dateRange])

  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const { error } = await supabase.from('appointments').delete().eq('id', deleteTarget.id)
      if (error) throw error
      try {
        await syncCalendarService.syncDelete(deleteTarget.id)
      } catch (e) {
        console.error('Calendar sync error:', e)
      }
      setAppointments((prev) => prev.filter((a) => a.id !== deleteTarget.id))
      toast({
        title: 'Agendamento Cancelado',
        description: 'O horário foi liberado para novos agendamentos.',
      })
      setDeleteTarget(null)
    } catch (err: any) {
      toast({ title: 'Erro ao cancelar', description: err.message, variant: 'destructive' })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleMarkVisited = async (id: string, aptName?: string) => {
    setProcessingId(id)
    try {
      // 1. Atualizar status da visita no Supabase
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'Visited' })
        .eq('id', id)
      if (error) throw error

      dispatch({ type: 'MARK_VISITED', payload: { appointmentId: id } })
      setAppointments((prev) => prev.filter((a) => a.id !== id))

      // 2. Disparar automaticamente o fluxo de cupons duplos (10% paciente, 30% pessoal) e envio no WhatsApp
      toast({
        title: 'Visita Realizada!',
        description: 'Gerando cupons Yampi (10% paciente e 30% pessoal) e enviando no WhatsApp...',
      })

      const dualResult = await triggerDualCouponsFlow({
        appointmentId: id,
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
              description: `Cupons (${pat} e ${pers}) enviados com sucesso no WhatsApp da nutricionista.`,
            })
          } else if (comm?.channel === 'email' && comm.status === 'sent') {
            toast({
              title: '2 Cupons Criados (Enviados por E-mail)',
              description: `WhatsApp indisponível. Cupons (${pat} e ${pers}) enviados por e-mail para ${comm.recipient}.`,
            })
          } else {
            toast({
              title: '2 Cupons Criados na Yampi!',
              description: `Paciente (10%): ${pat} | Pessoal (30%): ${pers}. Aviso: envio automático pendente (${comm?.error || 'verificar contato'}).`,
              variant: 'default',
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
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setProcessingId(null)
    }
  }

  const getDateLabel = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    if (isToday(d)) return 'Hoje'
    if (isTomorrow(d)) return 'Amanhã'
    return format(d, "dd 'de' MMM", { locale: ptBR })
  }

  return (
    <Card className="shadow-subtle flex-1 flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          Próximas Visitas
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto min-h-[200px]">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : appointments.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            Nenhum agendamento encontrado.
          </p>
        ) : (
          <div className="space-y-4">
            {appointments.map((apt) => (
              <div
                key={apt.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-slate-50/50 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 border border-border">
                    <AvatarFallback>{apt.client_name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium leading-none">{apt.client_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-normal">
                        {getDateLabel(apt.appointment_date)} às {apt.start_time}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    title="Cancelar agendamento"
                    onClick={() => setDeleteTarget({ id: apt.id, name: apt.client_name })}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                  <RescheduleDialog
                    appointmentId={apt.id}
                    currentDate={apt.appointment_date}
                    currentTime={apt.start_time}
                    onSuccess={fetchAppointments}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={processingId === apt.id}
                    className="gap-1 h-8 px-2 sm:px-3"
                    onClick={() => handleMarkVisited(apt.id, apt.client_name)}
                  >
                    {processingId === apt.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    )}
                    <span className="hidden sm:inline">
                      {processingId === apt.id ? 'Emitindo Cupons...' : 'Realizada'}
                    </span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && !isDeleting && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Cancelamento</AlertDialogTitle>
            <AlertDialogDescription>
              Cancelar o agendamento de <strong>{deleteTarget?.name}</strong>? O horário será
              liberado para novos agendamentos.
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
    </Card>
  )
}
