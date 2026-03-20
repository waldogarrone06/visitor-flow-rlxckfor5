import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/hooks/use-auth'
import {
  getPrescribers,
  updatePrescriberData,
  createYampiCoupon,
  syncYampiUsage,
} from '@/services/crm'
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
import { toast } from '@/hooks/use-toast'
import {
  Save,
  User,
  Package,
  Tag,
  CheckCircle2,
  BarChart,
  Loader2,
  RefreshCw,
  Trophy,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export function LeadList() {
  const { user } = useAuth()
  const [prescribers, setPrescribers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCode, setEditingCode] = useState<Record<string, string>>({})
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)

  const loadData = async () => {
    if (!user) return
    try {
      setPrescribers(await getPrescribers(user.id))
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
      if (updates.kit_status === 'Delivered') toast({ title: 'NPS Programado' })
      else toast({ title: 'Atualizado', description: 'Informações salvas.' })
      loadData()
    } catch {
      toast({ title: 'Erro', variant: 'destructive' })
    }
  }

  const handleAction = async (action: 'sync' | 'create', p?: any) => {
    if (!user) return
    try {
      if (action === 'sync') {
        setSyncing(true)
        await syncYampiUsage(user.id)
        toast({ title: 'Uso sincronizado.' })
      } else if (action === 'create' && p) {
        setActionLoading(p.id)
        await createYampiCoupon(p.id, user.id, p.client_name, p.client_email)
        toast({ title: 'Cupom Gerado' })
      }
      loadData()
    } catch {
      toast({ title: 'Erro na ação Yampi.', variant: 'destructive' })
    } finally {
      setSyncing(false)
      setActionLoading(null)
    }
  }

  const sortedData = useMemo(() => {
    if (!sortConfig) return prescribers
    return [...prescribers].sort((a, b) => {
      const vA = a[sortConfig.key] || 0,
        vB = b[sortConfig.key] || 0
      return (vA < vB ? -1 : 1) * (sortConfig.dir === 'asc' ? 1 : -1)
    })
  }, [prescribers, sortConfig])

  const top5Ids = useMemo(
    () =>
      [...prescribers]
        .sort((a, b) => (b.coupon_usage_count || 0) - (a.coupon_usage_count || 0))
        .filter((p) => (p.coupon_usage_count || 0) > 0)
        .slice(0, 5)
        .map((p) => p.id),
    [prescribers],
  )

  if (loading) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>

  return (
    <div className="border border-border/60 rounded-lg bg-white overflow-hidden shadow-sm flex flex-col h-full animate-fade-in">
      <div className="flex justify-between items-center p-3 border-b bg-slate-50/50">
        <h3 className="text-sm font-medium text-muted-foreground ml-2">
          Monitoramento de Conversão Yampi
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleAction('sync')}
          disabled={syncing}
          className="gap-2 h-8 text-xs"
        >
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}{' '}
          Sincronizar Yampi
        </Button>
      </div>
      <div className="overflow-auto flex-1">
        <Table>
          <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
            <TableRow>
              <TableHead
                className="cursor-pointer"
                onClick={() =>
                  setSortConfig({
                    key: 'client_name',
                    dir: sortConfig?.dir === 'asc' ? 'desc' : 'asc',
                  })
                }
              >
                <User className="inline h-4 w-4 mr-2" /> Prescritor
              </TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>
                <Package className="inline h-4 w-4 mr-2" /> Kit
              </TableHead>
              <TableHead>
                <Tag className="inline h-4 w-4 mr-2" /> Cupom
              </TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() =>
                  setSortConfig({
                    key: 'coupon_usage_count',
                    dir: sortConfig?.dir === 'asc' ? 'desc' : 'asc',
                  })
                }
              >
                <BarChart className="inline h-4 w-4 mr-2" /> Uso
              </TableHead>
              <TableHead>
                <CheckCircle2 className="inline h-4 w-4 mr-2" /> Ação Yampi
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((p) => (
              <TableRow
                key={p.id}
                className={cn('hover:bg-slate-50/50', top5Ids.includes(p.id) && 'bg-amber-50/40')}
              >
                <TableCell className="font-medium">
                  <div className="flex flex-col gap-1 items-start">
                    <Link
                      to={`/crm/prescritor/${p.id}`}
                      className="hover:underline hover:text-primary transition-colors"
                    >
                      {p.client_name}
                    </Link>
                    {top5Ids.includes(p.id) && (
                      <Badge
                        variant="secondary"
                        className="bg-amber-100 text-amber-700 hover:bg-amber-100/80 border-amber-200 text-[10px] px-1.5 py-0"
                      >
                        <Trophy className="h-3 w-3 mr-1" /> Top
                      </Badge>
                    )}
                  </div>
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
                    <SelectTrigger className="w-[110px] h-8 text-xs">
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
                      value={editingCode[p.client_email] ?? p.coupon_code ?? ''}
                      onChange={(e) =>
                        setEditingCode({ ...editingCode, [p.client_email]: e.target.value })
                      }
                      className="h-8 w-24 font-mono text-xs uppercase"
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
                <TableCell className="font-semibold text-sm">{p.coupon_usage_count || 0}</TableCell>
                <TableCell>
                  {!p.coupon_verified ? (
                    <Button
                      size="sm"
                      onClick={() => handleAction('create', p)}
                      disabled={actionLoading === p.id}
                      className="h-8 text-[11px] bg-indigo-600 hover:bg-indigo-700"
                    >
                      {actionLoading === p.id && <Loader2 className="h-3 w-3 animate-spin mr-1" />}{' '}
                      Confirmar Yampi
                    </Button>
                  ) : (
                    <div className="text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-[11px] font-medium">Verificado</span>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
