import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/hooks/use-auth'
import {
  getPrescribers,
  updatePrescriberData,
  createYampiCoupon,
  syncYampiUsage,
} from '@/services/crm'
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
  User,
  Package,
  Tag,
  CheckCircle2,
  BarChart,
  Loader2,
  RefreshCw,
  Trophy,
  ThumbsUp,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

const InlineCouponInput = ({
  contact,
  p,
  field,
  user,
  onSave,
}: {
  contact: any
  p: any
  field: 'nutritionist_coupon' | 'patient_coupon'
  user: any
  onSave: () => void
}) => {
  const [value, setValue] = useState(contact?.[field] || '')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setValue(contact?.[field] || '')
  }, [contact, field])

  const handleBlur = async () => {
    if (value === (contact?.[field] || '')) return

    setLoading(true)
    try {
      let contactId = contact?.id
      if (!contactId) {
        const { data, error } = await supabase
          .from('contacts')
          .insert({
            user_id: user.id,
            name: p.client_name,
            email: p.client_email,
            phone: p.client_phone?.replace(/\D/g, '') || '',
            [field]: value || null,
          })
          .select()
          .single()
        if (error) throw error
        contactId = data.id
      } else {
        const { error } = await supabase
          .from('contacts')
          .update({
            [field]: value || null,
          })
          .eq('id', contactId)
        if (error) throw error
      }
      onSave()
      toast({ title: 'Cupom atualizado', description: 'O cupom foi salvo com sucesso.' })
    } catch (e) {
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar o cupom.',
        variant: 'destructive',
      })
      setValue(contact?.[field] || '')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex items-center w-[120px]">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
        onBlur={handleBlur}
        disabled={loading}
        className="h-8 font-mono text-xs pr-7"
        placeholder="Adicionar..."
      />
      {loading && (
        <Loader2 className="h-3 w-3 animate-spin absolute right-2 text-muted-foreground" />
      )}
    </div>
  )
}

export function LeadList() {
  const { user } = useAuth()
  const [prescribers, setPrescribers] = useState<any[]>([])
  const [contactsData, setContactsData] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)

  const loadData = async () => {
    if (!user) return
    try {
      const data = await getPrescribers(user.id)
      setPrescribers(data)

      const emails = data.map((p: any) => p.client_email).filter(Boolean)
      const phones = data.map((p: any) => p.client_phone?.replace(/\D/g, '')).filter(Boolean)

      if (emails.length > 0 || phones.length > 0) {
        const { data: contacts } = await supabase
          .from('contacts')
          .select('*')
          .eq('user_id', user.id)

        if (contacts) {
          const cMap: Record<string, any> = {}
          contacts.forEach((c) => {
            if (c.email) cMap[c.email] = c
            if (c.phone) cMap[c.phone] = c
          })
          setContactsData(cMap)
        }
      }
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

  const handleThumbsUp = async (p: any, contact: any) => {
    const nutriCoupon = contact?.nutritionist_coupon || p.nutritionist_coupon || ''
    const patientCoupon = contact?.patient_coupon || p.patient_coupon || ''

    if (!nutriCoupon || !patientCoupon) {
      toast({
        title: 'Atenção',
        description: 'Preencha ambos os cupons antes de notificar.',
        variant: 'destructive',
      })
      return
    }

    setActionLoading(p.id + '_thumbs')
    try {
      // 1. Notificar Marketing
      const { error: mktError } = await supabase.functions.invoke('send-email', {
        body: {
          to: 'marketing@fourlabnutri.com.br',
          subject: `Solicitação de Cadastro de Cupom - Yampi - ${p.client_name}`,
          html: `
            <div style="font-family: sans-serif; color: #333;">
              <p>Olá equipe de Marketing,</p>
              <p>Uma nova visita foi realizada. Solicitamos o cadastro dos seguintes cupons no Yampi para o profissional <strong>${p.client_name}</strong>:</p>
              <ul>
                <li><strong>Cupom Nutri:</strong> ${nutriCoupon}</li>
                <li><strong>Cupom Paciente:</strong> ${patientCoupon}</li>
              </ul>
              <p>Obrigado!</p>
            </div>
          `,
          senderName: 'Sistema FourLab',
        },
      })
      if (mktError) throw mktError

      // 2. Agradecimento Prescritor
      if (p.client_email) {
        const { error: prescriberError } = await supabase.functions.invoke('send-email', {
          body: {
            to: p.client_email,
            subject: 'Um agradecimento especial da Fourlab Nutri!',
            html: `
              <div style="font-family: sans-serif; color: #333; line-height: 1.5;">
                <p>Olá, ${p.client_name}!</p>
                <p>Gostaríamos de agradecer imensamente pelo seu tempo e atenção durante nossa recente visita.</p>
                <p>É uma honra apresentar as soluções da Fourlab Nutri para você.</p>
                <p>Conforme conversamos, aqui estão os seus cupons exclusivos:</p>
                <ul>
                  <li><strong>Cupom Nutri (${nutriCoupon}):</strong> Este cupom é para seu uso pessoal e exclusivo. Fique à vontade para utilizá-lo em suas próprias compras em nosso site.</li>
                  <li><strong>Cupom Paciente (${patientCoupon}):</strong> Este cupom é para você compartilhar com seus pacientes após as consultas, oferecendo a eles condições especiais.</li>
                </ul>
                <p>Estamos à disposição para qualquer dúvida ou suporte que precisar.</p>
                <p>Um grande abraço,<br/>Equipe Fourlab Nutri</p>
              </div>
            `,
            senderName: 'Fourlab Nutri',
          },
        })
        if (prescriberError) throw prescriberError
      }

      toast({
        title: 'Notificações enviadas',
        description: 'Marketing e prescritor notificados com sucesso.',
      })
    } catch (e) {
      console.error(e)
      toast({
        title: 'Erro ao enviar emails',
        description: 'Tente novamente mais tarde.',
        variant: 'destructive',
      })
    } finally {
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
              <TableHead className="min-w-[140px]">
                <Tag className="inline h-4 w-4 mr-2" /> Cupom Nutri
              </TableHead>
              <TableHead className="min-w-[140px]">
                <Tag className="inline h-4 w-4 mr-2" /> Cupom Paciente
              </TableHead>
              <TableHead className="w-[40px]"></TableHead>
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
            {sortedData.map((p) => {
              const contact =
                contactsData[p.client_email] || contactsData[p.client_phone?.replace(/\D/g, '')]
              return (
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
                    <InlineCouponInput
                      contact={contact}
                      p={p}
                      field="nutritionist_coupon"
                      user={user}
                      onSave={loadData}
                    />
                  </TableCell>
                  <TableCell>
                    <InlineCouponInput
                      contact={contact}
                      p={p}
                      field="patient_coupon"
                      user={user}
                      onSave={loadData}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                      onClick={() => handleThumbsUp(p, contact)}
                      disabled={actionLoading === p.id + '_thumbs'}
                      title="Notificar Marketing e Agradecer"
                    >
                      {actionLoading === p.id + '_thumbs' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ThumbsUp className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="font-semibold text-sm">
                    {p.coupon_usage_count || 0}
                  </TableCell>
                  <TableCell>
                    {!p.coupon_verified ? (
                      <Button
                        size="sm"
                        onClick={() => handleAction('create', p)}
                        disabled={actionLoading === p.id}
                        className="h-8 text-[11px] bg-indigo-600 hover:bg-indigo-700"
                      >
                        {actionLoading === p.id && (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        )}{' '}
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
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
