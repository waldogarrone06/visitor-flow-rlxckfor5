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
import { toast } from 'sonner'
import { ExternalLink, Save } from 'lucide-react'

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
  const [trackingInputs, setTrackingInputs] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const fetchShipments = async () => {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, client_name, kit_name, kit_status, tracking_number, delivered_at')
        .not('kit_name', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      setShipments(data || [])

      const inputs: Record<string, string> = {}
      ;(data || []).forEach((s) => {
        inputs[s.id] = s.tracking_number || ''
      })
      setTrackingInputs(inputs)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
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
    } catch (err: any) {
      toast.error('Erro ao salvar rastreio', { description: err.message })
    } finally {
      setSavingId(null)
    }
  }

  useEffect(() => {
    fetchShipments()
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
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome do Prescritor</TableHead>
              <TableHead>Kit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Rastreio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shipments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Nenhum kit atribuído.
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
                    {(shipment.kit_status === 'Entregue' || shipment.kit_status === 'Delivered') &&
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
                          setTrackingInputs((prev) => ({ ...prev, [shipment.id]: e.target.value }))
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
