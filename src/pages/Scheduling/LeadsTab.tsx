import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { ptBR } from 'date-fns/locale'
import { format } from 'date-fns'
import {
  Search,
  Trash2,
  CalendarPlus,
  CheckCircle2,
  Clock,
  CalendarX,
  Filter,
  Calendar as CalendarIcon,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { deleteLead } from '@/services/leads'
import { ScheduleForm } from './ScheduleForm'

export type AppointmentStatusType = 'visited' | 'scheduled' | 'none'

interface LeadsTabProps {
  onRefresh?: () => void
  onScheduleLead?: (lead: any) => void
}

function cleanDigits(val?: string | null): string {
  return val ? val.replace(/\D/g, '') : ''
}

function normalizeStr(val?: string | null): string {
  return val ? val.trim().toLowerCase() : ''
}

/**
 * Compara dois telefones considerando apenas os dígitos.
 * Considera match se:
 * - Ambos têm ao menos 8 dígitos e são idênticos;
 * - Ou os últimos 10 ou 11 dígitos coincidirem (absorvendo prefixos como +55 / 55 / 0 / variações de DDD).
 */
export function phonesMatch(phoneA?: string | null, phoneB?: string | null): boolean {
  const a = cleanDigits(phoneA)
  const b = cleanDigits(phoneB)
  if (!a || !b) return false

  // Se forem exatamente iguais e tiverem tamanho mínimo
  if (a === b && a.length >= 8) return true

  // Comparar últimos 10 ou 11 dígitos quando disponíveis
  const a11 = a.length >= 11 ? a.slice(-11) : null
  const b11 = b.length >= 11 ? b.slice(-11) : null
  if (a11 && b11 && a11 === b11) return true

  const a10 = a.length >= 10 ? a.slice(-10) : null
  const b10 = b.length >= 10 ? b.slice(-10) : null
  if (a10 && b10 && a10 === b10) return true

  // Se um tiver 10 dígitos (ex: DDD + 8 dígitos antigo) e o outro 11 dígitos (DDD + 9 + 8 dígitos)
  // ou se um for sufixo exato do outro com ao menos 10 dígitos
  if (a.length >= 10 && b.length >= 10) {
    if (a.endsWith(b) || b.endsWith(a)) return true
  }

  return false
}

export function LeadsTab({ onRefresh, onScheduleLead }: LeadsTabProps) {
  const { user } = useAuth()
  const [leads, setLeads] = useState<any[]>([])
  const [allAppointments, setAllAppointments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | AppointmentStatusType>('all')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Modal de agendamento inline
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [selectedLeadForSchedule, setSelectedLeadForSchedule] = useState<any | null>(null)
  const [modalSelectedDate, setModalSelectedDate] = useState<Date | undefined>(new Date())

  const loadData = useCallback(async () => {
    if (!user) return
    try {
      setLoading(true)
      // Carregar leads e todos os appointments em paralelo
      const [leadsRes, appsRes] = await Promise.all([
        supabase
          .from('appointments')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'lead')
          .order('created_at', { ascending: false }),
        supabase
          .from('appointments')
          .select(
            'id, client_name, client_email, client_phone, appointment_date, start_time, end_time, status, created_at',
          )
          .eq('user_id', user.id)
          .neq('status', 'Cancelled'),
      ])

      if (leadsRes.data) {
        setLeads(leadsRes.data)
      }
      if (appsRes.data) {
        setAllAppointments(appsRes.data)
      }
    } catch (err) {
      console.error('Error loading leads and appointments', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await deleteLead(deleteId)
      toast({ title: 'Lead excluído', description: 'O registro foi removido com sucesso.' })
      setLeads((prev) => prev.filter((l) => l.id !== deleteId))
      onRefresh?.()
    } catch (err) {
      toast({
        title: 'Erro',
        description: 'Não foi possível excluir o lead.',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
      setDeleteId(null)
    }
  }

  // Mapa ou função de lookup para obter o estado de agendamento de cada lead
  const getLeadAppointmentInfo = useCallback(
    (lead: any) => {
      const leadEmail = normalizeStr(lead.client_email)
      const leadPhone = cleanDigits(lead.client_phone)
      const leadName = normalizeStr(lead.client_name)

      // Procurar appointments que NÃO sejam o próprio registro de lead
      const matched = allAppointments.filter((app) => {
        if (app.id === lead.id) return false
        // Se for status 'lead', desconsiderar (já é o lead de captura)
        if (app.status === 'lead') return false

        const appEmail = normalizeStr(app.client_email)
        const appPhone = cleanDigits(app.client_phone)
        const appName = normalizeStr(app.client_name)

        // 1. Telefone: dígitos normalizados e tolerância de 10-11 dígitos (+55/DDD)
        if (leadPhone && appPhone && phonesMatch(leadPhone, appPhone)) return true

        // 2. E-mail: lowercase e trimmed
        if (leadEmail && appEmail && leadEmail === appEmail) return true

        // 3. Nome: lowercase e trimmed (fallback)
        if (leadName && appName && leadName === appName) return true

        return false
      })

      // Se tiver visited
      const visitedApp = matched.find((a) => a.status === 'visited' || a.status === 'Visited')
      if (visitedApp) {
        return {
          status: 'visited' as AppointmentStatusType,
          label: 'Visita realizada',
          appointment: visitedApp,
        }
      }

      // Se tiver scheduled
      const scheduledApp = matched.find((a) => a.status === 'scheduled' || a.status === 'Scheduled')
      if (scheduledApp) {
        return {
          status: 'scheduled' as AppointmentStatusType,
          label: 'Visita agendada',
          appointment: scheduledApp,
        }
      }

      return {
        status: 'none' as AppointmentStatusType,
        label: 'Não agendou',
        appointment: null,
      }
    },
    [allAppointments],
  )

  const handleOpenSchedule = (lead: any) => {
    if (onScheduleLead) {
      onScheduleLead(lead)
    } else {
      setSelectedLeadForSchedule(lead)
      setModalSelectedDate(new Date())
      setScheduleModalOpen(true)
    }
  }

  // Mapear leads com o status calculado para filtro e ordenação
  const enrichedLeads = useMemo(() => {
    return leads.map((lead) => {
      const info = getLeadAppointmentInfo(lead)
      return {
        ...lead,
        _appointmentStatus: info.status,
        _appointmentLabel: info.label,
        _appointmentData: info.appointment,
      }
    })
  }, [leads, getLeadAppointmentInfo])

  // Contadores para os badges/filtros
  const counts = useMemo(() => {
    let visited = 0
    let scheduled = 0
    let none = 0
    enrichedLeads.forEach((l) => {
      if (l._appointmentStatus === 'visited') visited++
      else if (l._appointmentStatus === 'scheduled') scheduled++
      else none++
    })
    return { all: enrichedLeads.length, visited, scheduled, none }
  }, [enrichedLeads])

  const filteredLeads = useMemo(() => {
    return enrichedLeads.filter((l) => {
      const matchesSearch =
        !search ||
        (l.client_name && l.client_name.toLowerCase().includes(search.toLowerCase())) ||
        (l.client_email && l.client_email.toLowerCase().includes(search.toLowerCase())) ||
        (l.client_phone && l.client_phone.includes(search))

      const matchesStatus = statusFilter === 'all' || l._appointmentStatus === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [enrichedLeads, search, statusFilter])

  if (loading)
    return <div className="p-8 text-center text-muted-foreground">Carregando leads...</div>

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-lg border shadow-sm">
        <div className="flex items-center gap-2 max-w-sm flex-1">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <Input
            placeholder="Buscar por nome, e-mail ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Status:</span>
          </div>
          <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val as any)}>
            <SelectTrigger className="h-9 w-[190px] text-xs bg-white">
              <SelectValue placeholder="Filtrar por status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos ({counts.all})</SelectItem>
              <SelectItem value="none">Não agendou ({counts.none})</SelectItem>
              <SelectItem value="scheduled">Visita agendada ({counts.scheduled})</SelectItem>
              <SelectItem value="visited">Visita realizada ({counts.visited})</SelectItem>
            </SelectContent>
          </Select>

          {/* Atalhos rápidos de filtro tipo pílulas */}
          <div className="hidden md:flex items-center gap-1.5 pl-2 border-l">
            <Button
              variant={statusFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setStatusFilter('all')}
            >
              Todos ({counts.all})
            </Button>
            <Button
              variant={statusFilter === 'none' ? 'default' : 'outline'}
              size="sm"
              className={`h-7 text-xs px-2.5 ${
                statusFilter === 'none'
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'text-amber-700 border-amber-300 hover:bg-amber-50'
              }`}
              onClick={() => setStatusFilter('none')}
            >
              Não agendou ({counts.none})
            </Button>
            <Button
              variant={statusFilter === 'scheduled' ? 'default' : 'outline'}
              size="sm"
              className={`h-7 text-xs px-2.5 ${
                statusFilter === 'scheduled'
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'text-blue-700 border-blue-300 hover:bg-blue-50'
              }`}
              onClick={() => setStatusFilter('scheduled')}
            >
              Agendada ({counts.scheduled})
            </Button>
            <Button
              variant={statusFilter === 'visited' ? 'default' : 'outline'}
              size="sm"
              className={`h-7 text-xs px-2.5 ${
                statusFilter === 'visited'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'text-emerald-700 border-emerald-300 hover:bg-emerald-50'
              }`}
              onClick={() => setStatusFilter('visited')}
            >
              Realizada ({counts.visited})
            </Button>
          </div>
        </div>
      </div>

      {/* Tabela de Leads */}
      <div className="border rounded-md overflow-x-auto bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="min-w-[150px] whitespace-nowrap">Nome</TableHead>
              <TableHead className="min-w-[170px] whitespace-nowrap">Agendamento</TableHead>
              <TableHead className="min-w-[150px] whitespace-nowrap">E-mail</TableHead>
              <TableHead className="min-w-[120px] whitespace-nowrap">Telefone</TableHead>
              <TableHead className="min-w-[120px] whitespace-nowrap">Documento (CPF)</TableHead>
              <TableHead className="min-w-[100px] whitespace-nowrap">CEP</TableHead>
              <TableHead className="min-w-[200px] whitespace-nowrap">Endereço</TableHead>
              <TableHead className="min-w-[80px] whitespace-nowrap">Número</TableHead>
              <TableHead className="min-w-[150px] whitespace-nowrap">Bairro</TableHead>
              <TableHead className="min-w-[120px] whitespace-nowrap">Complemento</TableHead>
              <TableHead className="min-w-[150px] whitespace-nowrap">Data de Captura</TableHead>
              <TableHead className="min-w-[100px] whitespace-nowrap text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLeads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                  Nenhum lead encontrado com os filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              filteredLeads.map((lead) => {
                const status = lead._appointmentStatus as AppointmentStatusType
                const appData = lead._appointmentData

                return (
                  <TableRow key={lead.id} className="hover:bg-slate-50/50">
                    <TableCell className="font-medium whitespace-nowrap">
                      {lead.client_name}
                    </TableCell>

                    {/* Coluna Agendamento com Badge e Ação */}
                    <TableCell className="whitespace-nowrap">
                      {status === 'visited' && (
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="secondary"
                            className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-300 font-medium flex items-center gap-1 px-2 py-0.5 text-xs shadow-none"
                            title={
                              appData?.appointment_date
                                ? `Visita realizada em ${format(new Date(appData.appointment_date + 'T12:00:00'), 'dd/MM/yyyy')}`
                                : 'Visita realizada'
                            }
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Visita realizada
                          </Badge>
                          {appData?.appointment_date && (
                            <span className="text-[11px] text-muted-foreground hidden lg:inline">
                              {format(new Date(appData.appointment_date + 'T12:00:00'), 'dd/MM/yy')}
                            </span>
                          )}
                        </div>
                      )}

                      {status === 'scheduled' && (
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="secondary"
                            className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-300 font-medium flex items-center gap-1 px-2 py-0.5 text-xs shadow-none"
                            title={
                              appData?.appointment_date
                                ? `Agendado para ${format(new Date(appData.appointment_date + 'T12:00:00'), 'dd/MM/yyyy')} ${appData.start_time || ''}`
                                : 'Visita agendada'
                            }
                          >
                            <Clock className="w-3.5 h-3.5 text-blue-600" />
                            Visita agendada
                          </Badge>
                          {appData?.appointment_date && (
                            <span className="text-[11px] text-muted-foreground hidden lg:inline">
                              {format(new Date(appData.appointment_date + 'T12:00:00'), 'dd/MM/yy')}
                            </span>
                          )}
                        </div>
                      )}

                      {status === 'none' && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenSchedule(lead)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 transition-colors cursor-pointer group"
                            title="Clique para agendar visita para este lead agora"
                          >
                            <CalendarX className="w-3.5 h-3.5 text-amber-700" />
                            <span>Não agendou</span>
                            <CalendarPlus className="w-3 h-3 text-amber-800 opacity-60 group-hover:opacity-100 ml-0.5" />
                          </button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px] text-blue-700 border-blue-200 hover:bg-blue-50 hover:text-blue-800 font-normal"
                            onClick={() => handleOpenSchedule(lead)}
                            title="Iniciar agendamento ativo com dados preenchidos"
                          >
                            <CalendarPlus className="w-3 h-3 mr-1" />
                            Agendar
                          </Button>
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap">{lead.client_email || '-'}</TableCell>
                    <TableCell className="whitespace-nowrap">{lead.client_phone || '-'}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {lead.client_document || '-'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{lead.clinic_cep || '-'}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={lead.clinic_address}>
                      {lead.clinic_address || '-'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{lead.clinic_number || '-'}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {lead.clinic_neighborhood || '-'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {lead.clinic_complement || '-'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {lead.created_at
                        ? format(new Date(lead.created_at), 'dd/MM/yyyy HH:mm')
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {status === 'none' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                            onClick={() => handleOpenSchedule(lead)}
                            title="Agendar visita"
                          >
                            <CalendarPlus className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeleteId(lead.id)}
                          title="Excluir lead"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Diálogo de confirmação de exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este lead? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal fallback de agendamento caso não navegue pela prop onScheduleLead */}
      <Dialog open={scheduleModalOpen} onOpenChange={setScheduleModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" />
              Novo Agendamento para {selectedLeadForSchedule?.client_name || 'Lead'}
            </DialogTitle>
            <DialogDescription>
              Preencha a data e o horário para confirmar o agendamento da visita.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="flex justify-center pb-2">
              <Calendar
                mode="single"
                selected={modalSelectedDate}
                onSelect={setModalSelectedDate}
                locale={ptBR}
                className="rounded-md border shadow-sm p-3 bg-white"
              />
            </div>

            <ScheduleForm
              selectedDate={modalSelectedDate}
              duplicateData={selectedLeadForSchedule}
              onSuccess={() => {
                setScheduleModalOpen(false)
                setSelectedLeadForSchedule(null)
                loadData()
                onRefresh?.()
              }}
              onDuplicateClear={() => {
                setSelectedLeadForSchedule(null)
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
