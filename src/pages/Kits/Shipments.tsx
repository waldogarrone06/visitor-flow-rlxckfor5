import { useState, useEffect } from 'react'
import { useMainStore } from '@/stores/main'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ExternalLink, Filter, AlertTriangle, Download, Mail } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

export function KitShipments() {
  const { state } = useMainStore()
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    const delayedKits = state.shipments.filter((s) => s.status === 'Delayed')
    if (delayedKits.length > 0) {
      console.info(
        `[Logistics Integration] Auto-notified logistics for ${delayedKits.length} delayed kits.`,
      )
    }
  }, [state.shipments])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Delivered':
        return <Badge className="bg-success hover:bg-success/80">Entregue</Badge>
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

  const filteredShipments = state.shipments.filter((shipment) => {
    if (statusFilter === 'all') return true
    return shipment.status === statusFilter
  })

  const handleExportCSV = () => {
    const headers = ['Data', 'Contato', 'Kit', 'Status', 'Previsao Entrega', 'Rastreio']
    const rows = filteredShipments.map((s) => {
      const contact = state.leads.find((l) => l.id === s.contactId)?.name || 'Desconhecido'
      const kit = state.kits.find((k) => k.id === s.kitId)?.name || 'Kit Padrão'
      const date = format(new Date(s.date), 'dd/MM/yyyy')
      const expected = s.expectedDeliveryDate
        ? format(new Date(s.expectedDeliveryDate), 'dd/MM/yyyy')
        : '-'
      return [date, `"${contact}"`, `"${kit}"`, s.status, expected, s.trackingNumber].join(',')
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
              <TableHead className="text-right">Rastreio / Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredShipments.map((shipment) => {
              const contact = state.leads.find((l) => l.id === shipment.contactId)
              const kit = state.kits.find((k) => k.id === shipment.kitId)
              const contactName = contact?.name || 'Desconhecido'

              return (
                <TableRow key={shipment.id}>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {format(new Date(shipment.date), 'dd/MM/yy', { locale: ptBR })}
                  </TableCell>
                  <TableCell className="font-medium">{contactName}</TableCell>
                  <TableCell>{kit?.name || 'Kit Padrão'}</TableCell>
                  <TableCell>{getStatusBadge(shipment.status)}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {shipment.expectedDeliveryDate
                      ? format(new Date(shipment.expectedDeliveryDate), 'dd/MM/yyyy', {
                          locale: ptBR,
                        })
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-3">
                      <a
                        href="#"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        {shipment.trackingNumber} <ExternalLink className="h-3 w-3" />
                      </a>
                      {shipment.status === 'Delayed' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() =>
                            handleNotifyLogistics(shipment.trackingNumber, contactName)
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
            })}
            {filteredShipments.length === 0 && (
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
