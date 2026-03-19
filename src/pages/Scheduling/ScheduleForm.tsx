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

const timeOptions = Array.from({ length: 21 }, (_, i) => {
  const hour = Math.floor(i / 2) + 8
  const minute = i % 2 === 0 ? '00' : '30'
  return `${hour.toString().padStart(2, '0')}:${minute}`
})

const formSchema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  cpf: z.string().min(14, 'CPF inválido'),
  phone: z.string().min(14, 'Telefone inválido'),
  email: z.string().email('E-mail inválido'),
  profession: z.enum(['médico', 'nutricionista', 'treinador'], {
    required_error: 'Selecione uma profissão',
  }),
  registrationNumber: z.string().min(2, 'Registro inválido'),
  time: z.string().min(4, 'Selecione um horário'),
  cep: z.string().min(9, 'CEP inválido'),
  street: z.string().min(2, 'Rua obrigatória'),
  number: z.string().min(1, 'Número obrigatório'),
  complement: z.string().optional(),
  neighborhood: z.string().min(2, 'Bairro obrigatório'),
  city: z.string().min(2, 'Cidade obrigatória'),
  state: z.string().length(2, 'UF obrigatória'),
  authorizeInfo: z.boolean().refine((val) => val === true, 'Autorização necessária.'),
})

type FormValues = z.infer<typeof formSchema>

export function ScheduleForm({
  selectedDate,
  onSuccess,
}: {
  selectedDate: Date | undefined
  onSuccess: () => void
}) {
  const { state, dispatch } = useMainStore()
  const [loading, setLoading] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      cpf: '',
      phone: '',
      email: '',
      registrationNumber: '',
      time: '',
      cep: '',
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
      authorizeInfo: false,
    },
  })

  const cpfValue = form.watch('cpf')
  const cepValue = form.watch('cep')

  useEffect(() => {
    if (cpfValue && cpfValue.length === 14) {
      const existing = state.leads.find((l) => l.document === cpfValue)
      if (existing) {
        form.reset({
          ...form.getValues(),
          name: existing.name || '',
          email: existing.email || '',
          phone: existing.phone || '',
          profession: (existing.profession as any) || undefined,
          registrationNumber: existing.registrationNumber || '',
        })
        toast({
          title: 'Profissional Encontrado',
          description: 'Dados base preenchidos automaticamente pelo CRM.',
        })
      }
    }
  }, [cpfValue, state.leads, form])

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

  const onSubmit = (values: FormValues) => {
    if (!selectedDate)
      return toast({ title: 'Erro', description: 'Selecione uma data.', variant: 'destructive' })
    setLoading(true)

    setTimeout(() => {
      const timeParts = values.time.split(':')
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
        registrationNumber: values.registrationNumber,
        phone: values.phone,
        email: values.email,
        lastInteraction: new Date().toISOString(),
        avatarSeed: existingLead?.avatarSeed || Math.floor(Math.random() * 100),
      }

      dispatch({
        type: 'SCHEDULE_APPOINTMENT',
        payload: {
          lead: newLead,
          appointment: {
            id: `a-${Date.now()}`,
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

      form.reset()
      setLoading(false)
      onSuccess()
    }, 1200)
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="bg-muted/30 p-4 rounded-md mb-4 border border-border">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium">Data Visita:</p>
            <p className="text-primary font-bold">
              {selectedDate
                ? format(selectedDate, "dd 'de' MMMM, yyyy", { locale: ptBR })
                : 'Selecione no calendário'}
            </p>
          </div>
          <FormField
            control={form.control}
            name="time"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between space-y-0">
                <FormLabel className="text-sm font-medium">Horário da Visita:</FormLabel>
                <div className="w-[140px]">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="cpf"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CPF (Busca Automática)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="000.000.000-00"
                    onChange={(e) => field.onChange(applyMask(e.target.value, 'cpf'))}
                    maxLength={14}
                  />
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
