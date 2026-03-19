import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { getPrescribers, updatePrescriberData } from '@/services/crm'
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
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from '@/hooks/use-toast'
import { Save, User, Package, Tag, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'

export function LeadList() {
  const { user } = useAuth()
  const [prescribers, setPrescribers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCode, setEditingCode] = useState<Record<string, string>>({})

  const loadData = async () => {
    if (!user) return
    try {
      const data = await getPrescribers(user.id)
      setPrescribers(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  const handleUpdate = async (email: string, updates: any) => {
    if (!user) return
    try {
      await updatePrescriberData(user.id, email, updates)

      // If kit status is set to Delivered, simulate NPS scheduling
      if (updates.kit_status === 'Delivered') {
        const app = prescribers.find((p) => p.client_email === email)
        const url = `${window.location.origin}/nps/${app?.id || 'demo'}`
        toast({
          title: 'NPS Programado Automaticamente',
          description: `Formulário será enviado em 24h. Link: ${url}`,
        })
      } else {
        toast({ title: 'Dados Atualizados', description: 'Informações do prescritor salvas.' })
      }

      loadData()
    } catch (err) {
      toast({ title: 'Erro', description: 'Não foi possível salvar.', variant: 'destructive' })
    }
  }

  const getKitBadge = (status: string) => {
    switch (status) {
      case 'Delivered':
        return <Badge className="bg-green-500">Entregue</Badge>
      case 'Shipped':
        return <Badge className="bg-blue-500">Enviado</Badge>
      default:
        return <Badge variant="secondary">Pendente</Badge>
    }
  }

  if (loading) {
    return (
      <div className="h-40 flex items-center justify-center text-muted-foreground">
        Carregando prescritores...
      </div>
    )
  }

  return (
    <div className="border border-border/60 rounded-lg bg-white overflow-hidden shadow-sm flex flex-col h-full animate-fade-in">
      <div className="overflow-auto flex-1">
        <Table>
          <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
            <TableRow>
              <TableHead className="font-semibold">
                <User className="inline h-4 w-4 mr-2" />
                Prescritor
              </TableHead>
              <TableHead className="font-semibold">Contato</TableHead>
              <TableHead className="font-semibold">
                <Package className="inline h-4 w-4 mr-2" />
                Status do Kit
              </TableHead>
              <TableHead className="font-semibold">
                <Tag className="inline h-4 w-4 mr-2" />
                Cupom E-commerce
              </TableHead>
              <TableHead className="font-semibold">
                <CheckCircle2 className="inline h-4 w-4 mr-2" />
                Verificado
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prescribers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-32 text-muted-foreground">
                  Nenhum prescritor agendado ainda.
                </TableCell>
              </TableRow>
            ) : (
              prescribers.map((p) => (
                <TableRow key={p.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium">
                    <Link
                      to={`/crm/prescritor/${p.id}`}
                      className="hover:underline hover:text-primary transition-colors"
                    >
                      {p.client_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <div>{p.client_email}</div>
                    <div>{p.client_phone}</div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={p.kit_status || 'Pending'}
                      onValueChange={(val) => handleUpdate(p.client_email, { kit_status: val })}
                    >
                      <SelectTrigger className="w-[130px] h-8 text-xs font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pending">Pendente</SelectItem>
                        <SelectItem value="Shipped">Enviado</SelectItem>
                        <SelectItem value="Delivered">Entregue</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Input
                        value={
                          editingCode[p.client_email] !== undefined
                            ? editingCode[p.client_email]
                            : p.coupon_code || ''
                        }
                        onChange={(e) =>
                          setEditingCode({ ...editingCode, [p.client_email]: e.target.value })
                        }
                        placeholder="Ex: NUTRI10"
                        className="h-8 w-32 font-mono text-xs uppercase"
                      />
                      {editingCode[p.client_email] !== undefined &&
                        editingCode[p.client_email] !== (p.coupon_code || '') && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-green-600"
                            onClick={() =>
                              handleUpdate(p.client_email, {
                                coupon_code: editingCode[p.client_email],
                              })
                            }
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                        )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={p.coupon_verified || false}
                        onCheckedChange={(checked) =>
                          handleUpdate(p.client_email, { coupon_verified: !!checked })
                        }
                      />
                      <label className="text-xs text-muted-foreground cursor-pointer">
                        Confirmado
                      </label>
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
