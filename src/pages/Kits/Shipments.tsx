import { useEffect, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { ExternalLink, Save, RefreshCw, ThumbsUp, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Appointment = {
  id: string
  client_name: string
  client_email: string
  kit_name: string
  kit_status: string
  tracking_number: string
  delivered_at: string | null
  nutritionist_coupon: string | null
  patient_coupon: string | null
}

export function KitShipments() {
  const [shipments, setShipments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [trackingInputs, setTrackingInputs] = useState<Record<string, string>>({})
  const [nutritionistInputs, setNutritionistInputs] = useState<Record<string, string>>({})
  const [patientInputs, setPatientInputs] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savingCouponsId, setSavingCouponsId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [searchName, setSearchName] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  const filteredShipments = shipments.filter((s) => {
    const matchesName = searchName
      ? s.client_name.toLowerCase().includes(searchName.toLowerCase())
      : true
    const sStatus = s.kit_status || 'Pending'
    const matchesStatus =
      filterStatus !== 'all'
        ? filterStatus === 'Entregue'
          ? sStatus === 'Entregue' || sStatus === 'Delivered'
          : filterStatus === 'Pending'
            ? sStatus === 'Pending'
            : sStatus === filterStatus
        : true

    return matchesName && matchesStatus
  })

  const fetchShipments = async () => {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(
          'id, client_name, client_email, kit_name, kit_status, tracking_number, delivered_at, nutritionist_coupon, patient_coupon',
        )
        .not('kit_name', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      setShipments(data || [])

      const tInputs: Record<string, string> = {}
      const nutInputs: Record<string, string> = {}
      const patInputs: Record<string, string> = {}
      ;(data || []).forEach((s) => {
        tInputs[s.id] = s.tracking_number || ''
        nutInputs[s.id] = s.nutritionist_coupon || ''
        patInputs[s.id] = s.patient_coupon || ''
      })
      setTrackingInputs(tInputs)
      setNutritionistInputs(nutInputs)
      setPatientInputs(patInputs)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const syncTracking = async (appointmentId?: string) => {
    try {
      const payload = appointmentId ? { appointmentId } : {}
      const { data, error } = await supabase.functions.invoke('track-shipping', { body: payload })
      if (!error && data?.updatedCount > 0) {
        await fetchShipments()
      }
    } catch (err) {
      console.error('Background sync failed:', err)
    }
  }

  const handleManualSync = async () => {
    try {
      setSyncing(true)
      const { data, error } = await supabase.functions.invoke('track-shipping', { body: {} })
      if (error) throw error
      if (data?.updatedCount > 0) {
        toast.success(`${data.updatedCount} envio(s) atualizado(s) com sucesso!`)
        await fetchShipments()
      } else {
        toast.info('Nenhum status novo encontrado na transportadora.')
      }
    } catch (err: any) {
      toast.error('Erro na sincronização', { description: err.message })
    } finally {
      setSyncing(false)
    }
  }

  const handleSaveCouponsAndSendEmails = async (appointment: Appointment) => {
    try {
      setSavingCouponsId(appointment.id)
      const nutriCoupon = nutritionistInputs[appointment.id]?.trim() || null
      const patCoupon = patientInputs[appointment.id]?.trim() || null

      const { error: dbErr } = await supabase
        .from('appointments')
        .update({
          nutritionist_coupon: nutriCoupon,
          patient_coupon: patCoupon,
        })
        .eq('id', appointment.id)

      if (dbErr) throw dbErr

      if (nutriCoupon || patCoupon) {
        const { error: mktErr } = await supabase.functions.invoke('send-email', {
          body: {
            to: 'marketing@fourlabnutri.com.br',
            subject: 'Solicitação de Cadastro de Cupom - Yampi',
            html: `
              <h2>Solicitação de Cadastro de Cupons</h2>
              <p><strong>Profissional:</strong> ${appointment.client_name}</p>
              <p><strong>Email:</strong> ${appointment.client_email}</p>
              <br/>
              <p>Favor cadastrar os seguintes cupons na plataforma Yampi:</p>
              <ul>
                <li><strong>Cupom Nutri (Uso pessoal):</strong> ${nutriCoupon || 'Não informado'}</li>
                <li><strong>Cupom Paciente (Distribuição):</strong> ${patCoupon || 'Não informado'}</li>
              </ul>
            `,
            senderName: 'Sistema Fourlab',
          },
        })
        if (mktErr) console.error('Erro ao enviar email MKT:', mktErr)
      }

      if (appointment.client_email) {
        const { error: presErr } = await supabase.functions.invoke('send-email', {
          body: {
            to: appointment.client_email,
            subject: 'Obrigado pela sua visita e tá aqui seus cupons.',
            html: `
              <p>Prezado(a) ${appointment.client_name},</p>
              <p>Agradecemos a visita à Fourlab. Foi excelente discutir como nossa tecnologia de suplementação pode otimizar o suporte metabólico e a performance no endurance.</p>
              <p>Para uso pessoal e prescrição, seguem seus benefícios:<br/>
              Uso Pessoal: ${nutriCoupon || 'N/A'}<br/>
              Para Pacientes: ${patCoupon || 'N/A'}</p>
              <p>Estamos à disposição para suporte técnico.</p>
              <p>Atenciosamente, Juliana Maciel<br/>
              Fourlab<br/>
              Ciência e Performance</p>
            `,
            senderName: 'Fourlab Nutrition',
          },
        })
        if (presErr) console.error('Erro ao enviar email prescritor:', presErr)
      }

      toast.success('Cupons salvos e e-mails enviados com sucesso!')
      await fetchShipments()
    } catch (err: any) {
      toast.error('Erro ao processar', { description: err.message })
    } finally {
      setSavingCouponsId(null)
    }
  }

  const handleSaveTracking = async (id: string) => {
    try {
      setSavingId(id)
      const newTracking = trackingInputs[id]?.trim() || null

      const { error } = await supabase
        .from('appointments')
        .update({ tracking_number: newTracking })
        .eq('id', id)

      if (error) throw error

      toast.success('Rastreio atualizado com sucesso!')
      await fetchShipments()

      // Trigger background sync for the new tracking number automatically
      syncTracking(id)
    } catch (err: any) {
      toast.error('Erro ao salvar rastreio', { description: err.message })
    } finally {
      setSavingId(null)
    }
  }

  useEffect(() => {
    fetchShipments().then(() => {
      // Perform initial background sync after first load
      syncTracking()
    })
  }, [])

  const getTrackingLink = (code: string) => {
    if (code.startsWith('LGI')) {
      return `https://www.melhorrastreio.com.br/app/loggi/${code}`
    }
    return `https://www.melhorrastreio.com.br/app/${code}`
  }

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Carregando envios...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-medium">Status dos Envios</h3>
          <p className="text-sm text-muted-foreground">
            Acompanhe e sincronize o status dos kits enviados.
          </p>
        </div>
        <Button onClick={handleManualSync} disabled={syncing} variant="outline" size="sm">
          <RefreshCw className={cn('mr-2 h-4 w-4', syncing && 'animate-spin')} />
          {syncing ? 'Sincronizando...' : 'Sincronizar Status'}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <Input
          placeholder="Filtrar por nome..."
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          className="max-w-sm w-full sm:w-auto"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            <SelectItem value="Pending">Pendente</SelectItem>
            <SelectItem value="Enviado">Enviado</SelectItem>
            <SelectItem value="Entregue">Entregue</SelectItem>
          </SelectContent>
        </Select>
        {(searchName || filterStatus !== 'all') && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearchName('')
              setFilterStatus('all')
            }}
            className="w-full sm:w-auto"
          >
            Limpar Filtros
          </Button>
        )}
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome do Prescritor</TableHead>
                <TableHead>Kit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rastreio</TableHead>
                <TableHead>Cupom Nutri</TableHead>
                <TableHead>Cupom Paciente</TableHead>
                <TableHead className="w-16">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredShipments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {searchName || filterStatus !== 'all'
                      ? 'Nenhum envio encontrado com os filtros selecionados.'
                      : 'Nenhum kit atribuído.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredShipments.map((shipment) => (
                  <TableRow key={shipment.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {shipment.client_name}
                    </TableCell>
                    <TableCell>{shipment.kit_name || '-'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          shipment.kit_status === 'Entregue' || shipment.kit_status === 'Delivered'
                            ? 'default'
                            : shipment.kit_status === 'Enviado'
                              ? 'default'
                              : 'secondary'
                        }
                        className={
                          shipment.kit_status === 'Entregue' || shipment.kit_status === 'Delivered'
                            ? 'bg-green-500 hover:bg-green-600 text-white border-transparent'
                            : shipment.kit_status === 'Enviado'
                              ? 'bg-blue-500 hover:bg-blue-600 text-white border-transparent'
                              : 'bg-yellow-500 hover:bg-yellow-600 text-white border-transparent'
                        }
                      >
                        {shipment.kit_status || 'Pending'}
                      </Badge>
                      {(shipment.kit_status === 'Entregue' ||
                        shipment.kit_status === 'Delivered') &&
                        shipment.delivered_at && (
                          <div className="text-[10px] text-muted-foreground mt-1 whitespace-nowrap">
                            {new Date(shipment.delivered_at).toLocaleDateString('pt-BR')}
                          </div>
                        )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          value={trackingInputs[shipment.id] ?? ''}
                          onChange={(e) =>
                            setTrackingInputs((prev) => ({
                              ...prev,
                              [shipment.id]: e.target.value,
                            }))
                          }
                          placeholder="Código de rastreio"
                          className="w-32 sm:w-48 h-8 text-xs"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveTracking(shipment.id)
                          }}
                        />
                        {trackingInputs[shipment.id] !== (shipment.tracking_number || '') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary"
                            onClick={() => handleSaveTracking(shipment.id)}
                            disabled={savingId === shipment.id}
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                        )}
                        {shipment.tracking_number && (
                          <a
                            href={getTrackingLink(shipment.tracking_number)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:text-primary/80 transition-colors"
                            title="Rastrear"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={nutritionistInputs[shipment.id] ?? ''}
                        onChange={(e) =>
                          setNutritionistInputs((p) => ({ ...p, [shipment.id]: e.target.value }))
                        }
                        placeholder="Ex: NUTRI10"
                        className="w-24 sm:w-32 h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={patientInputs[shipment.id] ?? ''}
                        onChange={(e) =>
                          setPatientInputs((p) => ({ ...p, [shipment.id]: e.target.value }))
                        }
                        placeholder="Ex: PACI10"
                        className="w-24 sm:w-32 h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-primary hover:text-green-600 hover:bg-green-50"
                        onClick={() => handleSaveCouponsAndSendEmails(shipment)}
                        disabled={savingCouponsId === shipment.id}
                        title="Salvar Cupons e Enviar E-mails"
                      >
                        {savingCouponsId === shipment.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ThumbsUp className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
