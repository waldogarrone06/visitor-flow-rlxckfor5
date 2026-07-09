import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Trash2, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { purgeAppointmentsByName, PurgeResult } from '@/services/purge-appointments'

export function DataCleanupCard() {
  const [clientName, setClientName] = useState('Waldo Garrone')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [purging, setPurging] = useState(false)
  const [result, setResult] = useState<PurgeResult | null>(null)

  const handlePurge = async () => {
    if (!clientName.trim()) return
    setPurging(true)

    try {
      const res = await purgeAppointmentsByName(clientName.trim())
      setResult(res)

      if (res.success) {
        toast({ title: 'Limpeza Concluída', description: res.message })
      } else {
        toast({ title: 'Erro na Limpeza', description: res.error, variant: 'destructive' })
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setPurging(false)
      setConfirmOpen(false)
    }
  }

  return (
    <Card className="border-border/50 shadow-subtle">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trash2 className="h-5 w-5 text-destructive" />
          Limpeza de Dados
        </CardTitle>
        <CardDescription>
          Remove agendamentos, eventos do calendário e dados relacionados por nome.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cleanup-client-name">Nome do Cliente</Label>
          <Input
            id="cleanup-client-name"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Digite o nome exato..."
            disabled={purging}
          />
        </div>

        {result && (
          <div
            className={`p-3 rounded-lg border ${result.success ? 'bg-success/5 border-success/20' : 'bg-destructive/5 border-destructive/20'}`}
          >
            <div className="flex items-start gap-2">
              {result.success ? (
                <CheckCircle2 className="h-4 w-4 text-success mt-0.5" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
              )}
              <div className="text-sm">
                <p className="font-medium">{result.message}</p>
                {result.details && (
                  <ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
                    <li>Agendamentos removidos: {result.details.appointmentsDeleted}</li>
                    <li>Eventos do calendário: {result.details.calendarEventsDeleted}</li>
                    <li>Contatos removidos: {result.details.contactsDeleted}</li>
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        <AlertDialog
          open={confirmOpen}
          onOpenChange={(open) => !open && !purging && setConfirmOpen(false)}
        >
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => setConfirmOpen(true)}
            disabled={purging || !clientName.trim()}
          >
            {purging ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Limpando...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Remover Agendamentos
              </>
            )}
          </Button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Limpeza de Dados</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação irá remover permanentemente todos os agendamentos de{' '}
                <strong>{clientName}</strong>, incluindo eventos no Google Calendar, horários
                bloqueados e registros relacionados. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={purging}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  handlePurge()
                }}
                disabled={purging}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {purging ? 'Limpando...' : 'Sim, Remover Tudo'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
