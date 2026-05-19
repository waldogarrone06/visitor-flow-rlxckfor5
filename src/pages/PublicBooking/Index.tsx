import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { FourLabLogo } from '@/components/FourLabLogo'
import { getDayScheduleData, MAX_CAPACITY_PER_SLOT } from '@/services/public-booking'
import { BookingForm } from './BookingForm'
import { supabase } from '@/lib/supabase/client'
import {
  CheckCircle2,
  Calendar as CalendarIcon,
  Clock,
  User,
  Check,
  Sun,
  Sunset,
  CalendarPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function PublicBookingPage() {
  const { userId } = useParams()
  const [date, setDate] = useState<Date | undefined>(new Date())
  const [loading, setLoading] = useState(true)
  const [selectedSlot, setSelectedSlot] = useState<any>(null)
  const [successApp, setSuccessApp] = useState<any>(null)
  const [dayData, setDayData] = useState<{
    schedule: any[]
    appointments: any[]
    lockedSlots: any[]
  }>({ schedule: [], appointments: [], lockedSlots: [] })
  const [weeklySchedule, setWeeklySchedule] = useState<number[]>([])

  const formCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function loadWeeklySchedule() {
      if (!userId) return
      const { data } = await supabase
        .from('schedule_settings')
        .select('day_of_week')
        .eq('user_id', userId)

      if (data) {
        const days = [...new Set(data.map((d: any) => d.day_of_week))]
        setWeeklySchedule(days)
      }
    }
    loadWeeklySchedule()
  }, [userId])

  useEffect(() => {
    async function loadData() {
      if (!userId || !date) return
      setLoading(true)
      const data = await getDayScheduleData(userId, date)
      setDayData(data)
      setLoading(false)
    }
    loadData()
  }, [userId, date])

  // Auto-scroll to the form when a slot is selected on mobile
  useEffect(() => {
    if (selectedSlot && formCardRef.current) {
      setTimeout(() => {
        formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 150)
    }
  }, [selectedSlot])

  const isFullDayLocked = dayData.lockedSlots.some((l) => !l.start_time || l.start_time === '')

  const availableSlots = dayData.schedule
    .filter((slot) => {
      if (isFullDayLocked) return false

      const isLocked = dayData.lockedSlots.some((l) => {
        if (!l.start_time || l.start_time === '') return true
        if (l.is_external && l.start_time && l.end_time) {
          const sStart = slot.start_time
          const sEnd =
            slot.end_time ||
            `${String(parseInt(sStart) + 1).padStart(2, '0')}:${sStart.split(':')[1]}`
          return (
            (sStart >= l.start_time && sStart < l.end_time) ||
            (sEnd > l.start_time && sEnd <= l.end_time) ||
            (sStart <= l.start_time && sEnd >= l.end_time)
          )
        }
        return l.start_time === slot.start_time
      })

      if (isLocked) return false

      const slotCount = dayData.appointments.filter((a) => a.start_time === slot.start_time).length
      return slotCount < MAX_CAPACITY_PER_SLOT
    })
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  const morningSlots = availableSlots.filter((s) => parseInt(s.start_time.split(':')[0]) < 12)
  const afternoonSlots = availableSlots.filter((s) => parseInt(s.start_time.split(':')[0]) >= 12)

  const currentStep = successApp ? 4 : !date ? 1 : !selectedSlot ? 2 : 3

  const getGoogleCalLink = () => {
    if (!successApp) return '#'
    const dStr = successApp.appointment_date.replace(/-/g, '')
    const sTime = successApp.start_time.replace(':', '') + '00'
    const eTime = successApp.end_time.replace(':', '') + '00'
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=Visita+FourLab+Nutrition&dates=${dStr}T${sTime}/${dStr}T${eTime}&details=Agendamento+confirmado`
  }

  const getOutlookLink = () => {
    if (!successApp) return '#'
    const startIso = `${successApp.appointment_date}T${successApp.start_time}:00`
    const endIso = `${successApp.appointment_date}T${successApp.end_time}:00`
    return `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&startdt=${startIso}&enddt=${endIso}&subject=Visita+FourLab+Nutrition`
  }

  if (successApp) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 animate-fade-in-up">
        <Card className="max-w-md w-full text-center py-10 border-border/50 shadow-lg">
          <CardHeader>
            <div className="mx-auto bg-green-100 rounded-full p-4 mb-4 text-green-600 shadow-sm w-fit">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            <CardTitle className="text-2xl font-bold">Agendamento Confirmado!</CardTitle>
            <CardDescription className="text-base mt-2">
              Sua visita foi agendada para{' '}
              <strong className="text-slate-900">
                {format(new Date(successApp.appointment_date + 'T12:00:00'), 'dd/MM/yyyy')}
              </strong>{' '}
              às <strong className="text-slate-900">{successApp.start_time}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex flex-col space-y-3">
              <p className="text-sm text-muted-foreground mb-2">
                Deseja adicionar o compromisso à sua agenda?
              </p>

              <Button
                variant="default"
                className="w-full gap-2 justify-start h-12 bg-blue-600 hover:bg-blue-700"
                asChild
              >
                <a href={getGoogleCalLink()} target="_blank" rel="noreferrer">
                  <CalendarIcon className="w-5 h-5" /> Adicionar ao Google Calendar
                </a>
              </Button>

              <Button variant="outline" className="w-full gap-2 justify-start h-12" asChild>
                <a href={getOutlookLink()} target="_blank" rel="noreferrer">
                  <CalendarPlus className="w-5 h-5 text-blue-500" /> Adicionar ao Outlook
                </a>
              </Button>

              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-slate-400">ou</span>
                </div>
              </div>

              <Button
                variant="ghost"
                className="w-full h-12 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                onClick={() => {
                  setSuccessApp(null)
                  setDate(undefined)
                  setSelectedSlot(null)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
              >
                Tudo certo, já confirmei minha visita (Sair)
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <FourLabLogo className="h-12 w-auto text-foreground" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Agendar Visita</h1>
            <p className="text-muted-foreground mt-2">
              Siga os passos abaixo para selecionar o melhor horário e informar seus dados.
            </p>
          </div>
        </div>

        {/* Wizard Progress */}
        <div className="relative max-w-2xl mx-auto mb-10">
          <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-200 -translate-y-1/2 rounded-full z-0" />
          <div
            className="absolute top-1/2 left-0 h-1 bg-primary -translate-y-1/2 rounded-full z-0 transition-all duration-500"
            style={{ width: `${(currentStep - 1) * 50}%` }}
          />

          <div className="relative z-10 flex justify-between">
            {[
              { num: 1, label: 'Data', icon: CalendarIcon },
              { num: 2, label: 'Horário', icon: Clock },
              { num: 3, label: 'Dados', icon: User },
            ].map((step) => {
              const isCompleted = currentStep > step.num
              const isCurrent = currentStep === step.num

              return (
                <div key={step.num} className="flex flex-col items-center">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors duration-300',
                      isCompleted
                        ? 'bg-primary border-primary text-primary-foreground'
                        : isCurrent
                          ? 'bg-background border-primary text-primary shadow-sm'
                          : 'bg-background border-slate-300 text-slate-400',
                    )}
                  >
                    {isCompleted ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <step.icon className="w-5 h-5" />
                    )}
                  </div>
                  <span
                    className={cn(
                      'mt-2 text-xs font-medium',
                      isCurrent || isCompleted ? 'text-slate-900' : 'text-slate-400',
                    )}
                  >
                    {step.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-start">
          {/* Step 1: Date */}
          <Card
            className={cn(
              'shadow-subtle border-border/50 transition-opacity duration-300',
              currentStep < 1 && 'opacity-50 pointer-events-none',
            )}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center text-sm">
                  1
                </span>
                Escolha a Data
              </CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center pb-6">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => {
                  if (d) {
                    setDate(d)
                    setSelectedSlot(null)
                  }
                }}
                locale={ptBR}
                className="rounded-md border shadow-sm p-4 w-full flex justify-center bg-white"
                disabled={(d) => {
                  const isPast = d < new Date(new Date().setHours(0, 0, 0, 0))
                  const hasSchedule = weeklySchedule.includes(d.getDay())
                  return isPast || (weeklySchedule.length > 0 && !hasSchedule)
                }}
              />
            </CardContent>
          </Card>

          <div className="space-y-6">
            {/* Step 2: Time */}
            <Card
              className={cn(
                'shadow-subtle border-border/50 transition-opacity duration-300',
                currentStep < 2 && 'opacity-50 pointer-events-none',
              )}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center text-sm">
                    2
                  </span>
                  Horários Disponíveis
                </CardTitle>
                <CardDescription>
                  {date
                    ? format(date, "dd 'de' MMMM, yyyy", { locale: ptBR })
                    : 'Selecione uma data primeiro'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
                ) : availableSlots.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum horário disponível para esta data.
                  </p>
                ) : (
                  <div className="space-y-6 animate-fade-in-up">
                    {morningSlots.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium flex items-center gap-2 text-slate-600 mb-3">
                          <Sun className="w-4 h-4 text-amber-500" /> Manhã
                        </h4>
                        <div className="grid grid-cols-3 gap-2">
                          {morningSlots.map((slot, idx) => (
                            <Button
                              key={`m-${idx}`}
                              variant={selectedSlot === slot ? 'default' : 'outline'}
                              className="w-full justify-center text-sm"
                              size="sm"
                              onClick={() => setSelectedSlot(slot)}
                            >
                              {slot.start_time}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {afternoonSlots.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium flex items-center gap-2 text-slate-600 mb-3">
                          <Sunset className="w-4 h-4 text-orange-500" /> Tarde
                        </h4>
                        <div className="grid grid-cols-3 gap-2">
                          {afternoonSlots.map((slot, idx) => (
                            <Button
                              key={`a-${idx}`}
                              variant={selectedSlot === slot ? 'default' : 'outline'}
                              className="w-full justify-center text-sm"
                              size="sm"
                              onClick={() => setSelectedSlot(slot)}
                            >
                              {slot.start_time}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 3: Form */}
            {selectedSlot && userId && date && (
              <div ref={formCardRef}>
                <Card className="shadow-subtle border-border/50 animate-fade-in-up">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <span className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center text-sm">
                        3
                      </span>
                      Confirme Seus Dados
                    </CardTitle>
                    <CardDescription>
                      Preencha os dados obrigatórios para finalizar o agendamento.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <BookingForm
                      userId={userId}
                      date={date}
                      slot={selectedSlot}
                      onSuccess={(app) => setSuccessApp(app)}
                    />
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
