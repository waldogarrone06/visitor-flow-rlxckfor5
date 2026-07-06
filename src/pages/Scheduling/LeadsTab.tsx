import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
import { format } from 'date-fns'
import { Search, Trash2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { deleteLead } from '@/services/leads'

interface LeadsTabProps {
  onRefresh?: () => void
}

export function LeadsTab({ onRefresh }: LeadsTabProps) {
  const { user } = useAuth()
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadLeads = useCallback(async () => {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'lead')
        .order('created_at', { ascending: false })
      if (!error && data) setLeads(data)
    } catch (err) {
      console.error('Error loading leads', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadLeads()
  }, [loadLeads])

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

  const filteredLeads = leads.filter(
    (l) =>
      (l.client_name && l.client_name.toLowerCase().includes(search.toLowerCase())) ||
      (l.client_email && l.client_email.toLowerCase().includes(search.toLowerCase())),
  )

  if (loading)
    return <div className="p-8 text-center text-muted-foreground">Carregando leads...</div>

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2 max-w-sm">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou e-mail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9"
        />
      </div>

      <div className="border rounded-md overflow-x-auto bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="min-w-[150px] whitespace-nowrap">Nome</TableHead>
              <TableHead className="min-w-[150px] whitespace-nowrap">E-mail</TableHead>
              <TableHead className="min-w-[120px] whitespace-nowrap">Telefone</TableHead>
              <TableHead className="min-w-[120px] whitespace-nowrap">Documento (CPF)</TableHead>
              <TableHead className="min-w-[100px] whitespace-nowrap">CEP</TableHead>
              <TableHead className="min-w-[200px] whitespace-nowrap">Endereço</TableHead>
              <TableHead className="min-w-[80px] whitespace-nowrap">Número</TableHead>
              <TableHead className="min-w-[150px] whitespace-nowrap">Bairro</TableHead>
              <TableHead className="min-w-[120px] whitespace-nowrap">Complemento</TableHead>
              <TableHead className="min-w-[150px] whitespace-nowrap">Data de Captura</TableHead>
              <TableHead className="min-w-[80px] whitespace-nowrap text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLeads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  Nenhum lead encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredLeads.map((lead) => (
                <TableRow key={lead.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium whitespace-nowrap">
                    {lead.client_name}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{lead.client_email || '-'}</TableCell>
                  <TableCell className="whitespace-nowrap">{lead.client_phone || '-'}</TableCell>
                  <TableCell className="whitespace-nowrap">{lead.client_document || '-'}</TableCell>
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
                    {lead.created_at ? format(new Date(lead.created_at), 'dd/MM/yyyy HH:mm') : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeleteId(lead.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
    </div>
  )
}
