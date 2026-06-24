import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { format } from 'date-fns'
import { Search } from 'lucide-react'

export function LeadsTab() {
  const { user } = useAuth()
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function loadData() {
      if (!user) return

      try {
        const { data, error } = await supabase
          .from('appointments')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'lead')
          .order('created_at', { ascending: false })

        if (!error && data) {
          setLeads(data)
        }
      } catch (err) {
        console.error('Error loading leads', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [user])

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
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLeads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
