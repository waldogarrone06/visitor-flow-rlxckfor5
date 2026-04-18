import { useState, useEffect } from 'react'
import { format, isSameDay } from 'date-fns'
import { Users, Lock, Unlock, Mail, Phone, Briefcase, MessageCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/hooks/use-auth'
import {
  getDayScheduleData,
  MAX_CAPACITY_PER_SLOT,
  toggleSlotLock,
} from '@/services/public-booking'
import { useMainStore } from '@/stores/main'

export function DayAppointments({ date }: { date: Date | undefined }) {
  const { user } = useAuth()
  const { state } = useMainStore()
  const [loading, setLoading] = useState(false)
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
    const existingLock = data.lockedSlots.find((l) => l.start_time === startTime)

    await toggleSlotLock(user.id, dateStr, startTime, endTime, !!existingLock, existingLock?.id)
    await loadData()
  }

  if (!date) return null

  const isFullDayLocked = data.lockedSlots.some((l) => !l.start_time)

  // Filter local CRM appointments for this date
  const localAppointments = state.appointments.filter((a) => isSameDay(new Date(a.date), date))

  return (
    <Card className="shadow-subtle border-border/50">
      <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
        <CardTitle className="text-lg">Agenda do Dia ({format(date, 'dd/MM/yyyy')})</CardTitle>
        <Button
          variant={isFullDayLocked ? 'destructive' : 'outline'}
          size="sm"
          onClick={() => handleLockToggle(null, null)}
        >
          {isFullDayLocked ? (
            <>
              <Unlock className="h-4 w-4 mr-2" /> Desbloquear Dia
            </>
          ) : (
            <>
              <Lock className="h-4 w-4 mr-2" /> Bloquear Dia
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className="pt-6">
        {loading ? (
          <p className="text-center text-muted-foreground py-4">Carregando agenda...</p>
        ) : data.schedule.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">
            Nenhum horário configurado para este dia da semana.
          </p>
        ) : (
          <div className="space-y-6">
            {data.schedule
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
              .map((slot, idx) => {
                // Supabase public appointments
                const publicApps = data.appointments
                  .filter((a) => a.start_time === slot.start_time)
                  .map((a) => ({
                    id: a.id,
                    client_name: a.client_name,
                    client_email: a.client_email,
                    client_phone: a.client_phone,
                    type: 'Public',
                  }))

                // Local CRM appointments
                const crmApps = localAppointments
                  .filter((a) => format(new Date(a.date), 'HH:mm') === slot.start_time)
                  .map((a) => {
                    const lead = state.leads.find((l) => l.id === a.leadId)
                    return {
                      id: a.id,
                      client_name: lead?.name || 'Cliente CRM',
                      client_email: lead?.email || '',
                      client_phone: lead?.phone || '',
                      type: 'CRM',
                    }
                  })

                const combinedApps = [...publicApps, ...crmApps]
                const isLocked =
                  isFullDayLocked || data.lockedSlots.some((l) => l.start_time === slot.start_time)
                const capacityFull = combinedApps.length >= MAX_CAPACITY_PER_SLOT

                return (
                  <div
                    key={idx}
                    className={`p-4 border rounded-md ${isLocked ? 'bg-muted/50 border-dashed' : 'bg-white shadow-sm'}`}
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-lg text-primary">
                          {slot.start_time} - {slot.end_time}
                        </span>
                        <Badge
                          variant={
                            isLocked ? 'destructive' : capacityFull ? 'secondary' : 'default'
                          }
                          className="gap-1"
                        >
                          <Users className="h-3 w-3" /> {combinedApps.length}/
                          {MAX_CAPACITY_PER_SLOT}
                        </Badge>
                        {isLocked && (
                          <Badge variant="outline" className="text-destructive border-destructive">
                            Bloqueado
                          </Badge>
                        )}
                      </div>
                      {!isFullDayLocked && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleLockToggle(slot.start_time, slot.end_time)}
                          className={isLocked ? 'text-destructive' : 'text-muted-foreground'}
                        >
                          {isLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>

                    {combinedApps.length > 0 ? (
                      <div className="space-y-2 mt-3 pt-3 border-t">
                        {combinedApps.map((app) => (
                          <div
                            key={app.id}
                            className="flex justify-between items-center text-sm bg-slate-50 p-3 rounded border"
                          >
                            <div className="flex flex-col">
                              <span className="font-medium flex items-center gap-2">
                                {app.client_name}
                                <Badge
                                  variant="outline"
                                  className="text-[10px] h-4 py-0 px-1.5 font-normal"
                                >
                                  {app.type === 'CRM' && <Briefcase className="w-3 h-3 mr-1" />}
                                  {app.type === 'CRM' ? 'Interno' : 'Público'}
                                </Badge>
                              </span>
                              <div className="flex gap-3 text-muted-foreground mt-1">
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
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {app.client_phone && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1 text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
                                  onClick={() => {
                                    const phone = app.client_phone.replace(/\D/g, '')
                                    const msg = encodeURIComponent(
                                      `Olá ${app.client_name}, tudo bem? Entrando em contato sobre o seu agendamento.`,
                                    )
                                    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
                                  }}
                                >
                                  <MessageCircle className="h-4 w-4" />
                                  <span className="hidden sm:inline">WhatsApp</span>
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        Nenhum participante agendado.
                      </p>
                    )}
                  </div>
                )
              })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
