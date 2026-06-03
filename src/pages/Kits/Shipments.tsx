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
import { toast } from 'sonner'
import { RefreshCw, ExternalLink } from 'lucide-react'

type Appointment = {
  id: string
  client_name: string
  kit_name: string
  kit_status: string
  tracking_number: string
  delivered_at: string | null
}

export function KitShipments() {
  const [shipments, setShipments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [syncingId, setSyncingId] = useState<string | null>(null)

  const fetchShipments = async () => {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, client_name, kit_name, kit_status, tracking_number, delivered_at')
        .not('tracking_number', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      setShipments(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchShipments()
  }, [])

  const handleManualSync = async (id: string) => {
    try {
      setSyncingId(id)
      const { data, error } = await supabase.functions.invoke('track-shipping', {
        method: 'POST',
        body: { appointmentId: id },
      })

      if (error) throw error

      if (data && data.updatedCount > 0) {
        toast.success('Status atualizado para Entregue!')
        await fetchShipments()
      } else {
        toast.info('Nenhuma mudança no status de entrega no momento.')
      }
    } catch (err: any) {
      toast.error('Erro ao sincronizar', { description: err.message })
    } finally {
      setSyncingId(null)
    }
  }

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
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Paciente</TableHead>
              <TableHead>Kit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Rastreio</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shipments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Nenhum envio com código de rastreio registrado.
                </TableCell>
              </TableRow>
            ) : (
              shipments.map((shipment) => (
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
                          : 'secondary'
                      }
                      className={
                        shipment.kit_status === 'Entregue' || shipment.kit_status === 'Delivered'
                          ? 'bg-green-500 hover:bg-green-600 text-white border-transparent'
                          : shipment.kit_status === 'Enviado'
                            ? 'bg-blue-500 hover:bg-blue-600 text-white border-transparent'
                            : ''
                      }
                    >
                      {shipment.kit_status || 'Pendente'}
                    </Badge>
                    {(shipment.kit_status === 'Entregue' || shipment.kit_status === 'Delivered') &&
                      shipment.delivered_at && (
                        <div className="text-[10px] text-muted-foreground mt-1 whitespace-nowrap">
                          {new Date(shipment.delivered_at).toLocaleDateString('pt-BR')}
                        </div>
                      )}
                  </TableCell>
                  <TableCell>
                    <a
                      href={getTrackingLink(shipment.tracking_number)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center text-sm text-primary hover:underline whitespace-nowrap"
                    >
                      {shipment.tracking_number}
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleManualSync(shipment.id)}
                      disabled={
                        syncingId === shipment.id ||
                        shipment.kit_status === 'Entregue' ||
                        shipment.kit_status === 'Delivered'
                      }
                    >
                      <RefreshCw
                        className={`w-4 h-4 mr-2 ${syncingId === shipment.id ? 'animate-spin' : ''}`}
                      />
                      Sync
                    </Button>
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
