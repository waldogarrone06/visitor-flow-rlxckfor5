import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { RefreshCcw, Eye, Search } from 'lucide-react'
import { getWhatsAppEvents } from '@/services/logs'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPayload, setSelectedPayload] = useState<any | null>(null)

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
  }, [])

  const filteredEvents = events.filter((e) => {
    const s = searchTerm.toLowerCase()
    return (
      e.message_type?.toLowerCase().includes(s) ||
      e.remote_jid?.toLowerCase().includes(s) ||
      e.instance?.toLowerCase().includes(s)
    )
  })

  return (
    <div className="space-y-6 animate-slide-up pb-8 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Logs do WhatsApp</h1>
          <p className="text-muted-foreground mt-1">
            Monitore os eventos e webhooks recebidos em tempo real.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadEvents} disabled={loading}>
          <RefreshCcw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <div className="flex items-center space-x-2 bg-white p-1 border rounded-md max-w-sm">
        <Search className="h-4 w-4 text-muted-foreground ml-2" />
        <Input
          placeholder="Buscar por telefone, evento ou instância..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="border-0 focus-visible:ring-0 shadow-none h-8"
        />
      </div>

      <div className="border rounded-md bg-white flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1 max-h-[600px]">
          <Table>
            <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Telefone (JID)</TableHead>
                <TableHead>Instância</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    Nenhum evento encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filteredEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {format(new Date(event.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
                    </TableCell>
                    <TableCell className="font-medium">{event.remote_jid}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{event.instance}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          event.message_type?.includes('error') ? 'destructive' : 'secondary'
                        }
                      >
                        {event.message_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedPayload(event.message)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Payload
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!selectedPayload} onOpenChange={(o) => !o && setSelectedPayload(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Payload do Evento (JSON)</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-slate-950 p-4 rounded-md">
            <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
              {selectedPayload ? JSON.stringify(selectedPayload, null, 2) : ''}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
