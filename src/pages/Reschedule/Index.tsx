import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { FourLabLogo } from '@/components/FourLabLogo'
import {
  lookupVisitByCpf,
  rescheduleVisitByCpf,
  getRescheduleDayData,
  type VisitLookupResult,
} from '@/services/visit-reschedule'
import { isValidCPF, maskCPF } from '@/lib/validation'
import {
  CheckCircle2,
  Calendar as CalendarIcon,
  Clock,
  User,
  Check,
  Sun,
  Sunset,
  AlertCircle,
  RefreshCw,
  Search,
  Loader2,
  Ban,
  PartyPopper,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase/client'

type Slot = { start_time: string; end_time: string | null }

const MAX_CAPACITY_PER_SLOT = 10

// Slots ocupados no Google Calendar (busySlots da get-availability) são
// indisponíveis, como os locked. Sem hora legível: bloqueia por segurança.
const isSlotBusy = (busySlots: any[], slot: Slot) =>
  busySlots.some((b) => {
    if (!b?.start || !b?.end) return true
    const sEnd = slot.end_time || slot.start_time
    return slot.start_time < b.end && sEnd > b.start
  })

export default function ReschedulePage() {
  const { userId } = useParams()
  const [cpf, setCpf] = useState('')
  const [checking, setChecking] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [eligibility, setEligibility] = useState<VisitLookupResult | null>(null)

  // Estado da agenda (steps 2–3)
  const [date, setDate] = useState<Date | undefined>(new Date())
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successApp, setSuccessApp] = useState<any>(null)
  const [dayData, setDayData] = useState<{
    schedule: Slot[]
    lockedSlots: any[]
    busySlots: { start: string; end: string }[]
    slotCounts: Record<string, number>
    googleError: boolean
  }>({ schedule: [], lockedSlots: [], busySlots: [], slotCounts: {}, googleError: false })
  const [weeklySchedule, setWeeklySchedule] = useState<number[]>([])
  const [specificDates, setSpecificDates] = useState<string[]>([])

  const slotsRef = useRef<HTMLDivElement>(null)

  const loadDayData = useCallback(
    async (d: Date) => {
      if (!userId) return
      setLoading(true)
      setLoadError(null)
      try {
        const data = await getRescheduleDayData(userId, d)
        setDayData(data)
      } catch (e: any) {
        console.error('Falha ao carregar horários:', e?.message || e)
        setDayData({
          schedule: [],
          lockedSlots: [],
          busySlots: [],
          slotCounts: {},
          googleError: false,
        })
        setLoadError(
          'Não foi possível carregar os horários agora. Verifique sua conexão e tente novamente.',
        )
      } finally {
        setLoading(false)
      }
    },
    [userId],
  )

  useEffect(() => {
    async function loadWeeklySchedule() {
      if (!userId) return
      const [schedRes, specRes] = await Promise.all([
        supabase.from('schedule_settings').select('day_of_week').eq('user_id', userId),
        supabase
          .from('date_specific_schedules' as any)
          .select('specific_date')
          .eq('user_id', userId),
      ])
      if (schedRes.data) {
        setWeeklySchedule([...new Set(schedRes.data.map((d: any) => d.day_of_week))])
      }
      if (specRes.data) {
        setSpecificDates([...new Set(specRes.data.map((d: any) => d.specific_date))])
      }
    }
    loadWeeklySchedule()
  }, [userId])

  useEffect(() => {
    if (date && (eligibility?.action === 'remarcar' || eligibility?.action === 'nova_visita')) {
      loadDayData(date)
    }
  }, [date, eligibility?.action, loadDayData])

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return
    setLookupError(null)
    setEligibility(null)
    setSuccessApp(null)
    setSubmitError(null)

    if (!isValidCPF(cpf)) {
      setLookupError('CPF inválido. Verifique os 11 dígitos e tente novamente.')
      return
    }

    setChecking(true)
    try {
      const result = await lookupVisitByCpf(userId, cpf)
      if (result.error) {
        setLookupError(result.error)
      } else {
        setEligibility(result)
      }
    } catch (err: any) {
      setLookupError(err?.message || 'Falha ao consultar o CPF. Tente novamente.')
    } finally {
      setChecking(false)
    }
  }

  const handleReschedule = async () => {
    if (!userId || !date || !selectedSlot || !eligibility?.visit?.id) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const result = await rescheduleVisitByCpf({
        userId,
        cpf,
        date: format(date, 'yyyy-MM-dd'),
        startTime: selectedSlot.start_time,
        endTime: selectedSlot.end_time || selectedSlot.start_time,
      })
      if (!result.success && !result.ok) {
        setSubmitError(result.error || 'Não foi possível remarcar a visita. Tente novamente.')
        if (result.code === 'capacity' || result.code === 'reschedule_limit') {
          setSelectedSlot(null)
        }
        return
      }
      setSuccessApp(result.appointment)
    } catch (err: any) {
      setSubmitError(err?.message || 'Não foi possível remarcar a visita. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleNewVisit = async () => {
    // "nova_visita"/"sem_visita": segue o fluxo de agendamento normal
    // reaproveitando o contato pelo CPF (create-booking encontra o contato
    // existente e não cria linha duplicada).
    if (!userId) return
    window.location.href = `/agendar/${userId}?cpf=${encodeURIComponent(cpf)}`
  }

  const isFullDayLocked = dayData.lockedSlots.some((l) => !l.start_time || l.start_time === '')

  const availableSlots: Slot[] = dayData.schedule
    .filter((slot) => {
      if (isFullDayLocked) return false
      const isLocked = dayData.lockedSlots.some((l) => {
        if (!l.start_time || l.start_time === '') return true
        if (l.start_time && l.end_time) {
          const sStart = slot.start_time
          const sEnd = slot.end_time
          if (!sEnd) return sStart >= l.start_time && sStart < l.end_time
          return (
            (sStart >= l.start_time && sStart < l.end_time) ||
            (sEnd > l.start_time && sEnd <= l.end_time) ||
            (sStart <= l.start_time && sEnd >= l.end_time)
          )
        }
        return l.start_time === slot.start_time
      })
      if (isLocked) return false
      if (isSlotBusy(dayData.busySlots, slot)) return false
      const slotCount = dayData.slotCounts[`${slot.start_time}-${slot.end_time ?? ''}`] || 0
      return slotCount < MAX_CAPACITY_PER_SLOT
    })
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  const morningSlots = availableSlots.filter((s) => parseInt(s.start_time.split(':')[0]) < 12)
  const afternoonSlots = availableSlots.filter((s) => parseInt(s.start_time.split(':')[0]) >= 12)

  const canPick = eligibility?.action === 'remarcar' || eligibility?.action === 'nova_visita'
  // Limite de 5 remarcações: visit-lookup devolve code 'reschedule_limit' com a visita.
  const isLimitReached =
    eligibility?.action === 'sem_visita' &&
    (eligibility?.code === 'reschedule_limit' || !!eligibility?.visit)

  const currentStep = successApp ? 4 : !canPick ? 1 : !date ? 1 : !selectedSlot ? 2 : 3

  if (successApp) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 animate-fade-in-up">
        <Card className="max-w-md w-full text-center py-10 border-border/50 shadow-lg">
          <CardHeader>
            <div className="mx-auto bg-green-100 rounded-full p-4 mb-4 text-green-600 shadow-sm w-fit">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            <CardTitle className="text-2xl font-bold">Visita Remarcada!</CardTitle>
            <CardDescription className="text-base mt-2">
              Sua visita foi remarcada para{' '}
              <strong className="text-slate-900">
                {format(new Date(successApp.appointment_date + 'T12:00:00'), 'dd/MM/yyyy')}
              </strong>{' '}
              às <strong className="text-slate-900">{successApp.start_time}</strong>. Os dados do
              seu kit e rastreio permanecem inalterados.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Button
              variant="ghost"
              className="w-full h-12 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              onClick={() => {
                setSuccessApp(null)
                setEligibility(null)
                setCpf('')
                setDate(undefined)
                setSelectedSlot(null)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            >
              Tudo certo, já confirmei minha visita (Sair)
            </Button>
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
            <h1 className="text-3xl font-bold tracking-tight">Remarcar Visita</h1>
            <p className="text-muted-foreground mt-2">
              Informe seu CPF para localizar a sua visita agendada.
            </p>
          </div>
        </div>

        {/* Step 1: CPF */}
        <Card
          className={cn(
            'shadow-subtle border-border/50 max-w-2xl mx-auto transition-opacity duration-300',
            canPick && 'opacity-60 pointer-events-none',
          )}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center text-sm">
                1
              </span>
              Consultar CPF
            </CardTitle>
            <CardDescription>
              Localizamos a sua visita pelo CPF informado no agendamento original.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLookup} className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="space-y-2 flex-1">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  name="cpf"
                  value={cpf}
                  onChange={(e) => setCpf(maskCPF(e.target.value))}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  autoComplete="off"
                  className={lookupError ? 'border-destructive focus-visible:ring-destructive' : ''}
                />
              </div>
              <Button type="submit" disabled={checking} className="gap-2 h-10">
                {checking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Consultar
              </Button>
            </form>

            {lookupError && (
              <div className="flex items-start gap-2 mt-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{lookupError}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resultado: bloqueado <30d */}
        {eligibility?.action === 'bloqueado' && (
          <Card className="shadow-subtle border-amber-300 bg-amber-50 max-w-2xl mx-auto">
            <CardHeader>
              <div className="mx-auto bg-amber-100 rounded-full p-4 mb-2 text-amber-600 w-fit">
                <Ban className="w-8 h-8" />
              </div>
              <CardTitle className="text-center text-xl">Nova visita ainda não liberada</CardTitle>
              <CardDescription className="text-center text-base mt-2">
                Este CPF visitou há menos de 30 dias. Uma nova visita pode ser agendada a partir de{' '}
                <strong className="text-slate-900">
                  {eligibility.released_at
                    ? format(new Date(eligibility.released_at + 'T12:00:00'), 'dd/MM/yyyy')
                    : '—'}
                </strong>
                .
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Resultado: limite de remarcações (5) */}
        {isLimitReached && (
          <Card className="shadow-subtle border-destructive/40 bg-destructive/5 max-w-2xl mx-auto">
            <CardHeader>
              <div className="mx-auto bg-destructive/10 rounded-full p-4 mb-2 text-destructive w-fit">
                <AlertCircle className="w-8 h-8" />
              </div>
              <CardTitle className="text-center text-xl">Limite de remarcações alcançado</CardTitle>
              <CardDescription className="text-center text-base mt-2">
                Você já alcançou o limite de remarcações. Fale com o seu representante, por favor.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Resultado: sem visita / nova visita */}
        {(eligibility?.action === 'nova_visita' || eligibility?.action === 'sem_visita') &&
          !isLimitReached && (
            <Card className="shadow-subtle border-border/50 max-w-2xl mx-auto">
              <CardHeader>
                <div className="mx-auto bg-blue-100 rounded-full p-4 mb-2 text-blue-600 w-fit">
                  <PartyPopper className="w-8 h-8" />
                </div>
                <CardTitle className="text-center text-xl">
                  {eligibility.action === 'nova_visita'
                    ? 'Você já pode agendar uma nova visita!'
                    : 'Nenhuma visita em aberto encontrada'}
                </CardTitle>
                <CardDescription className="text-center text-base mt-2">
                  Continue com o agendamento normal — seus dados serão reaproveitados pelo CPF.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleNewVisit} className="w-full gap-2 h-12">
                  <CalendarIcon className="w-5 h-5" /> Agendar nova visita
                </Button>
              </CardContent>
            </Card>
          )}

        {/* Steps 2–3: remarcar a MESMA visita (slots + confirmação) */}
        {eligibility?.action === 'remarcar' && eligibility.visit && (
          <>
            <div className="max-w-2xl mx-auto">
              <Card className="shadow-subtle border-primary/30 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <div className="bg-primary/10 text-primary rounded-full p-2.5 shrink-0">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="text-sm">
                      <p className="font-medium">Visita encontrada</p>
                      <p className="text-muted-foreground mt-0.5">
                        Agendada para{' '}
                        <strong className="text-slate-900">
                          {format(
                            new Date(eligibility.visit.appointment_date + 'T12:00:00'),
                            'dd/MM/yyyy',
                          )}
                        </strong>{' '}
                        às{' '}
                        <strong className="text-slate-900">{eligibility.visit.start_time}</strong>
                        {eligibility.visit.reschedule_count > 0 && (
                          <>
                            {' '}
                            · {eligibility.visit.reschedule_count} remarcação(ões) já realizada(s)
                          </>
                        )}
                        .
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Escolha um novo horário abaixo — a mesma visita será atualizada, sem criar
                        agendamento novo.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div ref={slotsRef} className="grid md:grid-cols-2 gap-8 items-start">
              {/* Step 2: Data */}
              <Card className="shadow-subtle border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center text-sm">
                      2
                    </span>
                    Escolha a Nova Data
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
                      if (isPast) return true
                      const dStr = format(d, 'yyyy-MM-dd')
                      if (specificDates.includes(dStr)) return false
                      if (weeklySchedule.length > 0 && !weeklySchedule.includes(d.getDay()))
                        return true
                      return false
                    }}
                  />
                </CardContent>
              </Card>

              {/* Step 3: Horário */}
              <Card className="shadow-subtle border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="bg-primary/10 text-primary w-6 h-6 rounded-full flex items-center justify-center text-sm">
                      3
                    </span>
                    Horários Disponíveis
                  </CardTitle>
                  <CardDescription>
                    {date ? format(date, "dd 'de' MMMM, yyyy", { locale: ptBR }) : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
                  ) : loadError ? (
                    <div className="flex flex-col items-center gap-3 py-6 text-center">
                      <AlertCircle className="w-8 h-8 text-destructive" />
                      <p className="text-sm text-muted-foreground max-w-xs">{loadError}</p>
                      <Button size="sm" variant="outline" onClick={() => date && loadDayData(date)}>
                        <RefreshCw className="w-4 h-4 mr-1" /> Tentar novamente
                      </Button>
                    </div>
                  ) : dayData.googleError ? (
                    <div className="flex flex-col items-center gap-3 py-6 text-center">
                      <AlertCircle className="w-8 h-8 text-amber-500" />
                      <p className="text-sm text-muted-foreground max-w-xs">
                        Agenda indisponível temporariamente — tente novamente.
                      </p>
                    </div>
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
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {morningSlots.map((slot, idx) => (
                              <Button
                                key={`m-${idx}`}
                                variant={
                                  selectedSlot?.start_time === slot.start_time &&
                                  selectedSlot?.end_time === slot.end_time
                                    ? 'default'
                                    : 'outline'
                                }
                                className="w-full justify-center text-xs px-1"
                                size="sm"
                                onClick={() => setSelectedSlot(slot)}
                              >
                                {slot.start_time} - {slot.end_time}
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
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {afternoonSlots.map((slot, idx) => (
                              <Button
                                key={`a-${idx}`}
                                variant={
                                  selectedSlot?.start_time === slot.start_time &&
                                  selectedSlot?.end_time === slot.end_time
                                    ? 'default'
                                    : 'outline'
                                }
                                className="w-full justify-center text-xs px-1"
                                size="sm"
                                onClick={() => setSelectedSlot(slot)}
                              >
                                {slot.start_time} - {slot.end_time}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedSlot && (
                        <div className="pt-2 space-y-3">
                          {submitError && (
                            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                              <span>{submitError}</span>
                            </div>
                          )}
                          <Button
                            className="w-full h-12 gap-2"
                            onClick={handleReschedule}
                            disabled={submitting}
                          >
                            {submitting ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                            Confirmar remarcação para {selectedSlot.start_time} -{' '}
                            {selectedSlot.end_time}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* Rodapé de navegação */}
        {canPick && (
          <div className="max-w-2xl mx-auto text-center">
            <Link
              to={`/agendar/${userId}`}
              className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
            >
              Prefiro agendar uma visita nova
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
