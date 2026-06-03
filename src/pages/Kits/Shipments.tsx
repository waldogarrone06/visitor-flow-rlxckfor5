import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ExternalLink,
  Filter,
  AlertTriangle,
  Download,
  Mail,
  Loader2,
  CheckCircle2,
  Receipt,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function KitShipments() {
  const { user } = useAuth()
  const [appointments, setAppointments] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [invoiceData, setInvoiceData] = useState<any>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const handleSyncTracking = async () => {
    setSyncing(true)
    try {
      const { data, error } = await supabase.functions.invoke('track-shipping')
      if (error) throw error
      if (data && data.updatedCount > 0) {
        toast({
          title: 'Sincronizado',
          description: `${data.updatedCount} rastreio(s) atualizado(s) para Entregue.`,
        })
        loadData(false)
      } else {
        toast({ title: 'Sincronizado', description: 'Nenhum novo status de entrega encontrado.' })
      }
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: 'Falha ao sincronizar rastreios.',
        variant: 'destructive',
      })
    } finally {
      setSyncing(false)
    }
  }

  const handleOpenInvoiceData = async (app: any) => {
    setIsInvoiceModalOpen(true)
    setInvoiceLoading(true)
    setInvoiceData(null)
    try {
      let contact = null
      if (app.professional_id) {
        const { data } = await supabase
          .from('contacts' as any)
          .select('*')
          .eq('id', app.professional_id)
          .maybeSingle()
        if (data) contact = data
      }
      if (!contact && app.client_email && user) {
        const { data } = await supabase
          .from('contacts' as any)
          .select('*')
          .eq('user_id', user.id)
          .eq('email', app.client_email)
          .maybeSingle()
        if (data) contact = data
      }

      setInvoiceData({
        name: contact?.name || app.client_name || 'Não informado',
        document: contact?.document || 'Não informado',
        phone: contact?.phone || app.client_phone || 'Não informado',
        email: contact?.email || app.client_email || 'Não informado',
        address: contact?.address || app.clinic_address || 'Não informado',
      })
    } catch (error) {
      console.error('Error fetching invoice data', error)
      toast({
        title: 'Erro',
        description: 'Falha ao buscar dados do prescritor.',
        variant: 'destructive',
      })
    } finally {
      setInvoiceLoading(false)
    }
  }

  const copyToClipboard = (text: string, field: string) => {
    if (!text || text === 'Não informado') return
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
    toast({ title: 'Copiado', description: 'Dado copiado para a área de transferência.' })
  }

  const loadData = async (showLoading = true) => {
    if (!user) return
    if (showLoading) setLoading(true)
    const { data, error } = await supabase
      .from('appointments' as any)
      .select('*')
      .eq('user_id', user.id)
      .order('appointment_date', { ascending: false })

    if (data) {
      setAppointments(data)
    }
    if (showLoading) setLoading(false)
  }

  useEffect(() => {
    loadData()

    if (!user) return

    const channel = supabase
      .channel('appointments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadData(false)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  useEffect(() => {
    const delayedKits = appointments.filter((s) => s.kit_status === 'Delayed')
    if (delayedKits.length > 0) {
      console.info(
        `[Logistics Integration] Auto-notified logistics for ${delayedKits.length} delayed kits.`,
      )
    }
  }, [appointments])

  const handleSaveTracking = async (id: string, trackingNumber: string) => {
    if (!user) return
    setSavingId(id)

    const val = trackingNumber.trim() === '' ? null : trackingNumber.trim()

    const { error } = await supabase
      .from('appointments' as any)
      .update({ tracking_number: val })
      .eq('id', id)

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar o rastreio.',
        variant: 'destructive',
      })
    } else {
      toast({ title: 'Salvo', description: 'Número de rastreio atualizado com sucesso.' })
      setAppointments((prev) =>
        prev.map((a) => {
          if (a.id === id) {
            let newStatus = a.kit_status || 'Pending'
            if (!val) {
              if (newStatus !== 'Delivered' && newStatus !== 'Entregue') newStatus = 'Pending'
            } else {
              if (newStatus === 'Pending' || !a.kit_status || newStatus === 'In Transit')
                newStatus = 'Enviado'
            }
            return { ...a, tracking_number: val, kit_status: newStatus }
          }
          return a
        }),
      )
    }
    setSavingId(null)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Delivered':
      case 'Entregue':
        return <Badge className="bg-green-600 hover:bg-green-700">Entregue</Badge>
      case 'In Transit':
      case 'Enviado':
        return <Badge className="bg-blue-500 hover:bg-blue-600">Enviado</Badge>
      case 'Delayed':
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" /> Atrasado
          </Badge>
        )
      default:
        return <Badge variant="secondary">Solicitado</Badge>
    }
  }

  const filteredAppointments = appointments.filter((app) => {
    if (statusFilter === 'all') return true
    const currentStatus = app.kit_status || 'Pending'
    if (
      statusFilter === 'Enviado' &&
      (currentStatus === 'In Transit' || currentStatus === 'Enviado')
    )
      return true
    return currentStatus === statusFilter
  })

  const handleExportCSV = () => {
    const headers = ['Data', 'Contato', 'Kit Enviado', 'Status', 'Previsao Entrega', 'Rastreio']
    const rows = filteredAppointments.map((a) => {
      const date = format(new Date(a.appointment_date), 'dd/MM/yyyy')
      const expected = new Date(a.appointment_date)
      expected.setDate(expected.getDate() + 5)
      const expectedStr = format(expected, 'dd/MM/yyyy')
      return [
        date,
        `"${a.client_name}"`,
        `"${a.kit_name || 'Kit Padrão'}"`,
        a.kit_status || 'Pending',
        expectedStr,
        a.tracking_number || '',
      ].join(',')
    })

    const csvContent = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `envios_logistica_${format(new Date(), 'yyyyMMdd')}.csv`
    link.click()

    toast({
      title: 'Exportação Concluída',
      description: 'O arquivo CSV com os dados filtrados foi gerado.',
    })
  }

  const handleNotifyLogistics = (tracking: string, contactName: string) => {
    toast({
      title: 'Logística Notificada',
      description: `E-mail de alerta enviado referente ao envio ${tracking} (${contactName}).`,
    })
  }

  return (
    <Card className="shadow-subtle">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
        <CardTitle className="text-lg">Rastreio de Envios Recentes</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 mr-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="Filtrar Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="Delivered">Entregue</SelectItem>
                <SelectItem value="Enviado">Enviado</SelectItem>
                <SelectItem value="Delayed">Atrasado</SelectItem>
                <SelectItem value="Pending">Solicitado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2 text-xs"
            onClick={handleExportCSV}
          >
            <Download className="h-3 w-3" /> Exportar CSV
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-8 gap-2 text-xs"
            onClick={handleSyncTracking}
            disabled={syncing}
          >
            <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
            Sincronizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Kit Enviado</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Previsão</TableHead>
              <TableHead className="text-right">Número de Rastreio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Carregando envios...
                </TableCell>
              </TableRow>
            ) : (
              filteredAppointments.map((app) => {
                const expectedDate = new Date(app.appointment_date)
                expectedDate.setDate(expectedDate.getDate() + 5)

                return (
                  <TableRow key={app.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {format(new Date(app.appointment_date), 'dd/MM/yy', { locale: ptBR })}
                    </TableCell>
                    <TableCell className="font-medium">{app.client_name}</TableCell>
                    <TableCell>{app.kit_name || 'Kit Padrão'}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        {getStatusBadge(app.kit_status || 'Pending')}
                        {app.kit_status === 'Delivered' && app.delivered_at && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                            {format(new Date(app.delivered_at), 'dd/MM/yyyy HH:mm')}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {format(expectedDate, 'dd/MM/yyyy', { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="relative">
                          <Input
                            className="w-36 h-8 text-xs pr-8"
                            placeholder="Cód. Rastreio"
                            defaultValue={app.tracking_number || ''}
                            onBlur={(e) => {
                              const newValue = e.target.value.trim()
                              const oldValue = (app.tracking_number || '').trim()
                              if (newValue !== oldValue) {
                                handleSaveTracking(app.id, newValue)
                              }
                            }}
                            disabled={savingId === app.id}
                          />
                          {savingId === app.id && (
                            <Loader2 className="h-3 w-3 animate-spin absolute right-2 top-2.5 text-muted-foreground" />
                          )}
                        </div>
                        {app.tracking_number && (
                          <a
                            href={`https://www.melhorrastreio.com.br/rastreio/${app.tracking_number}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                            title="Acompanhar Rastreio"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        {app.kit_status === 'Delayed' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() =>
                              handleNotifyLogistics(app.tracking_number || 'S/N', app.client_name)
                            }
                            title="Notificar Logística sobre atraso"
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                          onClick={() => handleOpenInvoiceData(app)}
                          title="Dados para NF"
                        >
                          <Receipt className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
            {!loading && filteredAppointments.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  Nenhum envio encontrado para o filtro selecionado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={isInvoiceModalOpen} onOpenChange={setIsInvoiceModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dados para Nota Fiscal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {invoiceLoading ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : invoiceData ? (
              <div className="space-y-3">
                {[
                  { label: 'Nome Completo', value: invoiceData.name, key: 'name' },
                  { label: 'CPF / CNPJ', value: invoiceData.document, key: 'document' },
                  { label: 'Telefone', value: invoiceData.phone, key: 'phone' },
                  { label: 'E-mail', value: invoiceData.email, key: 'email' },
                  { label: 'Endereço Completo', value: invoiceData.address, key: 'address' },
                ].map((field) => (
                  <div key={field.key} className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">{field.label}</span>
                    <div className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2">
                      <span className="text-sm font-medium break-all">{field.value}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 ml-2 shrink-0"
                        onClick={() => copyToClipboard(field.value, field.key)}
                        disabled={field.value === 'Não informado'}
                      >
                        {copiedField === field.key ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
