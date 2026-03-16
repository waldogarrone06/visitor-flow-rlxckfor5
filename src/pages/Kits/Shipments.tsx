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
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ExternalLink } from 'lucide-react'

export function KitShipments() {
  const { state } = useMainStore()

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Delivered':
        return <Badge className="bg-success hover:bg-success/80">Entregue</Badge>
      case 'In Transit':
        return <Badge className="bg-blue-500 hover:bg-blue-600">Em Trânsito</Badge>
      default:
        return <Badge variant="secondary">Solicitado</Badge>
    }
  }

  return (
    <Card className="shadow-subtle">
      <CardHeader>
        <CardTitle className="text-lg">Rastreio de Envios Recentes</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Kit Enviado</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Rastreio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.shipments.map((shipment) => {
              const contact = state.leads.find((l) => l.id === shipment.contactId)
              const kit = state.kits.find((k) => k.id === shipment.kitId)

              return (
                <TableRow key={shipment.id}>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(shipment.date), 'dd/MM/yy', { locale: ptBR })}
                  </TableCell>
                  <TableCell className="font-medium">{contact?.name || 'Desconhecido'}</TableCell>
                  <TableCell>{kit?.name || 'Kit Padrão'}</TableCell>
                  <TableCell>{getStatusBadge(shipment.status)}</TableCell>
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
            {state.shipments.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  Nenhum envio registrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
