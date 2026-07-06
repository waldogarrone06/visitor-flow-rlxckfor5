import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Copy, Truck, ExternalLink, Check, Trash2, Search, Edit2, X, Save } from 'lucide-react'
import { KitSelect } from '@/components/kit-select'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  const onCopy = () => {
    if (!value) return
    navigator.clipboard.writeText(value)
    setCopied(true)
    toast({ title: 'Copiado!', description: `${label} copiado para a área de transferência.` })
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground text-xs uppercase tracking-wider">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={value || ''}
          placeholder="Não informado"
          className="h-8 text-sm bg-muted/50 font-medium"
        />
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onCopy}
          disabled={!value}
          title="Copiar"
        >
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

type Shipment = {
  id: string
  created_at: string
  appointment_date: string | null
  client_name: string
  client_email: string
  client_phone: string | null
  kit_name: string | null
  tracking_number: string | null
  delivered_at: string | null
  kit_status: string | null
  status: string | null
  user_id: string
  client_document: string | null
  clinic_cep: string | null
  clinic_address: string | null
  clinic_number: string | null
  clinic_neighborhood: string | null
  clinic_complement: string | null
  clinic_city: string | null
  nutritionist_coupon: string | null
  patient_coupon: string | null
  resolved_document: string
  resolved_cep: string
  resolved_address: string
  resolved_number: string
  resolved_neighborhood: string
  resolved_complement: string
  resolved_city: string
  resolved_nutritionist_coupon: string
  resolved_patient_coupon: string
  is_address_edited: boolean
}

export function KitShipments({ consolidated = false }: { consolidated?: boolean }) {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null)
  const [addressForm, setAddressForm] = useState({
    clinic_cep: '',
    clinic_address: '',
    clinic_number: '',
    clinic_neighborhood: '',
    clinic_complement: '',
    clinic_city: '',
  })
  const [loading, setLoading] = useState(true)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [cepLoading, setCepLoading] = useState(false)
  const clinicNumberRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchShipments()
  }, [consolidated])

  useEffect(() => {
    const cleanCep = addressForm.clinic_cep.replace(/\D/g, '')
    if (cleanCep.length === 8) {
      setCepLoading(true)
      fetch(`https://viacep.com.br/ws/${cleanCep}/json/`)
        .then((res) => res.json())
        .then((data) => {
          if (data.erro) {
            toast({ title: 'CEP não encontrado', description: 'Preencha o endereço manualmente.' })
            return
          }
          setAddressForm((prev) => ({
            ...prev,
            clinic_address: data.logradouro || prev.clinic_address,
            clinic_neighborhood: data.bairro || prev.clinic_neighborhood,
          }))
          toast({ title: 'Endereço encontrado', description: 'Campos preenchidos via CEP.' })
          setTimeout(() => clinicNumberRef.current?.focus(), 100)
        })
        .catch(() => {
          toast({
            title: 'CEP não encontrado',
            description: 'Serviço indisponível. Preencha manualmente.',
          })
        })
        .finally(() => setCepLoading(false))
    }
  }, [addressForm.clinic_cep])

  const startEditingAddress = (s: Shipment) => {
    setEditingAddressId(s.id)
    setAddressForm({
      clinic_cep: s.resolved_cep || '',
      clinic_address: s.resolved_address || '',
      clinic_number: s.resolved_number || '',
      clinic_neighborhood: s.resolved_neighborhood || '',
      clinic_complement: s.resolved_complement || '',
      clinic_city: s.resolved_city || '',
    })
  }

  const saveAddress = async (id: string) => {
    const { error } = await supabase
      .from('appointments')
      .update({
        clinic_cep: addressForm.clinic_cep,
        clinic_address: addressForm.clinic_address,
        clinic_number: addressForm.clinic_number,
        clinic_neighborhood: addressForm.clinic_neighborhood,
        clinic_complement: addressForm.clinic_complement,
        clinic_city: addressForm.clinic_city,
        is_address_edited: true,
      })
      .eq('id', id)

    if (error) {
      toast({ title: 'Erro', description: 'Falha ao salvar endereço.', variant: 'destructive' })
    } else {
      toast({ title: 'Sucesso', description: 'Endereço atualizado com sucesso.' })
      setEditingAddressId(null)
      fetchShipments()
    }
  }

  const extractCEP = (address: string | null) => {
    if (!address) return ''
    const match = address.match(/\b\d{5}-?\d{3}\b/)
    if (match) {
      const cep = match[0]
      return cep.length === 8 && !cep.includes('-') ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep
    }
    return ''
  }

  const fetchShipments = async () => {
    setLoading(true)
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_admin')
      .eq('id', session.user.id)
      .single()

    const isManager =
      profile?.role === 'logistics' || profile?.role === 'kit_manager' || profile?.is_admin

    let appQuery = supabase
      .from('appointments')
      .select('*')
      .not('kit_status', 'is', null)
      .neq('status', 'Lead')
      .order('created_at', { ascending: false })

    let contQuery = supabase
      .from('contacts')
      .select('name, email, phone, document, cep, address, nutritionist_coupon, patient_coupon')

    if (!consolidated) {
      appQuery = appQuery.eq('user_id', session.user.id)
      contQuery = contQuery.eq('user_id', session.user.id)
    } else {
      if (!isManager) {
        // Fallback for security if a regular user forces the prop
        appQuery = appQuery.eq('user_id', session.user.id)
        contQuery = contQuery.eq('user_id', session.user.id)
      } else {
        // Consolidated for managers: fetch all appointments that have a kit assigned
        appQuery = appQuery.not('kit_name', 'is', null)
      }
    }

    const [appRes, contRes] = await Promise.all([appQuery, contQuery])

    if (appRes.data) {
      const enriched = appRes.data.map((a: any) => {
        const c = contRes.data?.find(
          (c: any) =>
            (c.phone && a.client_phone && c.phone === a.client_phone) ||
            (c.email && a.client_email && c.email === a.client_email) ||
            (c.name && a.client_name && c.name === a.client_name),
        )
        return {
          ...a,
          resolved_document: c?.document || a.client_document || '',
          resolved_cep: a.is_address_edited
            ? a.clinic_cep || ''
            : c?.cep || a.clinic_cep || extractCEP(a.clinic_address) || '',
          resolved_address: a.is_address_edited
            ? a.clinic_address || ''
            : c?.address || a.clinic_address || '',
          resolved_number: a.clinic_number || '',
          resolved_neighborhood: a.clinic_neighborhood || '',
          resolved_complement: a.clinic_complement || '',
          resolved_city: a.clinic_city || '',
          resolved_nutritionist_coupon: a.nutritionist_coupon || c?.nutritionist_coupon || '',
          resolved_patient_coupon: a.patient_coupon || c?.patient_coupon || '',
          is_address_edited: a.is_address_edited || false,
        }
      })
      setShipments(enriched)
    }
    setLoading(false)
  }

  const deleteShipment = async (id: string) => {
    const { error } = await supabase.from('appointments').delete().eq('id', id)

    if (error) {
      toast({ title: 'Erro', description: 'Falha ao excluir o registro.', variant: 'destructive' })
    } else {
      toast({ title: 'Sucesso', description: 'Registro excluído com sucesso.' })
      fetchShipments()
    }
  }

  const updateTracking = async (id: string, tracking: string) => {
    const { error } = await supabase
      .from('appointments')
      .update({ tracking_number: tracking })
      .eq('id', id)
    if (error)
      toast({ title: 'Erro', description: 'Falha ao atualizar rastreio.', variant: 'destructive' })
    else {
      toast({ title: 'Sucesso', description: 'Rastreio atualizado.' })
      fetchShipments()
    }
  }

  const updateKitStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from('appointments')
      .update({ kit_status: status })
      .eq('id', id)
    if (error)
      toast({ title: 'Erro', description: 'Falha ao atualizar status.', variant: 'destructive' })
    else {
      toast({ title: 'Sucesso', description: 'Status atualizado com sucesso.' })
      fetchShipments()
    }
  }

  const saveCoupon = async (
    id: string,
    field: 'nutritionist_coupon' | 'patient_coupon',
    value: string,
  ) => {
    const { error } = await supabase
      .from('appointments')
      .update({ [field]: value })
      .eq('id', id)
    if (error) {
      toast({ title: 'Erro', description: 'Falha ao salvar cupom.', variant: 'destructive' })
    } else {
      toast({ title: 'Sucesso', description: 'Cupom salvo com sucesso.' })
      fetchShipments()
    }
  }

  const sendKit = async (s: Shipment) => {
    if (!s.tracking_number || !s.resolved_nutritionist_coupon || !s.resolved_patient_coupon) {
      toast({
        title: 'Atenção',
        description:
          'Por favor, preencha o código de rastreio e os cupons (Nutri e Paciente) antes de marcar como enviado.',
        variant: 'destructive',
      })
      return
    }

    if (processingIds.has(s.id)) return
    setProcessingIds((prev) => new Set(prev).add(s.id))

    try {
      // Idempotency Check
      const { data: currentApp } = await supabase
        .from('appointments')
        .select('kit_status')
        .eq('id', s.id)
        .single()

      if (
        currentApp?.kit_status === 'Enviado' ||
        currentApp?.kit_status === 'Entregue' ||
        currentApp?.kit_status === 'Delivered' ||
        currentApp?.kit_status === 'Requested'
      ) {
        toast({
          title: 'Atenção',
          description: 'Este kit já foi solicitado ou enviado anteriormente.',
          variant: 'destructive',
        })
        fetchShipments()
        return
      }

      const { error } = await supabase
        .from('appointments')
        .update({ kit_status: 'Enviado' })
        .eq('id', s.id)

      if (error) {
        toast({ title: 'Erro', description: 'Falha ao atualizar status.', variant: 'destructive' })
        return
      }

      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData.session?.user) {
        await supabase.from('interaction_log').insert({
          user_id: sessionData.session.user.id,
          type: 'kit_shipment_triggered',
          details: { appointment_id: s.id, tracking_number: s.tracking_number, source: 'UI' },
        })
      }

      toast({
        title: 'Kit Enviado!',
        description:
          'O status foi atualizado e as mensagens de notificação estão sendo disparadas.',
      })
      fetchShipments()

      const message = `Olá, ${s.client_name}! Seu kit da Fourlab Nutrition foi enviado com sucesso.
Rastreio: ${s.tracking_number}
Cupom Prescritor: ${s.resolved_nutritionist_coupon}
Cupom Paciente: ${s.resolved_patient_coupon}

Obrigado por confiar em nosso trabalho!`

      if (s.client_phone) {
        await supabase.functions.invoke('whatsapp-send', {
          body: { to: s.client_phone, text: message, userId: s.user_id },
        })
      }

      if (s.client_email) {
        await supabase.functions.invoke('send-email', {
          body: {
            to: s.client_email,
            subject: 'Seu Kit Fourlab foi enviado!',
            html: `<div style="font-family: sans-serif; color: #333;">
              <p>Olá, ${s.client_name}!</p>
              <p>Seu kit da Fourlab Nutrition foi enviado com sucesso.</p>
              <p><strong>Código de Rastreio:</strong> ${s.tracking_number}</p>
              <p><strong>Cupom Prescritor:</strong> ${s.resolved_nutritionist_coupon}</p>
              <p><strong>Cupom Paciente:</strong> ${s.resolved_patient_coupon}</p>
              <p>Obrigado por confiar em nosso trabalho!</p>
            </div>`,
            senderName: 'FourLab Nutrition',
          },
        })
      }
    } catch (err) {
      console.error('Error sending kit:', err)
      toast({
        title: 'Erro',
        description: 'Ocorreu um erro ao processar o envio.',
        variant: 'destructive',
      })
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev)
        next.delete(s.id)
        return next
      })
    }
  }

  const getStatusBadgeVariant = (status: string | null) => {
    if (status === 'Entregue' || status === 'Delivered' || status === 'NF Emitida') return 'default'
    if (status === 'Enviado') return 'secondary'
    if (status === 'Aguardando NF') return 'destructive'
    return 'outline'
  }

  const filteredShipments = shipments.filter((s) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      s.client_name?.toLowerCase().includes(q) ||
      s.client_email?.toLowerCase().includes(q) ||
      s.tracking_number?.toLowerCase().includes(q) ||
      s.kit_name?.toLowerCase().includes(q)
    )
  })

  return (
    <Card className="w-full max-w-full shadow-sm animate-fade-in flex flex-col h-full">
      <CardHeader className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4">
        <div>
          <CardTitle className="text-xl font-semibold tracking-tight">
            {consolidated ? 'Envios Consolidados' : 'Meus Envios'}
          </CardTitle>
          <CardDescription className="mt-1 max-w-xl">
            {consolidated
              ? 'Gestão centralizada de todos os envios de kits e controle de Notas Fiscais.'
              : 'Acompanhe e gerencie a logística dos kits solicitados.'}
          </CardDescription>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar prescritor ou email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-[250px] pl-9"
            />
          </div>
          <Button
            onClick={fetchShipments}
            disabled={loading}
            variant="outline"
            className="shrink-0"
          >
            {loading ? 'Atualizando...' : 'Atualizar'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0 sm:p-6 sm:pt-0 flex-1 overflow-hidden flex flex-col">
        <div className="w-full flex-1 overflow-auto border-y sm:border rounded-none sm:rounded-md bg-card max-h-[calc(100vh-280px)]">
          <Table className="w-full min-w-[800px] relative">
            <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
              <TableRow>
                <TableHead className="whitespace-nowrap">Data</TableHead>
                <TableHead className="whitespace-nowrap">Cliente</TableHead>
                <TableHead className="whitespace-nowrap">Kit Solicitado</TableHead>
                <TableHead className="whitespace-nowrap">Rastreio</TableHead>
                <TableHead className="whitespace-nowrap">Data de Entrega</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="text-right whitespace-nowrap">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : filteredShipments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {searchQuery
                      ? 'Nenhum envio encontrado para a busca.'
                      : 'Nenhum envio encontrado.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredShipments.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(s.appointment_date || s.created_at), 'dd/MM/yyyy', {
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate" title={s.client_name}>
                      {s.client_name}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <KitSelect
                        appointmentId={s.id}
                        value={s.kit_name}
                        onUpdated={fetchShipments}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {s.tracking_number ? (
                        <div className="flex items-center gap-1 text-sm font-medium">
                          <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {s.tracking_number}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {s.delivered_at ? (
                        format(new Date(s.delivered_at), 'dd/MM/yyyy', { locale: ptBR })
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant={getStatusBadgeVariant(s.kit_status || s.status)}>
                        {s.kit_status || s.status || 'Pendente'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex justify-end gap-2 items-center">
                        {(!s.kit_status ||
                          s.kit_status === 'Pending' ||
                          s.kit_status === 'Pendente') && (
                          <Button
                            size="sm"
                            onClick={() => sendKit(s)}
                            disabled={processingIds.has(s.id)}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            {processingIds.has(s.id) ? 'Enviando...' : 'Enviar Kit'}
                          </Button>
                        )}
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              Detalhes
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
                            <DialogHeader>
                              <DialogTitle>Detalhes do Envio</DialogTitle>
                            </DialogHeader>
                            <div className="grid md:grid-cols-2 gap-8 py-4">
                              <div className="space-y-6">
                                <div className="space-y-4">
                                  <h4 className="font-semibold text-sm border-b pb-2 text-primary">
                                    Dados do Cliente
                                  </h4>
                                  <CopyField label="Nome" value={s.client_name} />
                                  <CopyField label="CPF/CNPJ" value={s.resolved_document} />
                                  <CopyField label="Email" value={s.client_email} />
                                  <CopyField label="Telefone" value={s.client_phone || ''} />
                                </div>

                                <div className="space-y-4">
                                  <h4 className="font-semibold text-sm border-b pb-2 text-primary">
                                    Endereço de Entrega
                                  </h4>
                                  <CopyField label="CEP" value={s.resolved_cep || '-'} />
                                  <CopyField label="Endereço" value={s.resolved_address || '-'} />
                                  <CopyField label="Número" value={s.resolved_number || '-'} />
                                  <CopyField
                                    label="Bairro"
                                    value={s.resolved_neighborhood || '-'}
                                  />
                                  <CopyField
                                    label="Complemento"
                                    value={s.resolved_complement || '-'}
                                  />
                                </div>

                                <div className="space-y-4">
                                  <h4 className="font-semibold text-sm border-b pb-2 text-primary">
                                    Cupons Associados
                                  </h4>
                                  <div className="space-y-3">
                                    <div className="space-y-1.5">
                                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                                        Cupom do Prescritor
                                      </Label>
                                      <div className="flex gap-2">
                                        <Input
                                          id={`nutri-coupon-${s.id}`}
                                          defaultValue={s.resolved_nutritionist_coupon || ''}
                                          placeholder="Código do Prescritor"
                                          className="h-8"
                                        />
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          className="h-8"
                                          onClick={() => {
                                            const val = (
                                              document.getElementById(
                                                `nutri-coupon-${s.id}`,
                                              ) as HTMLInputElement
                                            )?.value
                                            if (val !== undefined)
                                              saveCoupon(s.id, 'nutritionist_coupon', val)
                                          }}
                                        >
                                          Salvar
                                        </Button>
                                      </div>
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                                        Cupom do Paciente
                                      </Label>
                                      <div className="flex gap-2">
                                        <Input
                                          id={`patient-coupon-${s.id}`}
                                          defaultValue={s.resolved_patient_coupon || ''}
                                          placeholder="Código do Paciente"
                                          className="h-8"
                                        />
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          className="h-8"
                                          onClick={() => {
                                            const val = (
                                              document.getElementById(
                                                `patient-coupon-${s.id}`,
                                              ) as HTMLInputElement
                                            )?.value
                                            if (val !== undefined)
                                              saveCoupon(s.id, 'patient_coupon', val)
                                          }}
                                        >
                                          Salvar
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-6">
                                <div className="space-y-4">
                                  <h4 className="font-semibold text-sm border-b pb-2 text-primary">
                                    Status do Kit ({s.kit_name || 'Kit Padrão'})
                                  </h4>
                                  <div className="flex flex-col gap-3">
                                    <div className="flex items-center gap-2">
                                      <Badge
                                        variant={getStatusBadgeVariant(s.kit_status || s.status)}
                                        className="px-3 py-1 text-sm"
                                      >
                                        {s.kit_status || s.status || 'Pendente'}
                                      </Badge>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Select
                                        value={
                                          [
                                            'Pendente',
                                            'Aguardando NF',
                                            'NF Emitida',
                                            'Enviado',
                                            'Entregue',
                                          ].includes(s.kit_status || '')
                                            ? s.kit_status || ''
                                            : 'Pendente'
                                        }
                                        onValueChange={(val) => {
                                          if (val === 'Enviado' && s.kit_status !== 'Enviado') {
                                            sendKit(s)
                                          } else {
                                            updateKitStatus(s.id, val)
                                          }
                                        }}
                                      >
                                        <SelectTrigger className="w-[180px] h-9">
                                          <SelectValue placeholder="Alterar Status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="Pendente">Pendente</SelectItem>
                                          <SelectItem value="Aguardando NF">
                                            Aguardando NF
                                          </SelectItem>
                                          <SelectItem value="NF Emitida">NF Emitida</SelectItem>
                                          <SelectItem value="Enviado">Enviado</SelectItem>
                                          <SelectItem value="Entregue">Entregue</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      {(!s.kit_status ||
                                        s.kit_status === 'Pending' ||
                                        s.kit_status === 'Pendente') && (
                                        <Button
                                          size="sm"
                                          onClick={() => sendKit(s)}
                                          disabled={processingIds.has(s.id)}
                                          className="bg-blue-600 hover:bg-blue-700 text-white h-9"
                                        >
                                          {processingIds.has(s.id)
                                            ? 'Enviando...'
                                            : 'Marcar Enviado'}
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-4">
                                  <div className="flex items-center justify-between border-b pb-2">
                                    <h4 className="font-semibold text-sm text-primary flex items-center gap-2">
                                      Entrega & Logística
                                      {s.is_address_edited && (
                                        <Badge
                                          variant="outline"
                                          className="text-xs bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800"
                                        >
                                          Endereço Editado
                                        </Badge>
                                      )}
                                    </h4>
                                    {editingAddressId !== s.id ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => startEditingAddress(s)}
                                        className="h-7 text-xs px-2"
                                      >
                                        <Edit2 className="h-3 w-3 mr-1" /> Editar
                                      </Button>
                                    ) : (
                                      <div className="flex gap-1">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setEditingAddressId(null)}
                                          className="h-7 text-xs px-2 text-muted-foreground"
                                        >
                                          <X className="h-3 w-3 mr-1" /> Cancelar
                                        </Button>
                                        <Button
                                          variant="default"
                                          size="sm"
                                          onClick={() => saveAddress(s.id)}
                                          className="h-7 text-xs px-2"
                                        >
                                          <Save className="h-3 w-3 mr-1" /> Salvar
                                        </Button>
                                      </div>
                                    )}
                                  </div>

                                  {editingAddressId === s.id ? (
                                    <div className="space-y-3 pt-2">
                                      <div className="space-y-1.5">
                                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                                          CEP
                                        </Label>
                                        <div className="relative">
                                          <Input
                                            value={addressForm.clinic_cep}
                                            onChange={(e) => {
                                              let val = e.target.value.replace(/\D/g, '')
                                              if (val.length > 8) val = val.slice(0, 8)
                                              if (val.length > 5)
                                                val = `${val.slice(0, 5)}-${val.slice(5)}`
                                              setAddressForm((p) => ({
                                                ...p,
                                                clinic_cep: val,
                                              }))
                                            }}
                                            maxLength={9}
                                            placeholder="00000-000"
                                            className={`h-8 text-sm ${cepLoading ? 'pr-9' : ''}`}
                                          />
                                          {cepLoading && (
                                            <div className="absolute right-2.5 top-2">
                                              <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <div className="space-y-1.5">
                                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                                          Endereço
                                        </Label>
                                        <Input
                                          value={addressForm.clinic_address}
                                          onChange={(e) =>
                                            setAddressForm((p) => ({
                                              ...p,
                                              clinic_address: e.target.value,
                                            }))
                                          }
                                          className="h-8 text-sm"
                                        />
                                      </div>
                                      <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                                            Número
                                          </Label>
                                          <Input
                                            ref={clinicNumberRef}
                                            value={addressForm.clinic_number}
                                            onChange={(e) =>
                                              setAddressForm((p) => ({
                                                ...p,
                                                clinic_number: e.target.value,
                                              }))
                                            }
                                            className="h-8 text-sm"
                                          />
                                        </div>
                                        <div className="space-y-1.5">
                                          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                                            Complemento
                                          </Label>
                                          <Input
                                            value={addressForm.clinic_complement}
                                            onChange={(e) =>
                                              setAddressForm((p) => ({
                                                ...p,
                                                clinic_complement: e.target.value,
                                              }))
                                            }
                                            className="h-8 text-sm"
                                          />
                                        </div>
                                      </div>
                                      <div className="space-y-1.5">
                                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                                          Bairro
                                        </Label>
                                        <Input
                                          value={addressForm.clinic_neighborhood}
                                          onChange={(e) =>
                                            setAddressForm((p) => ({
                                              ...p,
                                              clinic_neighborhood: e.target.value,
                                            }))
                                          }
                                          className="h-8 text-sm"
                                        />
                                      </div>
                                      <div className="space-y-1.5">
                                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                                          Cidade
                                        </Label>
                                        <Input
                                          value={addressForm.clinic_city}
                                          onChange={(e) =>
                                            setAddressForm((p) => ({
                                              ...p,
                                              clinic_city: e.target.value,
                                            }))
                                          }
                                          className="h-8 text-sm"
                                        />
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="space-y-4 pt-2">
                                      <CopyField label="Endereço" value={s.resolved_address} />
                                      <div className="grid grid-cols-2 gap-3">
                                        <CopyField label="Número" value={s.resolved_number} />
                                        <CopyField
                                          label="Complemento"
                                          value={s.resolved_complement}
                                        />
                                      </div>
                                      <div className="grid grid-cols-2 gap-3">
                                        <CopyField label="Bairro" value={s.resolved_neighborhood} />
                                        <CopyField label="CEP" value={s.resolved_cep} />
                                      </div>
                                      <CopyField label="Cidade" value={s.resolved_city} />
                                    </div>
                                  )}

                                  <div className="space-y-2 pt-4 border-t mt-4">
                                    <Label className="text-foreground font-bold flex items-center gap-2">
                                      <Truck className="h-4 w-4" />
                                      Código de Rastreio
                                    </Label>
                                    <div className="flex gap-2">
                                      <Input
                                        defaultValue={s.tracking_number || ''}
                                        placeholder="Ex: BR123456789BR"
                                        id={`track-${s.id}`}
                                        className="bg-background"
                                      />
                                      <Button
                                        onClick={() => {
                                          const el = document.getElementById(
                                            `track-${s.id}`,
                                          ) as HTMLInputElement
                                          if (el) updateTracking(s.id, el.value)
                                        }}
                                      >
                                        Salvar
                                      </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      Dica: Ao salvar o código, o status do kit é atualizado para
                                      "Enviado" automaticamente.
                                    </p>
                                    {s.tracking_number && (
                                      <Button
                                        variant="link"
                                        size="sm"
                                        className="h-8 px-0 text-primary"
                                        asChild
                                      >
                                        <a
                                          href={`https://melhorrastreio.com.br/rastreio/${s.tracking_number}`}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          Acompanhar Rastreio{' '}
                                          <ExternalLink className="ml-1 h-3 w-3" />
                                        </a>
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser desfeita. O registro será excluído
                                permanentemente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteShipment(s.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
