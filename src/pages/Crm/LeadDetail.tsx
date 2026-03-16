import { useParams, Link } from 'react-router-dom'
import { useMainStore } from '@/stores/main'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, User, MapPin, Tag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ConversionEvolutionChart } from './ConversionEvolutionChart'

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { state } = useMainStore()

  const lead = state.leads.find((l) => l.id === id)

  if (!lead) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold">Prescritor não encontrado</h2>
        <Link to="/crm">
          <Button variant="link" className="mt-4">
            Voltar ao CRM
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-slide-up pb-8">
      <div className="flex items-center gap-4">
        <Link to="/crm">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{lead.name}</h1>
          <p className="text-muted-foreground flex items-center gap-2 mt-1">
            {lead.company || lead.type}
            <Badge variant="outline">{lead.stage}</Badge>
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 shadow-subtle h-fit">
          <CardHeader>
            <CardTitle className="text-lg">Informações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <User className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">Contato</p>
                <p className="text-sm text-muted-foreground">{lead.email || 'Sem e-mail'}</p>
                <p className="text-sm text-muted-foreground">{lead.phone || 'Sem telefone'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium">Endereço</p>
                <p className="text-sm text-muted-foreground">{lead.address}</p>
                <p className="text-sm text-muted-foreground">
                  {lead.neighborhood} - {lead.state}
                </p>
              </div>
            </div>
            {lead.couponCode && (
              <div className="flex items-start gap-3">
                <Tag className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Cupom Ativo</p>
                  <Badge variant="secondary" className="mt-1 font-mono">
                    {lead.couponCode}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    Total de usos: {lead.couponUsage || 0}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2 shadow-subtle">
          <CardHeader>
            <CardTitle className="text-lg">Evolução de Conversões</CardTitle>
            <CardDescription>Histórico de uso do cupom ao longo dos meses.</CardDescription>
          </CardHeader>
          <CardContent>
            <ConversionEvolutionChart data={lead.conversionsHistory || []} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
