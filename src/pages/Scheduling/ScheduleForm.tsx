import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
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
import { LeadType, Lead } from '@/lib/types'

const formSchema = z.object({
  type: z.enum(['B2C', 'B2B']),
  name: z.string().min(2, 'Nome muito curto'),
  document: z.string().min(11, 'Documento inválido'),
  company: z.string().optional(),
  address: z.string().min(5, 'Endereço obrigatório'),
  sync: z.boolean().default(true),
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
    defaultValues: { type: 'B2C', name: '', document: '', company: '', address: '', sync: true },
  })

  const type = form.watch('type')

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
        type: values.type as LeadType,
        stage: 'Agendado',
        score: 3,
        document: values.document,
        company: values.company,
        address: values.address,
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
        description: `Visita para ${values.name} agendada.`,
      })
      form.reset()
      setLoading(false)
      onSuccess()
    }, 600)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="bg-muted/30 p-3 rounded-md mb-4 border border-border">
          <p className="text-sm font-medium">Data Selecionada:</p>
          <p className="text-primary font-bold">
            {selectedDate ? format(selectedDate, 'dd/MM/yyyy') : 'Nenhuma'}
          </p>
        </div>

        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de Cliente</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="B2C">B2C (Consumidor)</SelectItem>
                  <SelectItem value="B2B">B2B (Lojista)</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome Completo / Contato</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {type === 'B2B' && (
          <FormField
            control={form.control}
            name="company"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Razão Social</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="document"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{type === 'B2B' ? 'CNPJ' : 'CPF'}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Endereço da Visita</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="sync"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-4 border rounded-md">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Sincronizar Calendário</FormLabel>
                <p className="text-xs text-muted-foreground">
                  Adicionar automaticamente ao Google Calendar
                </p>
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
