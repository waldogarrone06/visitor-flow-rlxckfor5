import { useState } from 'react'
import { useMainStore } from '@/stores/main'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ArrowDown, ArrowUp, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function LeadList() {
  const { state } = useMainStore()
  // Default sort by highest converters (descending coupon usage)
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>('desc')

  const sortedLeads = [...state.leads].sort((a, b) => {
    if (!sortDir) return 0
    const usageA = a.couponUsage || 0
    const usageB = b.couponUsage || 0
    return sortDir === 'asc' ? usageA - usageB : usageB - usageA
  })

  const toggleSort = () => {
    setSortDir((current) => (current === 'desc' ? 'asc' : 'desc'))
  }

  return (
    <div className="border border-border/60 rounded-lg bg-white overflow-hidden shadow-sm flex flex-col h-full animate-fade-in">
      <div className="overflow-auto flex-1">
        <Table>
          <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
            <TableRow>
              <TableHead className="font-semibold">Profissional / Empresa</TableHead>
              <TableHead className="font-semibold">Estágio</TableHead>
              <TableHead className="font-semibold">Tipo</TableHead>
              <TableHead className="font-semibold">Cupom</TableHead>
              <TableHead className="text-right font-semibold">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleSort}
                  className="-mr-3 hover:bg-slate-200"
                >
                  Utilizações
                  {sortDir === 'desc' ? (
                    <ArrowDown className="ml-2 h-4 w-4" />
                  ) : (
                    <ArrowUp className="ml-2 h-4 w-4" />
                  )}
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedLeads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-32 text-muted-foreground">
                  Nenhum prescritor encontrado.
                </TableCell>
              </TableRow>
            ) : (
              sortedLeads.map((lead) => (
                <TableRow key={lead.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium">{lead.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal bg-slate-100">
                      {lead.stage}
                    </Badge>
                  </TableCell>
                  <TableCell>{lead.type}</TableCell>
                  <TableCell>
                    {lead.couponCode ? (
                      <div className="flex items-center gap-1.5 text-sm">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        <span className="font-mono text-primary font-medium">
                          {lead.couponCode}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {lead.couponUsage !== undefined && lead.couponUsage > 0 ? (
                      <Badge variant={lead.couponUsage > 10 ? 'default' : 'secondary'}>
                        {lead.couponUsage}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">0</span>
                    )}
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
