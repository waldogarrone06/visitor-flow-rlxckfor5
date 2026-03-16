import { useState } from 'react'
import { useMainStore } from '@/stores/main'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
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
import { ExternalLink, Filter } from 'lucide-react'

export function KitShipments() {
  const { state } = useMainStore()
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Delivered':
        return <Badge className="bg-success hover:bg-success/80">Entregue</Badge>
      case 'In Transit':
        return <Badge className="bg-blue-500 hover:bg-blue-600">Em Trânsito</Badge>
      case 'Delayed':
        return <Badge variant="destructive">Atrasado</Badge>
      default:
        return <Badge variant="secondary">Solicitado</Badge>
    }
  }

  const filteredShipments = state.shipments.filter((shipment) => {
    if (statusFilter === 'all') return true
    return shipment.status === statusFilter
  })

  return (
    <Card className="shadow-subtle">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
        <CardTitle className="text-lg">Rastreio de Envios Recentes</CardTitle>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] h-8">
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
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Kit Enviado</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Previsão de Entrega</TableHead>
              <TableHead className="text-right">Rastreio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredShipments.map((shipment) => {
              const contact = state.leads.find((l) => l.id === shipment.contactId)
              const kit = state.kits.find((k) => k.id === shipment.kitId)

              return (
                <TableRow key={shipment.id}>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {format(new Date(shipment.date), 'dd/MM/yy', { locale: ptBR })}
                  </TableCell>
                  <TableCell className="font-medium">{contact?.name || 'Desconhecido'}</TableCell>
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
                    <a
                      href="#"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      {shipment.trackingNumber} <ExternalLink className="h-3 w-3" />
                    </a>
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
