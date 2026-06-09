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
import { Copy, Truck, ExternalLink, Package } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function KitShipments() {
  const [shipments, setShipments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    fetchShipments()
  }, [])

  const fetchShipments = async () => {
    setLoading(true)
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user) return

    // We get appointments that have kit requested/assigned
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('user_id', session.user.id)
      .not('kit_status', 'is', null)
      .neq('status', 'Lead')
      .order('created_at', { ascending: false })

    if (data) {
      setShipments(data)
    }
    setLoading(false)
  }

  const updateTracking = async (id: string, tracking: string) => {
    const { error } = await supabase
      .from('appointments')
      .update({ tracking_number: tracking })
      .eq('id', id)

    if (error) {
      toast({ title: 'Erro', description: 'Falha ao atualizar rastreio.', variant: 'destructive' })
    } else {
      toast({ title: 'Sucesso', description: 'Rastreio atualizado.' })
      fetchShipments()
    }
  }

  const updateKitStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from('appointments')
      .update({ kit_status: status })
      .eq('id', id)

    if (error) {
      toast({ title: 'Erro', description: 'Falha ao atualizar status.', variant: 'destructive' })
    } else {
      toast({ title: 'Sucesso', description: 'Status atualizado.' })
      fetchShipments()
    }
  }

  const extractCEP = (address: string | null) => {
    if (!address) return ''
    const match = address.match(/\b\d{5}-?\d{3}\b/)
    if (match) {
      const cep = match[0]
      // Ensure it is formatted as XXXXX-XXX
      if (cep.length === 8 && !cep.includes('-')) {
        return `${cep.slice(0, 5)}-${cep.slice(5)}`
      }
      return cep
    }
    return ''
  }

  const copyToClipboard = (text: string) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    toast({ title: 'Copiado!', description: 'Texto copiado para a área de transferência.' })
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

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Kit Solicitado</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Carregando envios...
                </TableCell>
              </TableRow>
            ) : shipments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          Ver Detalhes
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Detalhes do Envio</DialogTitle>
                        </DialogHeader>
                        <div className="grid md:grid-cols-2 gap-6 py-4">
                          <div className="space-y-4">
                            <div className="space-y-1">
                              <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                                Cliente
                              </Label>
                              <p className="font-medium">{s.client_name}</p>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                                Email
                              </Label>
                              <p className="text-sm">{s.client_email}</p>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                                Telefone
                              </Label>
                              <p className="text-sm">{s.client_phone || 'Não informado'}</p>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                                Kit Solicitado
                              </Label>
                              <p className="text-sm font-medium">{s.kit_name || 'Kit Padrão'}</p>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                                Status do Kit
                              </Label>
                              <div className="flex gap-2 items-center">
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
                                {s.kit_status !== 'Entregue' && s.kit_status !== 'Delivered' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs"
                                    onClick={() => updateKitStatus(s.id, 'Entregue')}
                                  >
                                    Marcar Entregue
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-5 bg-muted/50 p-4 rounded-lg">
                            <div className="space-y-2">
                              <Label className="text-muted-foreground font-semibold">
                                Endereço de Entrega
                              </Label>
                              <div className="flex gap-2 items-start">
                                <p className="text-sm flex-1 leading-relaxed">
                                  {s.clinic_address || 'Endereço não informado'}
                                </p>
                                {s.clinic_address && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="shrink-0 h-8 w-8"
                                    onClick={() => copyToClipboard(s.clinic_address)}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-foreground font-bold flex items-center gap-2">
                                CEP
                              </Label>
                              <div className="flex gap-2 items-center">
                                <Input
                                  readOnly
                                  value={extractCEP(s.clinic_address) || 'Não encontrado'}
                                  className="font-mono bg-background text-sm"
                                />
                                <Button
                                  variant="secondary"
                                  size="icon"
                                  className="shrink-0"
                                  disabled={!extractCEP(s.clinic_address)}
                                  onClick={() => copyToClipboard(extractCEP(s.clinic_address))}
                                  title="Copiar CEP"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                O CEP é extraído automaticamente para facilitar a emissão de
                                etiquetas.
                              </p>
                            </div>

                            <div className="space-y-2 pt-4 border-t">
                              <Label className="text-foreground font-bold flex items-center gap-2">
                                <Truck className="h-4 w-4" />
                                Código de Rastreio
                              </Label>
                              <div className="flex gap-2">
                                <Input
                                  defaultValue={s.tracking_number || ''}
                                  placeholder="Ex: BR123456789BR"
                                  id={`track-${s.id}`}
                                  className="bg-background text-sm"
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
                                    Acompanhar Rastreio <ExternalLink className="ml-1 h-3 w-3" />
                                  </a>
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
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
