import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { FourLabLogo } from '@/components/FourLabLogo'
import { getDayScheduleData, MAX_CAPACITY_PER_SLOT } from '@/services/public-booking'
import { BookingForm } from './BookingForm'
import { CheckCircle2 } from 'lucide-react'

export default function PublicBookingPage() {
  const { userId } = useParams()
  const [date, setDate] = useState<Date | undefined>(new Date())
  const [loading, setLoading] = useState(true)
  const [selectedSlot, setSelectedSlot] = useState<any>(null)
  const [success, setSuccess] = useState(false)
  const [dayData, setDayData] = useState<{
    schedule: any[]
    appointments: any[]
    lockedSlots: any[]
  }>({ schedule: [], appointments: [], lockedSlots: [] })

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

  const isFullDayLocked = dayData.lockedSlots.some((l) => !l.start_time)

  const availableSlots = dayData.schedule
    .filter((slot) => {
      if (isFullDayLocked) return false
      if (dayData.lockedSlots.some((l) => l.start_time === slot.start_time)) return false
      const slotCount = dayData.appointments.filter((a) => a.start_time === slot.start_time).length
      return slotCount < MAX_CAPACITY_PER_SLOT
    })
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center py-10 border-border/50 shadow-lg">
          <CardHeader>
            <div className="mx-auto bg-green-100 rounded-full p-4 mb-4 text-green-600 shadow-sm w-fit">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <CardTitle className="text-2xl font-bold">Agendamento Confirmado!</CardTitle>
            <CardDescription className="text-base mt-2">
              Seu convite do Google Calendar foi enviado para o seu e-mail.
            </CardDescription>
          </CardHeader>
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
              Selecione um horário disponível para atendimento.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-start">
          <Card className="shadow-subtle border-border/50">
            <CardHeader>
              <CardTitle>1. Escolha a Data</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center pb-6">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => {
                  setDate(d)
                  setSelectedSlot(null)
                }}
                locale={ptBR}
                className="rounded-md border shadow-sm p-4 w-full flex justify-center bg-white"
                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
              />
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="shadow-subtle border-border/50">
              <CardHeader>
                <CardTitle>2. Horários Disponíveis</CardTitle>
                <CardDescription>
                  {date
                    ? format(date, "dd 'de' MMMM, yyyy", { locale: ptBR })
                    : 'Selecione uma data'}
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
                  <div className="grid grid-cols-2 gap-3">
                    {availableSlots.map((slot, idx) => (
                      <Button
                        key={idx}
                        variant={selectedSlot === slot ? 'default' : 'outline'}
                        className="w-full justify-center"
                        onClick={() => setSelectedSlot(slot)}
                      >
                        {slot.start_time} - {slot.end_time}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedSlot && userId && date && (
              <Card className="shadow-subtle border-border/50">
                <CardHeader>
                  <CardTitle>3. Seus Dados</CardTitle>
                </CardHeader>
                <CardContent>
                  <BookingForm
                    userId={userId}
                    date={date}
                    slot={selectedSlot}
                    onSuccess={() => setSuccess(true)}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
