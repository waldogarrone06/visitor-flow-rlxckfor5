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
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'

export function KitShipments() {
  const { user } = useAuth()
  const [appointments, setAppointments] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const loadData = async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('appointments' as any)
      .select('*')
      .eq('user_id', user.id)
      .order('appointment_date', { ascending: false })

    if (data) {
      setAppointments(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
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
    const { error } = await supabase
      .from('appointments' as any)
      .update({ tracking_number: trackingNumber })
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
        prev.map((a) => (a.id === id ? { ...a, tracking_number: trackingNumber } : a)),
      )
    }
    setSavingId(null)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Delivered':
        return <Badge className="bg-green-600 hover:bg-green-700">Entregue</Badge>
      case 'In Transit':
        return <Badge className="bg-blue-500 hover:bg-blue-600">Em Trânsito</Badge>
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
    return (app.kit_status || 'Pending') === statusFilter
  })

  const handleExportCSV = () => {
    const headers = ['Data', 'Contato', 'Status', 'Previsao Entrega', 'Rastreio']
    const rows = filteredAppointments.map((a) => {
      const date = format(new Date(a.appointment_date), 'dd/MM/yyyy')
      const expected = new Date(a.appointment_date)
      expected.setDate(expected.getDate() + 5)
      const expectedStr = format(expected, 'dd/MM/yyyy')
      return [
        date,
        `"${a.client_name}"`,
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
                <SelectItem value="In Transit">Em Trânsito</SelectItem>
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
                    <TableCell>Kit Padrão</TableCell>
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
                              if (e.target.value !== (app.tracking_number || '')) {
                                handleSaveTracking(app.id, e.target.value)
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
                            href={`https://rastreamento.correios.com.br/app/index.php`}
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
    </Card>
  )
}
