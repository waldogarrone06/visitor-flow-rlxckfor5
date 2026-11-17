import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { FourLabLogo } from '@/components/FourLabLogo'
import { UF_OPTIONS, maskCPF, maskCep, maskPhone, validateContactFields } from '@/lib/validation'
import { Checkbox } from '@/components/ui/checkbox'
import { createPublicAppointment } from '@/services/public-booking'

const emptyForm = {
  client_name: '',
  client_email: '',
  client_phone: '',
  client_document: '',
  instagram: '',
  specialty: '',
  patients_per_month: '',
  clinic_cep: '',
  clinic_address: '',
  clinic_number: '',
  clinic_neighborhood: '',
  clinic_complement: '',
  clinic_city: '',
  clinic_state: '',
}

export default function LeadCapturePage() {
  const { userId } = useParams()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [professionalName, setProfessionalName] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [lgpdConsent, setLgpdConsent] = useState(false)

  const [formData, setFormData] = useState(emptyForm)

  const setField = (field: string, value: string) => {
    setFormData((f) => ({ ...f, [field]: value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: '' }))
  }

  useEffect(() => {
    if (userId) {
      supabase
        .from('profiles')
        .select('name')
        .eq('id', userId)
        .single()
        .then(({ data }) => {
          if (data?.name) setProfessionalName(data.name)
        })
    }
  }, [userId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return

    // Validação completa (NF): nome, telefone, CPF e endereço completo obrigatórios
    const fieldErrors = validateContactFields({
      name: formData.client_name,
      phone: formData.client_phone,
      document: formData.client_document,
      street: formData.clinic_address,
      number: formData.clinic_number,
      neighborhood: formData.clinic_neighborhood,
      city: formData.clinic_city,
      state: formData.clinic_state,
      cep: formData.clinic_cep,
    })
    if (!formData.client_email || !formData.client_email.trim()) {
      fieldErrors.client_email = 'E-mail obrigatório'
    }
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) {
      const first = document.querySelector('[data-error="true"]')
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    if (!lgpdConsent) {
      setErrors({ lgpd: 'É necessário aceitar o uso dos seus dados (LGPD) para continuar.' })
      return
    }

    setLoading(true)
    try {
      // Passa pela edge function create-booking (service role): grava o lead de
      // captura via RPC atômica e cria/encontra o contato sem duplicar — o
      // anônimo não lê nem escreve em contacts direto.
      await createPublicAppointment({
        user_id: userId,
        ...formData,
        appointment_date: '1970-01-01',
        start_time: '00:00',
        end_time: '00:00',
        lgpd_consent: true,
      })

      setSuccess(true)
    } catch (err: any) {
      console.error(err)
      alert(err?.message || 'Ocorreu um erro ao enviar seus dados. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const fieldError = (key: string) => <p className="text-xs text-red-600 mt-1">{errors[key]}</p>
  const invalidClass = (key: string) =>
    errors[key] ? 'border-red-500 focus-visible:ring-red-300' : ''

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg text-center py-10">
          <CardContent className="space-y-6">
            <div className="flex justify-center">
              <div className="h-20 w-20 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-900">Informações Recebidas!</h2>
              <p className="text-slate-500">
                Seus dados foram enviados com sucesso para {professionalName || 'o profissional'}.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center">
      <div className="w-full max-w-md mb-8 flex justify-center">
        <FourLabLogo className="h-16 w-auto" />
      </div>

      <Card className="w-full max-w-xl shadow-xl border-t-4 border-t-[#e10050]">
        <CardHeader>
          <CardTitle className="text-2xl">Contato Profissional</CardTitle>
          <CardDescription>
            Deixe suas informações para que {professionalName || 'nossa equipe'} entre em contato.
            Os campos marcados com * são obrigatórios para emissão da nota fiscal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2" data-error={!!errors.name}>
              <Label htmlFor="client_name">Nome Completo *</Label>
              <Input
                id="client_name"
                placeholder="Dr. João Silva"
                className={invalidClass('name')}
                value={formData.client_name}
                onChange={(e) => setField('client_name', e.target.value)}
              />
              {fieldError('name')}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2" data-error={!!errors.client_email}>
                <Label htmlFor="client_email">E-mail *</Label>
                <Input
                  id="client_email"
                  type="email"
                  placeholder="joao@exemplo.com"
                  className={invalidClass('client_email')}
                  value={formData.client_email}
                  onChange={(e) => setField('client_email', e.target.value)}
                />
                {fieldError('client_email')}
              </div>
              <div className="space-y-2" data-error={!!errors.phone}>
                <Label htmlFor="client_phone">WhatsApp *</Label>
                <Input
                  id="client_phone"
                  placeholder="(11) 99999-9999"
                  className={invalidClass('phone')}
                  value={formData.client_phone}
                  onChange={(e) => setField('client_phone', maskPhone(e.target.value))}
                  maxLength={15}
                />
                {fieldError('phone')}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2" data-error={!!errors.document}>
                <Label htmlFor="client_document">CPF *</Label>
                <Input
                  id="client_document"
                  placeholder="000.000.000-00"
                  className={invalidClass('document')}
                  value={formData.client_document}
                  onChange={(e) => setField('client_document', maskCPF(e.target.value))}
                  maxLength={14}
                />
                {fieldError('document')}
              </div>
              <div className="space-y-2">
                <Label htmlFor="specialty">Especialidade</Label>
                <Input
                  id="specialty"
                  placeholder="Ex: Nutricionista"
                  value={formData.specialty}
                  onChange={(e) => setField('specialty', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2" data-error={!!errors.cep}>
                <Label htmlFor="clinic_cep">CEP *</Label>
                <Input
                  id="clinic_cep"
                  placeholder="00000-000"
                  className={invalidClass('cep')}
                  value={formData.clinic_cep}
                  onChange={(e) => setField('clinic_cep', maskCep(e.target.value))}
                  maxLength={9}
                />
                {fieldError('cep')}
              </div>
              <div className="space-y-2" data-error={!!errors.street}>
                <Label htmlFor="clinic_address">Endereço (Rua/Avenida) *</Label>
                <Input
                  id="clinic_address"
                  placeholder="Ex: Av. Paulista"
                  className={invalidClass('street')}
                  value={formData.clinic_address}
                  onChange={(e) => setField('clinic_address', e.target.value)}
                />
                {fieldError('street')}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2" data-error={!!errors.number}>
                <Label htmlFor="clinic_number">Número *</Label>
                <Input
                  id="clinic_number"
                  placeholder="123"
                  className={invalidClass('number')}
                  value={formData.clinic_number}
                  onChange={(e) => setField('clinic_number', e.target.value)}
                />
                {fieldError('number')}
              </div>
              <div className="space-y-2 md:col-span-2" data-error={!!errors.neighborhood}>
                <Label htmlFor="clinic_neighborhood">Bairro *</Label>
                <Input
                  id="clinic_neighborhood"
                  placeholder="Bela Vista"
                  className={invalidClass('neighborhood')}
                  value={formData.clinic_neighborhood}
                  onChange={(e) => setField('clinic_neighborhood', e.target.value)}
                />
                {fieldError('neighborhood')}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2" data-error={!!errors.city}>
                <Label htmlFor="clinic_city">Cidade *</Label>
                <Input
                  id="clinic_city"
                  placeholder="São Paulo"
                  className={invalidClass('city')}
                  value={formData.clinic_city}
                  onChange={(e) => setField('clinic_city', e.target.value)}
                />
                {fieldError('city')}
              </div>
              <div className="space-y-2" data-error={!!errors.state}>
                <Label htmlFor="clinic_state">Estado (UF) *</Label>
                <Select
                  value={formData.clinic_state}
                  onValueChange={(v) => setField('clinic_state', v)}
                >
                  <SelectTrigger id="clinic_state" className={invalidClass('state')}>
                    <SelectValue placeholder="Selecione a UF" />
                  </SelectTrigger>
                  <SelectContent>
                    {UF_OPTIONS.map((uf) => (
                      <SelectItem key={uf} value={uf}>
                        {uf}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldError('state')}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="clinic_complement">Complemento</Label>
              <Input
                id="clinic_complement"
                placeholder="Sala 101, Andar 2"
                value={formData.clinic_complement}
                onChange={(e) => setField('clinic_complement', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="instagram">Instagram</Label>
                <Input
                  id="instagram"
                  placeholder="@seu_perfil"
                  value={formData.instagram}
                  onChange={(e) => setField('instagram', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patients_per_month">Pacientes por Mês (Média)</Label>
                <Input
                  id="patients_per_month"
                  placeholder="Ex: 50"
                  value={formData.patients_per_month}
                  onChange={(e) => setField('patients_per_month', e.target.value)}
                />
              </div>
            </div>

            {fieldError('lgpd')}

            <div
              className={`flex items-start gap-3 rounded-md border p-4 ${
                errors.lgpd ? 'border-red-500' : 'border-border/60'
              }`}
            >
              <Checkbox
                id="lgpd_consent"
                checked={lgpdConsent}
                onCheckedChange={(v) => {
                  setLgpdConsent(v === true)
                  if (errors.lgpd) setErrors((e) => ({ ...e, lgpd: '' }))
                }}
                className="mt-0.5"
              />
              <Label htmlFor="lgpd_consent" className="text-sm font-normal leading-relaxed">
                Autorizo o uso dos meus dados (nome, e-mail, telefone, CPF e endereço) para cadastro
                e contato pela equipe FourLab Nutrition, conforme a Lei Geral de Proteção de Dados
                (LGPD). *
              </Label>
            </div>

            <Button
              type="submit"
              className="w-full bg-[#e10050] hover:bg-[#c00040] text-white mt-4"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Enviar Informações'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
