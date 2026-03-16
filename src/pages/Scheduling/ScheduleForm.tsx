import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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

const formSchema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  cpf: z.string().min(14, 'CPF inválido'),
  phone: z.string().min(14, 'Telefone inválido'),
  email: z.string().email('E-mail inválido'),
  profession: z.enum(['médico', 'nutricionista', 'treinador'], {
    required_error: 'Selecione uma profissão',
  }),
  registrationNumber: z.string().min(2, 'Registro inválido'),
  address: z.string().min(5, 'Endereço obrigatório'),
  authorizeInfo: z
    .boolean()
    .default(false)
    .refine((val) => val === true, {
      message: 'É necessário autorizar o uso dos dados para prosseguir.',
    }),
})

export function ScheduleForm({
  selectedDate,
  onSuccess,
}: {
  selectedDate: Date | undefined
  onSuccess: () => void
}) {
  const { dispatch } = useMainStore()
  const [loading, setLoading] = useState(false)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      cpf: '',
      phone: '',
      email: '',
      profession: undefined,
      registrationNumber: '',
      address: '',
      authorizeInfo: false,
    },
  })

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (!selectedDate) {
      toast({
        title: 'Erro',
        description: 'Selecione uma data no calendário.',
        variant: 'destructive',
      })
      return
    }
    setLoading(true)

    // Simulate API delay
    setTimeout(() => {
      const newLead: Lead = {
        id: `l-${Date.now()}`,
        name: values.name,
        type: 'B2B', // Professionals are treated as B2B in this context
        stage: 'Agendado',
        score: 3,
        document: values.cpf,
        address: values.address,
        profession: values.profession,
        registrationNumber: values.registrationNumber,
        phone: values.phone,
        email: values.email,
        lastInteraction: new Date().toISOString(),
        avatarSeed: Math.floor(Math.random() * 100),
      }

      dispatch({
        type: 'SCHEDULE_APPOINTMENT',
        payload: {
          lead: newLead,
          appointment: {
            id: `a-${Date.now()}`,
            leadId: newLead.id,
            date: selectedDate.toISOString(),
            vendor: 'Ana Vendedora', // mock
            status: 'Scheduled',
          },
        },
      })

      toast({
        title: 'Agendamento Confirmado!',
        description: `Visita para ${values.name} agendada com sucesso.`,
      })
      form.reset()
      setLoading(false)
      onSuccess()
    }, 600)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="bg-muted/30 p-3 rounded-md mb-4 border border-border flex items-center justify-between">
          <p className="text-sm font-medium">Data Visita:</p>
          <p className="text-primary font-bold">
            {selectedDate ? format(selectedDate, 'dd/MM/yyyy') : 'Selecione no calendário'}
          </p>
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome completo</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Digite o nome do profissional" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="cpf"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CPF</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="000.000.000-00"
                    onChange={(e) => {
                      let value = e.target.value.replace(/\D/g, '')
                      if (value.length > 11) value = value.slice(0, 11)
                      value = value.replace(/(\d{3})(\d)/, '$1.$2')
                      value = value.replace(/(\d{3})(\d)/, '$1.$2')
                      value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2')
                      field.onChange(value)
                    }}
                    maxLength={14}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Telefone de contato</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="(00) 00000-0000"
                    onChange={(e) => {
                      let value = e.target.value.replace(/\D/g, '')
                      if (value.length > 11) value = value.slice(0, 11)
                      value = value.replace(/^(\d{2})(\d)/g, '($1) $2')
                      value = value.replace(/(\d)(\d{4})$/, '$1-$2')
                      field.onChange(value)
                    }}
                    maxLength={15}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="profession"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Profissão</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
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
                <FormLabel>Número do Registro no Conselho Profissional</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="CRM, CRN, CREF..." />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Endereço para Envio de produto</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Rua, Número, Complemento, Bairro, Cidade - Estado, CEP"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="authorizeInfo"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-4 border rounded-md bg-muted/20">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Autoriza envio de informações</FormLabel>
                <FormDescription className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  Ao marcar esta opção, você autoriza o uso de seus dados para contato e envio de
                  informações e kits de produtos, em total conformidade com a Lei Geral de Proteção
                  de Dados (LGPD).
                </FormDescription>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={loading || !selectedDate}>
          {loading ? 'Agendando...' : 'Confirmar Agendamento'}
        </Button>
      </form>
    </Form>
  )
}
