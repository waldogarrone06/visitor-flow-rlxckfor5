import { useState, useEffect } from 'react'
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
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    specialty: '',
    professional_id: '',
    clinic_address: '',
  })

  useEffect(() => {
    const savedName = localStorage.getItem('fourlab_booking_name')
    const savedEmail = localStorage.getItem('fourlab_booking_email')
    const savedPhone = localStorage.getItem('fourlab_booking_phone')
    const savedSpecialty = localStorage.getItem('fourlab_booking_specialty')
    const savedProfId = localStorage.getItem('fourlab_booking_prof_id')
    const savedAddress = localStorage.getItem('fourlab_booking_address')

    if (savedName || savedEmail || savedPhone) {
      setFormData({
        name: savedName || '',
        email: savedEmail || '',
        phone: savedPhone || '',
        specialty: savedSpecialty || '',
        professional_id: savedProfId || '',
        clinic_address: savedAddress || '',
      })
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.email || !formData.phone || !formData.specialty) {
      toast({
        title: 'Campos Obrigatórios',
        description: 'Preencha nome, e-mail, telefone e especialidade.',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      localStorage.setItem('fourlab_booking_name', formData.name)
      localStorage.setItem('fourlab_booking_email', formData.email)
      localStorage.setItem('fourlab_booking_phone', formData.phone)
      localStorage.setItem('fourlab_booking_specialty', formData.specialty)
      localStorage.setItem('fourlab_booking_prof_id', formData.professional_id)
      localStorage.setItem('fourlab_booking_address', formData.clinic_address)

      const newApp = await createPublicAppointment({
        user_id: userId,
        client_name: formData.name,
        client_email: formData.email,
        client_phone: formData.phone,
        specialty: formData.specialty,
        professional_id: formData.professional_id,
        clinic_address: formData.clinic_address,
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
    <form onSubmit={handleSubmit} className="space-y-6 animate-slide-up">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <Label htmlFor="phone">Telefone/WhatsApp *</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            required
            placeholder="(00) 00000-0000"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="specialty">Especialidade *</Label>
          <Input
            id="specialty"
            value={formData.specialty}
            onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
            required
            placeholder="Ex: Nutricionista Esportiva"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="professional_id">Registro Profissional (CRN/CRM)</Label>
          <Input
            id="professional_id"
            value={formData.professional_id}
            onChange={(e) => setFormData({ ...formData, professional_id: e.target.value })}
            placeholder="Ex: CRN 12345"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="clinic_address">Endereço da Clínica / Consultório</Label>
          <Input
            id="clinic_address"
            value={formData.clinic_address}
            onChange={(e) => setFormData({ ...formData, clinic_address: e.target.value })}
            placeholder="Av. Exemplo, 100 - Sala 2, São Paulo - SP"
          />
        </div>
      </div>
      <Button type="submit" className="w-full h-12 text-base font-medium" disabled={submitting}>
        {submitting ? 'Confirmando Agendamento...' : 'Confirmar Agendamento'}
      </Button>
    </form>
  )
}
