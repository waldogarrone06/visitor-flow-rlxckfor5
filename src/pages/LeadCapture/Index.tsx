import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { FourLabLogo } from '@/components/FourLabLogo'

export default function LeadCapturePage() {
  const { userId } = useParams()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [professionalName, setProfessionalName] = useState('')

  const [formData, setFormData] = useState({
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
  })

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

    setLoading(true)
    try {
      const payload = {
        user_id: userId,
        ...formData,
        status: 'lead',
        appointment_date: '1970-01-01',
        start_time: '00:00',
        end_time: '00:00',
      }

      const { error } = await supabase.from('appointments').insert([payload]).select().single()

      if (error) throw error

      if (formData.client_phone) {
        const phoneNum = formData.client_phone.replace(/\D/g, '')
        const { data: existingContacts } = await supabase
          .from('contacts')
          .select('id')
          .eq('user_id', userId)
          .eq('phone', phoneNum)

        const contactPayload = {
          name: formData.client_name,
          email: formData.client_email,
          document: formData.client_document,
          specialty: formData.specialty,
          instagram: formData.instagram,
          patients_per_month: formData.patients_per_month,
          cep: formData.clinic_cep,
          address: formData.clinic_address,
        }

        if (existingContacts && existingContacts.length > 0) {
          await supabase.from('contacts').update(contactPayload).eq('id', existingContacts[0].id)
        } else {
          await supabase.from('contacts').insert({
            user_id: userId,
            phone: phoneNum,
            ...contactPayload,
          })
        }
      }

      setSuccess(true)
    } catch (err) {
      console.error(err)
      alert('Ocorreu um erro ao enviar seus dados. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

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
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client_name">Nome Completo *</Label>
              <Input
                id="client_name"
                required
                placeholder="Dr. João Silva"
                value={formData.client_name}
                onChange={(e) => setFormData((f) => ({ ...f, client_name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client_email">E-mail *</Label>
                <Input
                  id="client_email"
                  type="email"
                  required
                  placeholder="joao@exemplo.com"
                  value={formData.client_email}
                  onChange={(e) => setFormData((f) => ({ ...f, client_email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client_phone">WhatsApp *</Label>
                <Input
                  id="client_phone"
                  required
                  placeholder="(11) 99999-9999"
                  value={formData.client_phone}
                  onChange={(e) => setFormData((f) => ({ ...f, client_phone: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client_document">CPF</Label>
                <Input
                  id="client_document"
                  placeholder="000.000.000-00"
                  value={formData.client_document}
                  onChange={(e) => setFormData((f) => ({ ...f, client_document: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="specialty">Especialidade</Label>
                <Input
                  id="specialty"
                  placeholder="Ex: Nutricionista"
                  value={formData.specialty}
                  onChange={(e) => setFormData((f) => ({ ...f, specialty: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clinic_cep">CEP</Label>
                <Input
                  id="clinic_cep"
                  placeholder="00000-000"
                  value={formData.clinic_cep}
                  onChange={(e) => setFormData((f) => ({ ...f, clinic_cep: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clinic_address">Endereço (Rua/Avenida)</Label>
                <Input
                  id="clinic_address"
                  placeholder="Ex: Av. Paulista"
                  value={formData.clinic_address}
                  onChange={(e) => setFormData((f) => ({ ...f, clinic_address: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clinic_number">Número</Label>
                <Input
                  id="clinic_number"
                  placeholder="123"
                  value={formData.clinic_number}
                  onChange={(e) => setFormData((f) => ({ ...f, clinic_number: e.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="clinic_neighborhood">Bairro</Label>
                <Input
                  id="clinic_neighborhood"
                  placeholder="Bela Vista"
                  value={formData.clinic_neighborhood}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, clinic_neighborhood: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="clinic_complement">Complemento</Label>
              <Input
                id="clinic_complement"
                placeholder="Sala 101, Andar 2"
                value={formData.clinic_complement}
                onChange={(e) => setFormData((f) => ({ ...f, clinic_complement: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="instagram">Instagram</Label>
                <Input
                  id="instagram"
                  placeholder="@seu_perfil"
                  value={formData.instagram}
                  onChange={(e) => setFormData((f) => ({ ...f, instagram: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patients_per_month">Pacientes por Mês (Média)</Label>
                <Input
                  id="patients_per_month"
                  placeholder="Ex: 50"
                  value={formData.patients_per_month}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, patients_per_month: e.target.value }))
                  }
                />
              </div>
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
