import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { createPublicAppointment } from '@/services/public-booking'
import { format } from 'date-fns'
import { useMainStore } from '@/stores/main'
import { Lead } from '@/lib/types'
import { syncCalendarService } from '@/features/syncCalendarService'
import { Loader2 } from 'lucide-react'

interface BookingFormProps {
  userId: string
  date: Date
  slot: any
  onSuccess: (appointment: any) => void
}

export function BookingForm({ userId, date, slot, onSuccess }: BookingFormProps) {
  const [submitting, setSubmitting] = useState(false)
  const { dispatch } = useMainStore()
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({})
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    document: '',
    specialty: '',
    professional_id: '',
    clinic_address: '',
    instagram: '',
    patientsPerMonth: '',
  })

  useEffect(() => {
    const savedName = localStorage.getItem('fourlab_booking_name')
    const savedEmail = localStorage.getItem('fourlab_booking_email')
    const savedPhone = localStorage.getItem('fourlab_booking_phone')
    const savedDocument = localStorage.getItem('fourlab_booking_document')
    const savedSpecialty = localStorage.getItem('fourlab_booking_specialty')
    const savedProfId = localStorage.getItem('fourlab_booking_prof_id')
    const savedAddress = localStorage.getItem('fourlab_booking_address')

    setFormData((prev) => ({
      ...prev,
      name: savedName || '',
      email: savedEmail || '',
      phone: savedPhone || '',
      document: savedDocument || '',
      specialty: savedSpecialty || '',
      professional_id: savedProfId || '',
      clinic_address: savedAddress || '',
    }))
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: false }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors: Record<string, boolean> = {}
    if (!formData.name) errors.name = true
    if (!formData.email) errors.email = true
    if (!formData.phone) errors.phone = true
    if (!formData.document) errors.document = true
    if (!formData.specialty) errors.specialty = true

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      toast({
        title: 'Campos Obrigatórios',
        description: 'Preencha nome, e-mail, telefone, CPF e especialidade.',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      localStorage.setItem('fourlab_booking_name', formData.name)
      localStorage.setItem('fourlab_booking_email', formData.email)
      localStorage.setItem('fourlab_booking_phone', formData.phone)
      localStorage.setItem('fourlab_booking_document', formData.document)
      localStorage.setItem('fourlab_booking_specialty', formData.specialty)
      localStorage.setItem('fourlab_booking_prof_id', formData.professional_id)
      localStorage.setItem('fourlab_booking_address', formData.clinic_address)

      const { newApp, syncWarning } = await createPublicAppointment({
        instagram: formData.instagram,
        patients_per_month: formData.patientsPerMonth,
        user_id: userId,
        client_name: formData.name,
        client_email: formData.email,
        client_phone: formData.phone,
        client_document: formData.document,
        specialty: formData.specialty,
        professional_id: formData.professional_id,
        clinic_address: formData.clinic_address,
        appointment_date: format(date, 'yyyy-MM-dd'),
        start_time: slot.start_time,
        end_time: slot.end_time,
        status: 'scheduled',
      })

      const newLeadId = `l-${Date.now()}`
      const newLead: Lead = {
        id: newLeadId,
        name: formData.name,
        type: 'B2B',
        stage: 'Agendado',
        score: 3,
        document: formData.document,
        address: formData.clinic_address || 'Endereço não informado',
        profession: 'médico',
        specialty: formData.specialty,
        contact: { email: formData.email, phone: formData.phone },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: userId,
      }

      dispatch({ type: 'ADD_LEAD', payload: newLead })

      if (syncWarning) {
        toast({
          title: 'Agendamento Confirmado (Aviso)',
          description:
            'Horário salvo com sucesso, mas houve falha ao sincronizar com integrações externas.',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Agendamento Confirmado',
          description: 'Seu horário foi agendado com sucesso!',
        })
      }
      onSuccess(newApp)
    } catch (error) {
      console.error(error)
      toast({
        title: 'Erro no agendamento',
        description: 'Ocorreu um erro ao tentar agendar. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="name">Nome Completo *</Label>
          <Input
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            placeholder="Dr. João Silva"
            className={formErrors.name ? 'border-destructive focus-visible:ring-destructive' : ''}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail *</Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="joao@exemplo.com"
              className={
                formErrors.email ? 'border-destructive focus-visible:ring-destructive' : ''
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Telefone / WhatsApp *</Label>
            <Input
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              required
              placeholder="(11) 99999-9999"
              className={
                formErrors.phone ? 'border-destructive focus-visible:ring-destructive' : ''
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="document">CPF *</Label>
            <Input
              id="document"
              name="document"
              value={formData.document}
              onChange={handleChange}
              required
              placeholder="000.000.000-00"
              className={
                formErrors.document ? 'border-destructive focus-visible:ring-destructive' : ''
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="specialty">Especialidade *</Label>
            <Input
              id="specialty"
              name="specialty"
              value={formData.specialty}
              onChange={handleChange}
              required
              placeholder="Ex: Nutrologia"
              className={
                formErrors.specialty ? 'border-destructive focus-visible:ring-destructive' : ''
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="professional_id">Registro Profissional (CRM/CRN)</Label>
            <Input
              id="professional_id"
              name="professional_id"
              value={formData.professional_id}
              onChange={handleChange}
              placeholder="Ex: CRM 12345"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="instagram">Instagram</Label>
            <Input
              id="instagram"
              name="instagram"
              value={formData.instagram}
              onChange={handleChange}
              placeholder="@seu_perfil"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="clinic_address">Endereço da Clínica / Consultório</Label>
          <Input
            id="clinic_address"
            name="clinic_address"
            value={formData.clinic_address}
            onChange={handleChange}
            placeholder="Rua, Número, Bairro, Cidade - UF"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="patientsPerMonth">Média de pacientes por mês</Label>
          <Input
            id="patientsPerMonth"
            name="patientsPerMonth"
            value={formData.patientsPerMonth}
            onChange={handleChange}
            placeholder="Ex: 50"
          />
        </div>
      </div>

      <div className="pt-2">
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Agendando...
            </>
          ) : (
            'Confirmar Agendamento'
          )}
        </Button>
      </div>
    </form>
  )
}
