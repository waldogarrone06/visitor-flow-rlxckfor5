import { useState, useEffect } from 'react'
import { format, isSameDay } from 'date-fns'
import {
  Users,
  Lock,
  Unlock,
  Mail,
  Phone,
  Briefcase,
  MessageCircle,
  MapPin,
  CheckCircle,
  Package,
  Send,
  ThumbsUp,
  Video,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/hooks/use-auth'
import { getDayScheduleData, MAX_CAPACITY_PER_SLOT } from '@/services/public-booking'
import { useMainStore } from '@/stores/main'
import { toast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'

export function DayAppointments({
  date,
  onUpdate,
}: {
  date: Date | undefined
  onUpdate?: () => void
}) {
  const { user } = useAuth()
  const { state, dispatch } = useMainStore()
  const [loading, setLoading] = useState(false)
  const [sendingLink, setSendingLink] = useState<string | null>(null)
  const [data, setData] = useState<{ schedule: any[]; appointments: any[]; lockedSlots: any[] }>({
    schedule: [],
    appointments: [],
    lockedSlots: [],
  })

  const loadData = async () => {
    if (!user || !date) return
    setLoading(true)
    const result = await getDayScheduleData(user.id, date)
    setData(result)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [user, date])

  const handleLockToggle = async (startTime: string | null, endTime: string | null) => {
    if (!user || !date) return
    const dateStr = format(date, 'yyyy-MM-dd')

    // Check if it's already locked internally
    const internalLocks = data.lockedSlots.filter((l) => {
      if (l.is_external) return false
      if (startTime === null) return !l.start_time // Full day match
      return l.start_time === startTime
    })

    const isLockedInternally = internalLocks.length > 0

    if (isLockedInternally) {
      // Safely bulk delete all matching locks to fix duplication anomalies
      let query = supabase
        .from('locked_slots')
        .delete()
        .eq('user_id', user.id)
        .eq('lock_date', dateStr)
      if (startTime === null) {
        query = query.is('start_time', null)
      } else {
        query = query.eq('start_time', startTime)
      }
      await query
      toast({ title: 'Desbloqueado', description: 'O horário foi liberado com sucesso.' })
    } else {
      if (startTime === null) {
        // Full day lock
        await supabase.from('locked_slots').delete().eq('user_id', user.id).eq('lock_date', dateStr)
        await supabase.from('locked_slots').insert({
          user_id: user.id,
          lock_date: dateStr,
          start_time: null,
          end_time: null,
        })
      } else {
        // Specific slot lock
        await supabase.from('locked_slots').insert({
          user_id: user.id,
          lock_date: dateStr,
          start_time: startTime,
          end_time: endTime,
        })
      }
      toast({
        title: 'Bloqueado',
        description: 'O horário foi bloqueado e não receberá mais agendamentos.',
      })
    }

    await loadData()
    if (onUpdate) onUpdate()
  }

  const handleStatusUpdate = async (appId: string, isCrm: boolean, newStatus: string) => {
    if (isCrm) {
      const app = state.appointments.find((a) => a.id === appId)
      if (app) {
        dispatch({ type: 'UPDATE_APPOINTMENT', payload: { ...app, status: newStatus as any } })
        toast({ title: 'Status Atualizado', description: `Agendamento marcado como ${newStatus}.` })
        if (onUpdate) onUpdate()
      }
    } else {
      await supabase.from('appointments').update({ status: newStatus }).eq('id', appId)
      toast({ title: 'Status Atualizado', description: `Agendamento marcado como ${newStatus}.` })
      loadData()
      if (onUpdate) onUpdate()
    }
  }

  const handleSendMeetLink = async (appointmentId: string) => {
    setSendingLink(appointmentId)
    try {
      const { data, error } = await supabase.functions.invoke('send-meet-link', {
        body: { appointmentId },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)

      toast({
        title: 'Link Enviado',
        description: data?.message || 'Link da reunião enviado com sucesso.',
      })
    } catch (e: any) {
      toast({ title: 'Erro ao enviar link', description: e.message, variant: 'destructive' })
    } finally {
      setSendingLink(null)
    }
  }

  const handleSendWhatsApp = (
    phone: string,
    name: string,
    template: 'confirm' | 'checkin' | 'thanks',
    time?: string,
  ) => {
    const cleanPhone = phone.replace(/\D/g, '')
    if (!cleanPhone)
      return toast({ title: 'Erro', description: 'Número inválido', variant: 'destructive' })

    let msg = ''
    if (template === 'confirm')
      msg = `Olá ${name}, confirmando nossa visita agendada para às ${time}.`
    if (template === 'checkin') msg = `Olá ${name}, estou a caminho para a nossa visita!`
    if (template === 'thanks') msg = `Olá ${name}, muito obrigado pela recepção na visita de hoje.`

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  if (!date) return null

  const isFullDayLocked = data.lockedSlots.some((l) => !l.start_time && !l.is_external)
  const localAppointments = state.appointments.filter(
    (a) => isSameDay(new Date(a.date), date) && a.status !== 'Cancelled',
  )

  // Collect addresses for route optimization
  const addressesForRoute: string[] = []
  localAppointments.forEach((a) => {
    const lead = state.leads.find((l) => l.id === a.leadId)
    if (lead?.address) addressesForRoute.push(lead.address)
  })

  const openRouteMap = () => {
    if (addressesForRoute.length === 0) {
      return toast({
        title: 'Sem endereços',
        description: 'Nenhum agendamento interno com endereço neste dia.',
        variant: 'destructive',
      })
    }
    const origin = 'Minha+Localizacao'
    const dest = encodeURIComponent(addressesForRoute[addressesForRoute.length - 1])
    const waypoints = addressesForRoute
      .slice(0, -1)
      .map((a) => encodeURIComponent(a))
      .join('|')
    window.open(
      `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${waypoints ? `&waypoints=${waypoints}` : ''}`,
      '_blank',
    )
  }

  return (
    <Card className="shadow-subtle border-border/50">
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b gap-4">
        <CardTitle className="text-lg">Agenda do Dia ({format(date, 'dd/MM/yyyy')})</CardTitle>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={openRouteMap}
            className="gap-2 flex-1 sm:flex-none hover:text-blue-600 hover:border-blue-200"
          >
            <MapPin className="h-4 w-4" />
            <span className="hidden sm:inline">Ver Rota</span>
          </Button>
          <Button
            variant={isFullDayLocked ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => handleLockToggle(null, null)}
            className="flex-1 sm:flex-none"
          >
            {isFullDayLocked ? (
              <>
                <Unlock className="h-4 w-4 mr-2" />{' '}
                <span className="hidden sm:inline">Desbloquear</span>
              </>
            ) : (
              <>
                <Lock className="h-4 w-4 mr-2" />{' '}
                <span className="hidden sm:inline">Bloquear Dia</span>
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {loading ? (
          <p className="text-center text-muted-foreground py-4">Carregando agenda...</p>
        ) : (
          <div className="space-y-6">
            {(() => {
              const allSlots = new Set(data.schedule.map((s) => s.start_time))
              data.appointments
                .filter((a) => a.status !== 'Cancelled')
                .forEach((a) => allSlots.add(a.start_time))
              localAppointments.forEach((a) => allSlots.add(format(new Date(a.date), 'HH:mm')))

              const mergedSchedule = Array.from(allSlots)
                .map((startTime) => {
                  const existing = data.schedule.find((s) => s.start_time === startTime)
                  if (existing) return existing
                  const parts = startTime.split(':')
                  const endHour = parseInt(parts[0], 10) + 1
                  return {
                    start_time: startTime,
                    end_time: `${endHour.toString().padStart(2, '0')}:${parts[1]}`,
                  }
                })
                .sort((a, b) => a.start_time.localeCompare(b.start_time))

              if (mergedSchedule.length === 0) {
                return (
                  <p className="text-center text-muted-foreground py-4">
                    Nenhum horário configurado ou agendado para este dia.
                  </p>
                )
              }

              return mergedSchedule.map((slot, idx) => {
                const publicApps = data.appointments
                  .filter((a) => a.start_time === slot.start_time && a.status !== 'Cancelled')
                  .map((a) => ({
                    id: a.id,
                    client_name: a.client_name,
                    client_email: a.client_email,
                    client_phone: a.client_phone,
                    type: 'Public',
                    status: a.status,
                    kit_status: a.kit_status,
                  }))

                const crmApps = localAppointments
                  .filter((a) => format(new Date(a.date), 'HH:mm') === slot.start_time)
                  .map((a) => {
                    const lead = state.leads.find((l) => l.id === a.leadId)
                    const shipment = state.shipments.find((s) => s.contactId === lead?.id)
                    return {
                      id: a.id,
                      client_name: lead?.name || 'Cliente CRM',
                      client_email: lead?.email || '',
                      client_phone: lead?.phone || '',
                      type: 'CRM',
                      status: a.status,
                      kit_status: shipment?.status || 'Sem Kit',
                    }
                  })

                const combinedApps = [...publicApps, ...crmApps]

                const internalLock = data.lockedSlots.find(
                  (l) => !l.is_external && l.start_time === slot.start_time,
                )

                const externalLock = data.lockedSlots.find((l) => {
                  if (!l.is_external || !l.start_time || !l.end_time) return false
                  const sStart = slot.start_time
                  const sEnd =
                    slot.end_time ||
                    `${String(parseInt(sStart) + 1).padStart(2, '0')}:${sStart.split(':')[1]}`
                  return (
                    (sStart >= l.start_time && sStart < l.end_time) ||
                    (sEnd > l.start_time && sEnd <= l.end_time) ||
                    (sStart <= l.start_time && sEnd >= l.end_time)
                  )
                })

                const isLockedInternal = isFullDayLocked || !!internalLock
                const isLockedExternal = !!externalLock
                const isLocked = isLockedInternal || isLockedExternal
                const capacityFull = combinedApps.length >= MAX_CAPACITY_PER_SLOT

                return (
                  <div
                    key={idx}
                    className={`p-4 border rounded-md transition-all ${isLocked ? 'bg-muted/50 border-dashed' : 'bg-white shadow-sm'}`}
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-lg text-primary">
                          {slot.start_time} - {slot.end_time}
                        </span>
                        <Badge
                          variant={
                            isLockedInternal
                              ? 'destructive'
                              : isLockedExternal
                                ? 'outline'
                                : capacityFull
                                  ? 'secondary'
                                  : 'default'
                          }
                          className={`gap-1 ${isLockedExternal ? 'border-amber-400 text-amber-600 bg-amber-50' : ''}`}
                        >
                          <Users className="h-3 w-3" /> {combinedApps.length}/
                          {MAX_CAPACITY_PER_SLOT}
                        </Badge>
                        {isLockedInternal && (
                          <Badge variant="outline" className="text-destructive border-destructive">
                            Bloqueado
                          </Badge>
                        )}
                        {isLockedExternal && (
                          <Badge
                            variant="outline"
                            className="text-amber-600 border-amber-300 bg-amber-50"
                            title="Sincronizado do seu Google Calendar"
                          >
                            Bloqueado (Google)
                          </Badge>
                        )}
                      </div>
                      {!isFullDayLocked && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (isLockedExternal && !internalLock) {
                              toast({
                                title: 'Bloqueio Externo',
                                description:
                                  'Este horário está ocupado no seu Google Agenda. Libere-o lá primeiro.',
                                variant: 'destructive',
                              })
                            } else {
                              handleLockToggle(slot.start_time, slot.end_time)
                            }
                          }}
                          className={
                            isLocked
                              ? isLockedExternal && !internalLock
                                ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-100/50'
                                : 'text-destructive'
                              : 'text-muted-foreground'
                          }
                        >
                          {isLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>

                    {combinedApps.length > 0 ? (
                      <div className="space-y-3 mt-3 pt-3 border-t">
                        {combinedApps.map((app) => (
                          <div
                            key={app.id}
                            className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 text-sm bg-slate-50 p-3 rounded border hover:bg-slate-100/50 transition-colors"
                          >
                            <div className="flex flex-col flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-semibold text-base text-slate-800">
                                  {app.client_name}
                                </span>
                                <Badge
                                  variant={app.type === 'CRM' ? 'default' : 'secondary'}
                                  className="text-[10px] h-5 py-0 px-1.5 font-normal"
                                >
                                  {app.type === 'CRM' && <Briefcase className="w-3 h-3 mr-1" />}
                                  {app.type === 'CRM' ? 'Interno' : 'Público'}
                                </Badge>
                                {app.status === 'Visited' && (
                                  <Badge
                                    variant="outline"
                                    className="text-green-600 border-green-200 bg-green-50 text-[10px] h-5 py-0 px-1.5"
                                  >
                                    Concluída
                                  </Badge>
                                )}
                                {app.status === 'Check-in' && (
                                  <Badge
                                    variant="outline"
                                    className="text-blue-600 border-blue-200 bg-blue-50 text-[10px] h-5 py-0 px-1.5"
                                  >
                                    Em andamento
                                  </Badge>
                                )}
                              </div>

                              <div className="flex flex-wrap gap-3 text-muted-foreground mt-1">
                                {app.client_email && (
                                  <span className="flex items-center gap-1">
                                    <Mail className="h-3 w-3" /> {app.client_email}
                                  </span>
                                )}
                                {app.client_phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="h-3 w-3" /> {app.client_phone}
                                  </span>
                                )}
                                {app.kit_status && app.kit_status !== 'Sem Kit' && (
                                  <span className="flex items-center gap-1 text-amber-600 font-medium">
                                    <Package className="h-3 w-3" /> Kit: {app.kit_status}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto mt-2 xl:mt-0 pt-2 xl:pt-0 border-t xl:border-0 border-border/50">
                              {/* Ações de Status */}
                              {app.status !== 'Visited' && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                                    onClick={() =>
                                      handleStatusUpdate(app.id, app.type === 'CRM', 'Check-in')
                                    }
                                  >
                                    <MapPin className="h-3.5 w-3.5" /> Check-in
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1 text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
                                    onClick={() =>
                                      handleStatusUpdate(app.id, app.type === 'CRM', 'Visited')
                                    }
                                  >
                                    <CheckCircle className="h-3.5 w-3.5" /> Concluir
                                  </Button>
                                </>
                              )}

                              {/* Templates e Links */}
                              <div className="flex items-center gap-1 bg-white p-1 rounded-md border border-slate-200 shadow-sm">
                                {app.client_phone && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-slate-500 hover:text-green-600 hover:bg-green-50"
                                      title="Confirmar Visita"
                                      onClick={() =>
                                        handleSendWhatsApp(
                                          app.client_phone!,
                                          app.client_name,
                                          'confirm',
                                          slot.start_time,
                                        )
                                      }
                                    >
                                      <MessageCircle className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                                      title="Estou a caminho"
                                      onClick={() =>
                                        handleSendWhatsApp(
                                          app.client_phone!,
                                          app.client_name,
                                          'checkin',
                                        )
                                      }
                                    >
                                      <Send className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50"
                                      title="Agradecimento"
                                      onClick={() =>
                                        handleSendWhatsApp(
                                          app.client_phone!,
                                          app.client_name,
                                          'thanks',
                                        )
                                      }
                                    >
                                      <ThumbsUp className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-slate-500 hover:text-purple-600 hover:bg-purple-50"
                                  title="Enviar Link de Reunião (WA/Email)"
                                  onClick={() => handleSendMeetLink(app.id)}
                                  disabled={sendingLink === app.id}
                                >
                                  {sendingLink === app.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Video className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic mt-2">
                        Nenhum agendamento neste horário.
                      </p>
                    )}
                  </div>
                )
              })
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
