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
import { useToast } from '@/hooks/use-toast'
import { Copy, Truck, ExternalLink, Package, Check } from 'lucide-react'
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

export function KitShipments() {
  const [shipments, setShipments] = useState<any[]>([])
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

  const sendKit = async (s: any) => {
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

    const message = `Olá, ${s.client_name}! Seu kit da Fourlab Nutrition foi enviado com sucesso. Em breve você receberá o código de rastreio para acompanhar a entrega. Obrigado por confiar em nosso trabalho!`

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
          html: `<div style="font-family: sans-serif; color: #333;"><p>Olá, ${s.client_name}!</p><p>Seu kit da Fourlab Nutrition foi enviado com sucesso. Em breve você receberá o código de rastreio para acompanhar a entrega.</p><p>Obrigado por confiar em nosso trabalho!</p></div>`,
          senderName: 'FourLab Nutrition',
        },
      })
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Envios e Entregas</h2>
          <p className="text-sm text-muted-foreground">
            Acompanhe e gerencie a logística dos kits solicitados.
          </p>
        </div>
        <Button onClick={fetchShipments} variant="outline" size="sm">
          Atualizar Lista
        </Button>
      </div>

      <div className="border rounded-md bg-card overflow-x-auto">
        <Table className="min-w-[600px]">
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Kit Solicitado</TableHead>
              <TableHead>Rastreio</TableHead>
              <TableHead>Data de Entrega</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
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
                  <TableCell>
                    {format(new Date(s.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                  </TableCell>
                  <TableCell className="font-medium">{s.client_name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      {s.kit_name || 'Kit Padrão'}
                    </div>
                  </TableCell>
                  <TableCell>
                    {s.tracking_number ? (
                      <div className="flex items-center gap-1 text-sm font-medium">
                        <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                        {s.tracking_number}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {s.delivered_at ? (
                      format(new Date(s.delivered_at), 'dd/MM/yyyy', { locale: ptBR })
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        s.kit_status === 'Entregue' || s.kit_status === 'Delivered'
                          ? 'default'
                          : s.kit_status === 'Enviado'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {s.kit_status || 'Pendente'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
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
                            Ver Detalhes
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
                                <CopyField label="Telefone" value={s.client_phone} />
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
                                    {s.kit_status || 'Pendente'}
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

                                  {s.kit_status !== 'Entregue' && s.kit_status !== 'Delivered' && (
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
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
