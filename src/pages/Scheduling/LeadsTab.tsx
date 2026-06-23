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
        const [{ data: contacts }, { data: appointments }] = await Promise.all([
          supabase
            .from('contacts')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('appointments')
            .select('client_email, client_document, client_phone')
            .eq('user_id', user.id),
        ])

        const appointmentEmails = new Set(
          appointments?.map((a: any) => a.client_email).filter(Boolean),
        )
        const appointmentDocs = new Set(
          appointments?.map((a: any) => a.client_document).filter(Boolean),
        )
        const appointmentPhones = new Set(
          appointments?.map((a: any) => a.client_phone?.replace(/\D/g, '')).filter(Boolean),
        )

        const filteredLeads = (contacts || []).filter((c) => {
          if (c.email && appointmentEmails.has(c.email)) return false
          if (c.document && appointmentDocs.has(c.document)) return false
          if (c.phone && appointmentPhones.has(c.phone.replace(/\D/g, ''))) return false
          return true
        })

        setLeads(filteredLeads)
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
      (l.name && l.name.toLowerCase().includes(search.toLowerCase())) ||
      (l.email && l.email.toLowerCase().includes(search.toLowerCase())),
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
              <TableHead className="min-w-[120px] whitespace-nowrap">CPF/Documento</TableHead>
              <TableHead className="min-w-[120px] whitespace-nowrap">Especialidade</TableHead>
              <TableHead className="min-w-[120px] whitespace-nowrap">Profissão</TableHead>
              <TableHead className="min-w-[120px] whitespace-nowrap">
                Registro Profissional
              </TableHead>
              <TableHead className="min-w-[100px] whitespace-nowrap">Instagram</TableHead>
              <TableHead className="min-w-[200px] whitespace-nowrap">Endereço</TableHead>
              <TableHead className="min-w-[100px] whitespace-nowrap">CEP</TableHead>
              <TableHead className="min-w-[120px] whitespace-nowrap">Pacientes por Mês</TableHead>
              <TableHead className="min-w-[120px] whitespace-nowrap">Cupom Nutricionista</TableHead>
              <TableHead className="min-w-[120px] whitespace-nowrap">Cupom Paciente</TableHead>
              <TableHead className="min-w-[150px] whitespace-nowrap">Data de Cadastro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLeads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={14} className="text-center text-muted-foreground py-8">
                  Nenhum lead encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredLeads.map((lead) => (
                <TableRow key={lead.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium whitespace-nowrap">{lead.name}</TableCell>
                  <TableCell className="whitespace-nowrap">{lead.email || '-'}</TableCell>
                  <TableCell className="whitespace-nowrap">{lead.phone || '-'}</TableCell>
                  <TableCell className="whitespace-nowrap">{lead.document || '-'}</TableCell>
                  <TableCell className="whitespace-nowrap">{lead.specialty || '-'}</TableCell>
                  <TableCell className="whitespace-nowrap">{lead.profession || '-'}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {lead.registration_number || '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{lead.instagram || '-'}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={lead.address}>
                    {lead.address || '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{lead.cep || '-'}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {lead.patients_per_month || '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {lead.nutritionist_coupon || '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{lead.patient_coupon || '-'}</TableCell>
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
