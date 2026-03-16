import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Trophy, TrendingUp } from 'lucide-react'
import { useMainStore } from '@/stores/main'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Link } from 'react-router-dom'

export function TopPerformersWidget() {
  const { state } = useMainStore()
  const [hasNotified, setHasNotified] = useState(false)

  const topLeads = state.leads
    .filter((l) => l.couponUsage && l.couponUsage > 0)
    .map((lead) => {
      let growth = 0
      if (lead.conversionsHistory && lead.conversionsHistory.length >= 2) {
        const last = lead.conversionsHistory[lead.conversionsHistory.length - 1].count
        const prev = lead.conversionsHistory[lead.conversionsHistory.length - 2].count
        if (prev > 0) {
          growth = ((last - prev) / prev) * 100
        }
      }
      return { ...lead, growth }
    })
    .sort((a, b) => (b.couponUsage || 0) - (a.couponUsage || 0))
    .slice(0, 5)

  useEffect(() => {
    if (!hasNotified) {
      topLeads.forEach((lead) => {
        if (lead.targetConversionGoal && (lead.couponUsage || 0) >= lead.targetConversionGoal) {
          toast.success(`Meta Alcançada: ${lead.name}`, {
            description: `Atingiu a meta de ${lead.targetConversionGoal} conversões!`,
            icon: <Trophy className="h-4 w-4 text-yellow-500" />,
            duration: 8000,
          })
        }
      })
      setHasNotified(true)
    }
  }, [topLeads, hasNotified])

  return (
    <Card className="shadow-subtle flex-1 flex flex-col">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Top Prescritores
          </CardTitle>
          <CardDescription>Maior volume de conversões e crescimento</CardDescription>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              Relatório Semanal
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Relatório Semanal de Performance</DialogTitle>
            </DialogHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prescritor</TableHead>
                  <TableHead>Uso Total</TableHead>
                  <TableHead>Crescimento (mês)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">
                      <Link
                        to={`/crm/prescritor/${lead.id}`}
                        className="hover:underline hover:text-primary"
                      >
                        {lead.name}
                      </Link>
                    </TableCell>
                    <TableCell>{lead.couponUsage}</TableCell>
                    <TableCell>
                      {lead.growth > 0 ? (
                        <span className="text-success flex items-center gap-1 font-medium">
                          <TrendingUp className="h-4 w-4" /> +{lead.growth.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto min-h-[200px]">
        <div className="space-y-4">
          {topLeads.map((lead, idx) => (
            <div
              key={lead.id}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="text-lg font-bold text-muted-foreground w-4 text-center">
                  {idx + 1}
                </div>
                <Avatar className="h-10 w-10 border border-border">
                  <AvatarImage
                    src={`https://img.usecurling.com/ppl/thumbnail?gender=male&seed=${lead.avatarSeed || 1}`}
                  />
                  <AvatarFallback>{lead.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <Link
                    to={`/crm/prescritor/${lead.id}`}
                    className="text-sm font-medium leading-none hover:underline"
                  >
                    {lead.name}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-1">
                    {lead.couponUsage} conversões
                  </p>
                </div>
              </div>
              {lead.growth > 20 && (
                <Badge
                  variant="secondary"
                  className="bg-green-100 text-green-700 hover:bg-green-200 border-none gap-1"
                >
                  <TrendingUp className="h-3 w-3" /> Alto Crescimento
                </Badge>
              )}
            </div>
          ))}
          {topLeads.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-4">
              Nenhum dado de conversão disponível.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
