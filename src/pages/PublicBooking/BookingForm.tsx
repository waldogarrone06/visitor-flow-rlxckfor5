import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { createPublicAppointment } from '@/services/public-booking'
import { format } from 'date-fns'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2 } from 'lucide-react'

interface BookingFormProps {
  userId: string
  date: Date
  slot: any
  onSuccess: (appointment: any) => void
}

const DRAFT_KEY = 'fourlab_booking_draft'
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000 // LGPD: rascunho pessoal expira em 24h

function loadDraft(): Partial<Record<string, string>> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(DRAFT_KEY)
      return {}
    }
    return parsed.values || {}
  } catch {
    return {}
  }
}

function saveDraft(values: Record<string, string>) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), values }))
  } catch {
    // localStorage indisponível — segue sem rascunho
  }
}

// Trava de CPF (leia-me "Remarcar visita por CPF"): o backend responde com
// code 'cpf_blocked_30d' (+ releaseDate) ou 'cpf_open_visit' — em vez de um
// toast genérico, a tela mostra o aviso com a data de liberação e o link
// para remarcar a visita existente em /remarcar/:userId.
interface CpfBlockState {
  releaseDate: string | null
  openVisit: boolean
}

// create-booking devolve a data de liberação como DD/MM/YYYY (formato da RPC);
// por segurança aceita também yyyy-mm-dd.
function formatReleaseDate(raw: string | null): string | null {
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-')
    return `${d}/${m}/${y}`
  }
  return raw
}

export function BookingForm({ userId, date, slot, onSuccess }: BookingFormProps) {
  const [submitting, setSubmitting] = useState(false)
  const [cpfBlock, setCpfBlock] = useState<CpfBlockState | null>(null)
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({})
  const [lgpdConsent, setLgpdConsent] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    document: '',
    specialty: '',
    professional_id: '',
    clinic_cep: '',
    clinic_address: '',
    clinic_number: '',
    clinic_neighborhood: '',
    clinic_complement: '',
    instagram: '',
    patientsPerMonth: '',
  })

  useEffect(() => {
    const draft = loadDraft()
    if (Object.keys(draft).length > 0) {
      setFormData((prev) => ({ ...prev, ...draft }))
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    // CPF alterado: o aviso de bloqueio não se aplica mais a esse valor.
    if (cpfBlock && name === 'document') setCpfBlock(null)
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
    if (!lgpdConsent) errors.lgpd = true

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      toast({
        title: errors.lgpd ? 'Consentimento necessário' : 'Campos Obrigatórios',
        description: errors.lgpd
          ? 'É necessário aceitar o uso dos seus dados (LGPD) para concluir o agendamento.'
          : 'Preencha nome, e-mail, telefone, CPF e especialidade.',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      // LGPD: o rascunho NÃO guarda dados sensíveis (e-mail, telefone, CPF) —
      // só profissional/endereço da clínica, e expira em 24h.
      saveDraft({
        specialty: formData.specialty,
        professional_id: formData.professional_id,
        clinic_address: formData.clinic_address,
        clinic_cep: formData.clinic_cep,
        clinic_number: formData.clinic_number,
        clinic_neighborhood: formData.clinic_neighborhood,
        clinic_complement: formData.clinic_complement,
      })

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
        clinic_cep: formData.clinic_cep,
        clinic_address: formData.clinic_address,
        clinic_number: formData.clinic_number,
        clinic_neighborhood: formData.clinic_neighborhood,
        clinic_complement: formData.clinic_complement,
        appointment_date: format(date, 'yyyy-MM-dd'),
        start_time: slot.start_time,
        end_time: slot.end_time,
        lgpd_consent: true,
      })

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
    } catch (error: any) {
      console.error(error)
      toast({
        title: 'Erro no agendamento',
        description: error?.message || 'Ocorreu um erro ao tentar agendar. Tente novamente.',
        variant: 'destructive',
      })
      // Trava de CPF: aviso em destaque no formulário (bloqueio <30d com a
      // data de liberação) ou link para remarcar a visita em aberto.
      if (error?.code === 'cpf_blocked_30d' || error?.code === 'cpf_open_visit') {
        setCpfBlock({
          releaseDate: error?.releaseDate || null,
          openVisit: error?.code === 'cpf_open_visit',
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {cpfBlock && (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-3"
        >
          {cpfBlock.openVisit ? (
            <p className="font-medium">
              Este CPF já possui uma visita em aberto. Remarque a visita existente em vez de criar
              uma nova.
            </p>
          ) : (
            <p className="font-medium">
              Você visitou recentemente. Você poderá agendar novamente a partir de{' '}
              {formatReleaseDate(cpfBlock.releaseDate) || 'data a confirmar'}.
            </p>
          )}
          <Button asChild variant="outline" className="border-amber-400 bg-white">
            <Link to={`/remarcar/${userId}`}>Remarcar minha visita</Link>
          </Button>
        </div>
      )}

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="clinic_cep">CEP</Label>
            <Input
              id="clinic_cep"
              name="clinic_cep"
              value={formData.clinic_cep}
              onChange={handleChange}
              placeholder="00000-000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clinic_address">Endereço (Rua/Avenida)</Label>
            <Input
              id="clinic_address"
              name="clinic_address"
              value={formData.clinic_address}
              onChange={handleChange}
              placeholder="Ex: Av. Paulista"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="clinic_number">Número</Label>
            <Input
              id="clinic_number"
              name="clinic_number"
              value={formData.clinic_number}
              onChange={handleChange}
              placeholder="123"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="clinic_neighborhood">Bairro</Label>
            <Input
              id="clinic_neighborhood"
              name="clinic_neighborhood"
              value={formData.clinic_neighborhood}
              onChange={handleChange}
              placeholder="Bela Vista"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="clinic_complement">Complemento</Label>
          <Input
            id="clinic_complement"
            name="clinic_complement"
            value={formData.clinic_complement}
            onChange={handleChange}
            placeholder="Sala 101, Andar 2"
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

        <div
          className={`flex items-start gap-3 rounded-md border p-4 ${
            formErrors.lgpd ? 'border-destructive' : 'border-border/60'
          }`}
        >
          <Checkbox
            id="lgpd_consent"
            checked={lgpdConsent}
            onCheckedChange={(v) => {
              setLgpdConsent(v === true)
              if (formErrors.lgpd) setFormErrors((prev) => ({ ...prev, lgpd: false }))
            }}
            className="mt-0.5"
          />
          <Label htmlFor="lgpd_consent" className="text-sm font-normal leading-relaxed">
            Autorizo o uso dos meus dados (nome, e-mail, telefone, CPF e endereço) para agendar esta
            visita e para contato pela equipe FourLab Nutrition, conforme a Lei Geral de Proteção de
            Dados (LGPD). *
          </Label>
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
