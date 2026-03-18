import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from '@/hooks/use-toast'
import { FourLabLogo } from '@/components/FourLabLogo'

export default function PublicBookingPage() {
  const { userId } = useParams()
  const [date, setDate] = useState<Date | undefined>(new Date())
  const [schedule, setSchedule] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSlot, setSelectedSlot] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
  })

  useEffect(() => {
    async function loadSchedule() {
      if (!userId) return
      const { data, error } = await supabase
        .from('schedule_settings' as any)
        .select('*')
        .eq('user_id', userId)
        .eq('slot_type', 'Prescritor Exclusivo')

      if (data && !error) {
        setSchedule(data)
      }
      setLoading(false)
    }
    loadSchedule()
  }, [userId])

  const availableSlots = schedule.filter((s) => s.day_of_week === (date ? date.getDay() : -1))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSlot || !date || !userId) return

    if (!formData.name || !formData.email) {
      toast({ title: 'Erro', description: 'Preencha nome e e-mail.', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    const { error } = await supabase.from('appointments' as any).insert([
      {
        user_id: userId,
        client_name: formData.name,
        client_email: formData.email,
        client_phone: formData.phone,
        appointment_date: format(date, 'yyyy-MM-dd'),
        start_time: selectedSlot.start_time,
        end_time: selectedSlot.end_time,
        status: 'scheduled',
      },
    ])

    setSubmitting(false)

    if (error) {
      toast({
        title: 'Erro',
        description: 'Falha ao agendar. Tente novamente.',
        variant: 'destructive',
      })
    } else {
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center py-8 border-border/50 shadow-lg">
          <CardHeader>
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 text-green-600 shadow-sm">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 13l4 4L19 7"
                ></path>
              </svg>
            </div>
            <CardTitle className="text-2xl font-bold">Agendamento Confirmado!</CardTitle>
            <CardDescription className="text-base mt-2">
              Agendamento realizado com sucesso! O profissional foi notificado.
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
            <h1 className="text-3xl font-bold tracking-tight">Agendar Visita Exclusiva</h1>
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
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Carregando horários...
                  </p>
                ) : availableSlots.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum horário cadastrado para este dia da semana.
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

            {selectedSlot && (
              <Card className="shadow-subtle border-border/50 animate-slide-up">
                <CardHeader>
                  <CardTitle>3. Seus Dados</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome Completo *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        placeholder="Ex: João da Silva"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                        placeholder="joao@exemplo.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone/WhatsApp</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full mt-4 h-11 text-base"
                      disabled={submitting}
                    >
                      {submitting ? 'Confirmando...' : 'Confirmar Agendamento'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
