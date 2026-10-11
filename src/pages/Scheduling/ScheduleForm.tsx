import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useMainStore } from '@/stores/main'
import { toast } from '@/hooks/use-toast'
import { Lead } from '@/lib/types'
import { Separator } from '@/components/ui/separator'
import { supabase } from '@/lib/supabase/client'
import { syncCalendarService } from '@/features/syncCalendarService'

const UF_OPTIONS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
]

const timeOptions = Array.from({ length: 41 }, (_, i) => {
  const hour = Math.floor(i / 4) + 8
  const minutes = (i % 4) * 15
  return `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
})

const formSchema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  cpf: z.string().min(14, 'CPF inválido'),
  phone: z.string().min(14, 'Telefone inválido'),
  email: z.string().email('E-mail inválido'),
  profession: z.enum(['médico', 'nutricionista', 'treinador'], {
    message: 'Selecione uma profissão',
  }),
  specialty: z.string().max(20, 'Máximo 20 caracteres').optional(),
  registrationNumber: z.string().min(2, 'Registro inválido'),
  time: z.string().min(4, 'Selecione um horário'),
  endTime: z.string().min(4, 'Selecione o horário de término'),
  cep: z.string().min(9, 'CEP inválido'),
  street: z.string().min(2, 'Rua obrigatória'),
  number: z.string().min(1, 'Número obrigatório'),
  complement: z.string().optional(),
  neighborhood: z.string().min(2, 'Bairro obrigatório'),
  city: z.string().min(2, 'Cidade obrigatória'),
  state: z.string().length(2, 'UF obrigatória'),
  instagram: z.string().optional(),
  patientsPerMonth: z.string().optional(),
  authorizeInfo: z.boolean().refine((val) => val === true, 'Autorização necessária.'),
})

type FormValues = z.infer<typeof formSchema>

export function ScheduleForm({
  selectedDate,
  onSuccess,
  duplicateData,
  onDuplicateClear,
}: {
  selectedDate: Date | undefined
  onSuccess: () => void
  duplicateData?: any | null
  onDuplicateClear?: () => void
}) {
  const { state, dispatch } = useMainStore()
  const [loading, setLoading] = useState(false)
  const [searchLead, setSearchLead] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [loadingLookup, setLoadingLookup] = useState(false)
  const [loadingCpf, setLoadingCpf] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      cpf: '',
      phone: '',
      email: '',
      specialty: '',
      registrationNumber: '',
      time: '',
      endTime: '',
      cep: '',
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
      instagram: '',
      patientsPerMonth: '',
      authorizeInfo: false,
    },
  })

  const cpfValue = form.watch('cpf')
  const cepValue = form.watch('cep')

  useEffect(() => {
    const fetchContactByCpf = async () => {
      if (cpfValue && cpfValue.length === 14) {
        setLoadingCpf(true)
        const cleanCpf = cpfValue.replace(/\D/g, '')
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser()
          if (!user) return

          const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('user_id', user.id)
            .or(`document.eq.${cpfValue},document.eq.${cleanCpf}`)
            .limit(1)

          if (data && data.length > 0) {
            const existing = data[0]
            form.reset({
              ...form.getValues(),
              name: existing.name || '',
              email: existing.email || '',
              phone: existing.phone || '',
              profession: (existing.profession as any) || undefined,
              specialty: existing.specialty || '',
              registrationNumber: existing.registration_number || '',
              instagram: existing.instagram || '',
              patientsPerMonth: existing.patients_per_month || '',
            })
            toast({
              title: 'Contato Encontrado',
              description: 'Dados preenchidos automaticamente.',
            })
          }
        } catch (e) {
          console.error(e)
        } finally {
          setLoadingCpf(false)
        }
      }
    }
    fetchContactByCpf()
  }, [cpfValue, form])

  useEffect(() => {
    const searchContacts = async () => {
      if (searchLead.length > 2) {
        setLoadingLookup(true)
        try {
          const cleanSearch = searchLead.replace(/\D/g, '')
          const {
            data: { user },
          } = await supabase.auth.getUser()
          if (!user) return

          let query = supabase.from('contacts').select('*').eq('user_id', user.id)

          if (cleanSearch.length > 0) {
            query = query.or(
              `name.ilike.%${searchLead}%,document.ilike.%${searchLead}%,document.ilike.%${cleanSearch}%`,
            )
          } else {
            query = query.or(`name.ilike.%${searchLead}%,document.ilike.%${searchLead}%`)
          }

          const { data } = await query.limit(10)
          setSearchResults(data || [])
        } catch (err) {
          console.error(err)
        } finally {
          setLoadingLookup(false)
        }
      } else {
        setSearchResults([])
      }
    }

    const timer = setTimeout(searchContacts, 400)
    return () => clearTimeout(timer)
  }, [searchLead])

  useEffect(() => {
    if (duplicateData) {
      form.reset({
        ...form.getValues(),
        name: duplicateData.client_name || '',
        cpf: duplicateData.client_document || '',
        phone: duplicateData.client_phone || '',
        email: duplicateData.client_email || '',
        profession: undefined,
        specialty: duplicateData.specialty || '',
        registrationNumber: duplicateData.professional_id || '',
        instagram: duplicateData.instagram || '',
        patientsPerMonth: duplicateData.patients_per_month || '',
        cep: duplicateData.clinic_cep || '',
        street: duplicateData.clinic_address || '',
        number: duplicateData.clinic_number || '',
        complement: duplicateData.clinic_complement || '',
        neighborhood: duplicateData.clinic_neighborhood || '',
        city: duplicateData.clinic_city || '',
        state: '',
        time: '',
        endTime: '',
        authorizeInfo: false,
      })
    }
  }, [duplicateData, form])

  useEffect(() => {
    const cleanCep = cepValue?.replace(/\D/g, '')
    if (cleanCep?.length === 8) {
      fetch(`https://viacep.com.br/ws/${cleanCep}/json/`)
        .then((res) => res.json())
        .then((data) => {
          if (!data.erro) {
            form.setValue('street', data.logradouro)
            form.setValue('neighborhood', data.bairro)
            form.setValue('city', data.localidade)
            form.setValue('state', data.uf)
            toast({ title: 'Endereço encontrado', description: 'Campos preenchidos via CEP.' })
          }
        })
        .catch(() => {})
    }
  }, [cepValue, form])

  const onSubmit = async (values: FormValues) => {
    if (!selectedDate)
      return toast({ title: 'Erro', description: 'Selecione uma data.', variant: 'destructive' })

    if (values.endTime <= values.time) {
      return toast({
        title: 'Erro',
        description: 'O horário de término deve ser posterior ao início.',
        variant: 'destructive',
      })
    }

    setLoading(true)

    try {
      const timeParts = values.time.split(':')
      const endTimeParts = values.endTime.split(':')
      const appointmentDate = new Date(selectedDate)
      appointmentDate.setHours(parseInt(timeParts[0], 10), parseInt(timeParts[1], 10), 0, 0)
      const dateIso = appointmentDate.toISOString()

      const fullAddress = `${values.street}, ${values.number}${
        values.complement ? ` - ${values.complement}` : ''
      }, ${values.neighborhood}, ${values.city} - ${values.state}, CEP: ${values.cep}`

      const existingLead = state.leads.find((l) => l.document === values.cpf)
      const newLead: Lead = {
        id: existingLead ? existingLead.id : `l-${Date.now()}`,
        name: values.name,
        type: 'B2B',
        stage: 'Agendado',
        score: existingLead?.score || 3,
        document: values.cpf,
        address: fullAddress,
        profession: values.profession,
        specialty: values.specialty,
        registrationNumber: values.registrationNumber,
        phone: values.phone,
        email: values.email,
        instagram: values.instagram,
        patientsPerMonth: values.patientsPerMonth,
        lastInteraction: new Date().toISOString(),
        avatarSeed: existingLead?.avatarSeed || Math.floor(Math.random() * 100),
      }

      let newAppointmentId = `a-${Date.now()}`

      const { data: userSession } = await supabase.auth.getSession()
      const userId = userSession.session?.user?.id

      if (userId) {
        const phoneNum = values.phone.replace(/\D/g, '')
        const fullAddressDB = `${values.street}, ${values.number}${values.complement ? ` - ${values.complement}` : ''}, ${values.neighborhood}`

        // Upsert Contact/Lead in DB
        const { data: existingContacts } = await (supabase.from('contacts' as any) as any)
          .select('id')
          .eq('user_id', userId)
          .eq('phone', phoneNum)

        const contactPayload = {
          name: values.name,
          email: values.email,
          document: values.cpf,
          address: fullAddressDB,
          specialty: values.specialty,
          registration_number: values.registrationNumber,
          instagram: values.instagram,
          patients_per_month: values.patientsPerMonth,
          profession: values.profession,
        }

        if (existingContacts && existingContacts.length > 0) {
          await supabase
            .from('contacts' as any)
            .update(contactPayload)
            .eq('id', existingContacts[0].id)
        } else {
          await supabase.from('contacts' as any).insert({
            user_id: userId,
            phone: phoneNum,
            ...contactPayload,
          })
        }

        const { data: dbApp, error: dbErr } = await (supabase.from('appointments') as any)
          .insert({
            user_id: userId,
            client_name: values.name,
            client_email: values.email,
            client_phone: values.phone,
            appointment_date: format(appointmentDate, 'yyyy-MM-dd'),
            start_time: `${timeParts[0]}:${timeParts[1]}`,
            end_time: `${endTimeParts[0]}:${endTimeParts[1]}`,
            status: 'scheduled',
            specialty: values.specialty,
            professional_id: values.registrationNumber,
            clinic_address: fullAddressDB,
            instagram: values.instagram,
            patients_per_month: values.patientsPerMonth,
          })
          .select('id')
          .single()

        if (dbApp && !dbErr) {
          newAppointmentId = dbApp.id
        }
      }

      dispatch({
        type: 'SCHEDULE_APPOINTMENT',
        payload: {
          lead: newLead,
          appointment: {
            id: newAppointmentId,
            leadId: newLead.id,
            date: dateIso,
            vendor: 'Ana Vendedora',
            status: 'Scheduled',
            isVirtual: false,
          },
        },
      })

      const timeFormatted = format(appointmentDate, "dd/MM 'às' HH:mm")

      toast({
        title: 'Integração WhatsApp',
        description: `Lembretes configurados para 48h e 24h antes de ${timeFormatted}.`,
      })

      toast({
        title: 'Agendamento Confirmado!',
        description: `Visita para ${values.name} agendada com sucesso.`,
      })

      let finalMeetLink = ''
      try {
        const result = await syncCalendarService.syncCreate(newAppointmentId)

        if (!result.success) {
          console.error(result.error)
          toast({
            title: 'Sincronização',
            description: 'Falha ao sincronizar com Google Calendar. Tente novamente.',
            variant: 'destructive',
          })
        } else if (
          result.data &&
          result.data.message === 'No Google integration found, skipping.'
        ) {
          // Do not show toast if integration is not configured
        } else {
          finalMeetLink = result.data.meetLink || ''
          toast({
            title: 'Sincronização',
            description: 'Evento criado no Google Calendar.',
          })
        }
      } catch (err) {
        console.error(err)
        toast({
          title: 'Sincronização',
          description: 'Falha ao sincronizar com Google Calendar. Tente novamente.',
          variant: 'destructive',
        })
      }

      // Fetch secrets for dynamic API key if configured
      const rawSecrets = state.settings?.secrets
      const secrets = Array.isArray(rawSecrets) ? rawSecrets : []
      const userResendKey = secrets.find((s: any) => s.key === 'RESEND_API_KEY')?.value

      // Trigger automated email on scheduling
      if (values.email) {
        supabase.functions
          .invoke('send-email', {
            body: {
              to: values.email,
              subject: 'Confirmação de Agendamento - FourLab Nutrition',
              html: `
              <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #ffb800; padding: 24px; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 20px;">Visita Confirmada! 🎉</h1>
                </div>
                <div style="padding: 32px; background-color: #ffffff;">
                  <p style="font-size: 16px; line-height: 1.5;">Olá <strong>${values.name}</strong>,</p>
                  <p style="font-size: 16px; line-height: 1.5;">Seu agendamento foi registrado com sucesso para o dia <strong>${format(appointmentDate, 'dd/MM/yyyy')}</strong> às <strong>${timeParts[0]}:${timeParts[1]}</strong>.</p>
                  ${finalMeetLink ? `<p style="font-size: 16px; line-height: 1.5; background-color: #f0fdfa; padding: 12px; border-radius: 6px; border: 1px solid #ccfbf1;"><strong>🔗 Link da Reunião Online:</strong> <br/><a href="${finalMeetLink}" style="color: #0f766e; text-decoration: none;">${finalMeetLink}</a></p>` : ''}
                  <p style="font-size: 16px; line-height: 1.5;">Um de nossos representantes entrará em contato em breve para confirmar os últimos detalhes.</p>
                  <br/>
                  <p style="font-size: 14px; color: #666;">Atenciosamente,<br/>Equipe FourLab Nutrition</p>
                </div>
              </div>
            `,
              senderName: 'FourLab Nutrition',
              resendApiKey: userResendKey,
            },
          })
          .catch(console.error)
      }

      form.reset()
      setLoading(false)
      onSuccess()
      onDuplicateClear?.()
    } catch (err) {
      console.error(err)
      toast({
        title: 'Erro ao agendar',
        description: 'Verifique se os dados estão corretos e tente novamente.',
        variant: 'destructive',
      })
      setLoading(false)
    }
  }

  const applyMask = (v: string, type: 'cpf' | 'phone' | 'cep') => {
    let val = v.replace(/\D/g, '')
    if (type === 'cpf') {
      val = val.slice(0, 11)
      return val
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
    }
    if (type === 'phone') {
      val = val.slice(0, 11)
      val = val.replace(/^(\d{2})(\d)/g, '($1) $2')
      return val.replace(/(\d)(\d{4})$/, '$1-$2')
    }
    if (type === 'cep') {
      val = val.slice(0, 8)
      return val.replace(/(\d{5})(\d)/, '$1-$2')
    }
    return val
  }

  const handleSelectLead = (contact: any) => {
    form.reset({
      ...form.getValues(),
      name: contact.name || '',
      cpf: contact.document || '',
      email: contact.email || '',
      phone: contact.phone || '',
      profession: (contact.profession as any) || undefined,
      specialty: contact.specialty || '',
      registrationNumber: contact.registration_number || '',
      instagram: contact.instagram || '',
      patientsPerMonth: contact.patients_per_month || '',
    })
    setSearchLead('')
    setShowSuggestions(false)
    toast({
      title: 'Contato Selecionado',
      description: 'Dados preenchidos com sucesso.',
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="relative mb-6 animate-fade-in">
          <Input
            placeholder="🔍 Busca Rápida: Digite nome ou CPF do cliente existente..."
            value={searchLead}
            onChange={(e) => {
              setSearchLead(e.target.value)
              setShowSuggestions(true)
            }}
            onFocus={() => setShowSuggestions(true)}
            className="border-primary/50 focus-visible:ring-primary/30 pr-10"
          />
          {loadingLookup && searchLead.length > 2 && (
            <div className="absolute right-3 top-3">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {showSuggestions && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
              {searchResults.map((c) => (
                <div
                  key={c.id}
                  className="p-3 hover:bg-muted cursor-pointer flex flex-col text-sm border-b last:border-0"
                  onClick={() => handleSelectLead(c)}
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground text-xs">{c.document || c.phone}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-muted/30 p-4 rounded-md mb-4 border border-border">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium">Data Visita:</p>
            <p className="text-primary font-bold">
              {selectedDate
                ? format(selectedDate, "dd 'de' MMMM, yyyy", { locale: ptBR })
                : 'Selecione no calendário'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center w-full">
            <FormField
              control={form.control}
              name="time"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between sm:justify-start gap-4 space-y-0 flex-1">
                  <FormLabel className="text-sm font-medium whitespace-nowrap">Início:</FormLabel>
                  <div className="w-[120px]">
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {timeOptions.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endTime"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between sm:justify-start gap-4 space-y-0 flex-1">
                  <FormLabel className="text-sm font-medium whitespace-nowrap">Fim:</FormLabel>
                  <div className="w-[120px]">
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {timeOptions.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="cpf"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CPF (Busca Automática)</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      {...field}
                      placeholder="000.000.000-00"
                      onChange={(e) => field.onChange(applyMask(e.target.value, 'cpf'))}
                      maxLength={14}
                      className={loadingCpf ? 'pr-10' : ''}
                    />
                    {loadingCpf && (
                      <div className="absolute right-3 top-3">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome completo</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Digite o nome" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Telefone (WhatsApp)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="(00) 00000-0000"
                    onChange={(e) => field.onChange(applyMask(e.target.value, 'phone'))}
                    maxLength={15}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>E-mail</FormLabel>
                <FormControl>
                  <Input {...field} type="email" placeholder="email@exemplo.com" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="profession"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Profissão</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="médico">Médico(a)</SelectItem>
                    <SelectItem value="nutricionista">Nutricionista</SelectItem>
                    <SelectItem value="treinador">Treinador(a)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="specialty"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Especialidade</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Ex: Esportiva" maxLength={20} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="registrationNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Registro Profissional</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="CRM, CRN, CREF..." />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="instagram"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Instagram Profissional</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="@usuario" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="patientsPerMonth"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nº de Pacientes / Mês</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Ex: 50" type="number" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Separator className="my-4" />
        <h3 className="text-sm font-semibold mb-2">Endereço de Visita / Envio de Kit</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="cep"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CEP</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="00000-000"
                    onChange={(e) => field.onChange(applyMask(e.target.value, 'cep'))}
                    maxLength={9}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="md:col-span-2">
            <FormField
              control={form.control}
              name="street"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Logradouro</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Rua, Avenida..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <FormField
            control={form.control}
            name="number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="123" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="complement"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Complemento</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Sala 2" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="md:col-span-2">
            <FormField
              control={form.control}
              name="neighborhood"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bairro</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Centro" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cidade</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="São Paulo" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="state"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estado</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="UF" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {UF_OPTIONS.map((uf) => (
                      <SelectItem key={uf} value={uf}>
                        {uf}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="authorizeInfo"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-4 mt-4 border rounded-md bg-muted/20">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Autoriza envio de informações</FormLabel>
                <FormDescription className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  Ao marcar, você autoriza o contato via WhatsApp e envio de kits em conformidade
                  com a LGPD.
                </FormDescription>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full h-12 text-lg mt-2"
          disabled={loading || !selectedDate}
        >
          {loading ? 'Sincronizando...' : 'Confirmar Agendamento'}
        </Button>
      </form>
    </Form>
  )
}
