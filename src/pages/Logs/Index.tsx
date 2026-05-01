import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { RefreshCcw, Eye, Search, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react'
import { getWhatsAppEvents } from '@/services/logs'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'

export default function LogsPage() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [showOnlyErrors, setShowOnlyErrors] = useState(false)
  const [selectedPayload, setSelectedPayload] = useState<any | null>(null)
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)

  const loadEvents = async () => {
    setLoading(true)
    try {
      const data = await getWhatsAppEvents(100)
      setEvents(data || [])
    } catch (error) {
      console.error('Error loading events:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      supabase
        .from('profiles')
        .select('is_admin, name, email')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            const isJunior =
              data.name?.toLowerCase().includes('junior') ||
              data.email?.toLowerCase().includes('junior') ||
              data.name?.toLowerCase().includes('jr')
            setHasAccess(!!data.is_admin || isJunior)
          } else {
            setHasAccess(false)
          }
        })
    }
  }, [user])

  useEffect(() => {
    if (hasAccess === false) return

    loadEvents()

    const channel = supabase
      .channel('whatsapp_events_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_events' },
        (payload) => {
          setEvents((prev) => [payload.new, ...prev].slice(0, 100))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [hasAccess])

  const isErrorEvent = (e: any) => {
    return (
      e.message_type?.toLowerCase().includes('error') ||
      e.message?.error ||
      e.message?.status === 'error' ||
      e.message?.message === 'error'
    )
  }

  const filteredEvents = events.filter((e) => {
    const s = searchTerm.toLowerCase()
    const matchesSearch =
      e.message_type?.toLowerCase().includes(s) ||
      e.remote_jid?.toLowerCase().includes(s) ||
      e.instance?.toLowerCase().includes(s)

    if (showOnlyErrors) {
      return matchesSearch && isErrorEvent(e)
    }

    return matchesSearch
  })

  const selectedIsError = selectedPayload ? isErrorEvent({ message: selectedPayload }) : false

  if (hasAccess === false) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] text-center animate-fade-in-up">
        <ShieldAlert className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Acesso Restrito</h2>
        <p className="text-muted-foreground mt-2 max-w-md">
          Apenas administradores e o perfil Junior têm permissão para visualizar os logs detalhados
          do sistema.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-slide-up pb-8 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Logs do Sistema</h1>
          <p className="text-muted-foreground mt-1">
            Monitore os eventos e webhooks recebidos em tempo real.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadEvents} disabled={loading}>
          <RefreshCcw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-slate-50/50 p-3 rounded-lg border">
        <div className="flex items-center space-x-2 bg-white p-1 border rounded-md w-full max-w-sm shadow-sm">
          <Search className="h-4 w-4 text-muted-foreground ml-2 shrink-0" />
          <Input
            placeholder="Buscar por telefone, evento ou instância..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border-0 focus-visible:ring-0 shadow-none h-8"
          />
        </div>
        <div className="flex items-center space-x-2 bg-white px-3 py-2 border rounded-md shadow-sm">
          <Switch id="error-mode" checked={showOnlyErrors} onCheckedChange={setShowOnlyErrors} />
          <Label htmlFor="error-mode" className="cursor-pointer font-medium text-sm text-slate-700">
            Apenas Erros
          </Label>
        </div>
      </div>

      <div className="border rounded-md bg-white flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1 max-h-[600px]">
          <Table>
            <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
              <TableRow>
                <TableHead className="w-[150px]">Data/Hora</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Telefone (JID)</TableHead>
                <TableHead>Instância</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <Search className="h-8 w-8 text-slate-300 mb-2" />
                      <p>Nenhum evento encontrado.</p>
                      {showOnlyErrors && (
                        <p className="text-xs mt-1 text-emerald-600 font-medium">
                          Ótimo! Nenhum erro registrado nos logs recentes.
                        </p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredEvents.map((event) => {
                  const isError = isErrorEvent(event)
                  return (
                    <TableRow
                      key={event.id}
                      className={isError ? 'bg-red-50/30 hover:bg-red-50/50' : ''}
                    >
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {format(new Date(event.created_at), 'dd/MM/yyyy HH:mm:ss', {
                          locale: ptBR,
                        })}
                      </TableCell>
                      <TableCell>
                        {isError ? (
                          <Badge variant="destructive" className="flex w-fit items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Erro
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 flex w-fit items-center gap-1"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Sucesso
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{event.remote_jid}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          {event.instance}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {event.message_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedPayload(event.message)}
                          className={
                            isError ? 'text-red-600 hover:text-red-700 hover:bg-red-100' : ''
                          }
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Inspecionar
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!selectedPayload} onOpenChange={(o) => !o && setSelectedPayload(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Detalhes do Evento (JSON)</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            {selectedIsError && (
              <div className="bg-red-50 border border-red-200 text-red-900 p-4 rounded-md flex items-start gap-3 shadow-sm">
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-red-800 text-base mb-1">
                    Falha detectada neste evento
                  </p>
                  <p className="text-red-700 break-words">
                    {selectedPayload?.error ||
                      selectedPayload?.message ||
                      'Verifique o payload bruto abaixo para mais informações técnicas sobre o erro.'}
                  </p>
                  {selectedPayload?.stack && (
                    <div className="mt-2 text-[10px] font-mono bg-red-100/50 p-2 rounded text-red-800 overflow-auto max-h-32">
                      {selectedPayload.stack}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="flex-1 overflow-auto bg-slate-950 p-4 rounded-md shadow-inner">
              <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap break-all">
                {selectedPayload ? JSON.stringify(selectedPayload, null, 2) : ''}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
