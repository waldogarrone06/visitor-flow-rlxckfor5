import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { createPublicAppointment } from '@/services/public-booking'
import { format } from 'date-fns'

interface BookingFormProps {
  userId: string
  date: Date
  slot: any
  onSuccess: (appointment: any) => void
}

export function BookingForm({ userId, date, slot, onSuccess }: BookingFormProps) {
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({ name: '', email: '', phone: '' })

  useEffect(() => {
    const savedName = localStorage.getItem('fourlab_booking_name')
    const savedEmail = localStorage.getItem('fourlab_booking_email')
    const savedPhone = localStorage.getItem('fourlab_booking_phone')
    if (savedName || savedEmail || savedPhone) {
      setFormData({
        name: savedName || '',
        email: savedEmail || '',
        phone: savedPhone || '',
      })
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.email) {
      toast({ title: 'Erro', description: 'Preencha nome e e-mail.', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      localStorage.setItem('fourlab_booking_name', formData.name)
      localStorage.setItem('fourlab_booking_email', formData.email)
      localStorage.setItem('fourlab_booking_phone', formData.phone)

      const newApp = await createPublicAppointment({
        user_id: userId,
        client_name: formData.name,
        client_email: formData.email,
        client_phone: formData.phone,
        appointment_date: format(date, 'yyyy-MM-dd'),
        start_time: slot.start_time,
        end_time: slot.end_time,
        status: 'scheduled',
      })
      onSuccess(newApp)
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Falha ao agendar. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-slide-up">
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
      <Button type="submit" className="w-full h-11 text-base" disabled={submitting}>
        {submitting ? 'Confirmando...' : 'Confirmar Agendamento'}
      </Button>
    </form>
  )
}
