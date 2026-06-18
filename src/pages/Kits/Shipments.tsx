import { useState, useEffect } from 'react'
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
import { useToast } from '@/hooks/use-toast'
import { Copy, Truck, ExternalLink, Package, Check, Trash2 } from 'lucide-react'
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
  nutritionist_coupon: string | null
  patient_coupon: string | null
  resolved_document: string
  resolved_cep: string
  resolved_address: string
  resolved_nutritionist_coupon: string
  resolved_patient_coupon: string
}

export function KitShipments() {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    fetchShipments()
  }, [])

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

    const [appRes, contRes] = await Promise.all([
      supabase
        .from('appointments')
        .select('*')
        .eq('user_id', session.user.id)
        .not('kit_status', 'is', null)
        .neq('status', 'Lead')
        .order('created_at', { ascending: false }),
      supabase
        .from('contacts')
        .select('name, email, phone, document, cep, address, nutritionist_coupon, patient_coupon')
        .eq('user_id', session.user.id),
    ])

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
          resolved_cep: c?.cep || a.clinic_cep || extractCEP(a.clinic_address) || '',
          resolved_address: c?.address || a.clinic_address || '',
          resolved_nutritionist_coupon: a.nutritionist_coupon || c?.nutritionist_coupon || '',
          resolved_patient_coupon: a.patient_coupon || c?.patient_coupon || '',
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
      toast({ title: 'Sucesso', description: 'Status atualizado.' })
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

    const { error } = await supabase
      .from('appointments')
      .update({ kit_status: 'Enviado' })
      .eq('id', s.id)

    if (error) {
      toast({ title: 'Erro', description: 'Falha ao atualizar status.', variant: 'destructive' })
      return
    }

    toast({
      title: 'Kit Enviado!',
      description: 'O status foi atualizado e as mensagens de notificação estão sendo disparadas.',
    })
    fetchShipments()

    const message = `Olá, ${s.client_name}! Seu kit da Fourlab Nutrition foi enviado com sucesso.
Rastreio: ${s.tracking_number}
Cupom Prescritor: ${s.resolved_nutritionist_coupon}
Cupom Paciente: ${s.resolved_patient_coupon}

Obrigado por confiar em nosso trabalho!`

    if (s.client_phone) {
      supabase.functions.invoke('whatsapp-send', {
        body: { to: s.client_phone, text: message, userId: s.user_id },
      })
    }

    if (s.client_email) {
      supabase.functions.invoke('send-email', {
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
  }

  return (
    <Card className="w-full max-w-full shadow-sm animate-fade-in">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <CardTitle className="text-xl font-semibold tracking-tight">Envios e Entregas</CardTitle>
          <CardDescription className="mt-1">
            Acompanhe e gerencie a logística dos kits solicitados.
          </CardDescription>
        </div>
        <Button onClick={fetchShipments} variant="outline" size="sm" className="shrink-0">
          Atualizar Lista
        </Button>
      </CardHeader>

      <CardContent className="p-0 sm:p-6 sm:pt-0">
        <div className="w-full overflow-x-auto border-y sm:border rounded-none sm:rounded-md bg-card">
          <Table className="w-full min-w-[800px]">
            <TableHeader>
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
              ) : shipments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhum envio encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                shipments.map((s) => (
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
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-[150px]" title={s.kit_name || 'Kit Padrão'}>
                          {s.kit_name || 'Kit Padrão'}
                        </span>
                      </div>
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
                      <Badge
                        variant={
                          s.kit_status === 'Entregue' || s.kit_status === 'Delivered'
                            ? 'default'
                            : s.kit_status === 'Enviado'
                              ? 'secondary'
                              : 'outline'
                        }
                      >
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
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            Enviar Kit
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
                                  <div className="flex flex-wrap gap-2 items-center">
                                    <Badge
                                      variant={
                                        s.kit_status === 'Entregue' || s.kit_status === 'Delivered'
                                          ? 'default'
                                          : s.kit_status === 'Enviado'
                                            ? 'secondary'
                                            : 'outline'
                                      }
                                      className="px-3 py-1 text-sm"
                                    >
                                      {s.kit_status || s.status || 'Pendente'}
                                    </Badge>

                                    {(!s.kit_status ||
                                      s.kit_status === 'Pending' ||
                                      s.kit_status === 'Pendente') && (
                                      <Button
                                        size="sm"
                                        onClick={() => sendKit(s)}
                                        className="bg-blue-600 hover:bg-blue-700 text-white h-8"
                                      >
                                        Marcar Enviado
                                      </Button>
                                    )}

                                    {s.kit_status !== 'Entregue' &&
                                      s.kit_status !== 'Delivered' && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8"
                                          onClick={() => updateKitStatus(s.id, 'Entregue')}
                                        >
                                          Marcar Entregue
                                        </Button>
                                      )}
                                  </div>
                                </div>

                                <div className="space-y-4">
                                  <h4 className="font-semibold text-sm border-b pb-2 text-primary">
                                    Entrega & Logística
                                  </h4>
                                  <CopyField label="CEP" value={s.resolved_cep} />
                                  <CopyField label="Endereço Completo" value={s.resolved_address} />

                                  <div className="space-y-2 pt-4">
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
