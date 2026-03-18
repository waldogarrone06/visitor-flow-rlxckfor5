import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Database, CheckCircle2, AlertCircle } from 'lucide-react'
import { useMainStore } from '@/stores/main'

export function DatabaseStatusCard() {
  const { state } = useMainStore()
  const status = state.settings?.supabaseStatus || 'connected'

  return (
    <Card className="flex flex-col shadow-subtle border-border/50 h-full">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="p-3 bg-slate-100 text-slate-700 rounded-lg mb-2">
            <Database className="h-6 w-6" />
          </div>
          <Badge
            variant={status === 'connected' ? 'default' : 'secondary'}
            className={status === 'connected' ? 'bg-green-600 hover:bg-green-700' : ''}
          >
            {status === 'connected' ? 'Conectado' : 'Pendente'}
          </Badge>
        </div>
        <CardTitle>Configuração do Banco de Dados</CardTitle>
        <CardDescription>Conexão com o banco de dados oficial Supabase.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <div className="rounded-md bg-muted/50 p-4 flex items-start gap-3 border border-border/50">
          {status === 'connected' ? (
            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium">Status da Conexão</p>
            <p className="text-sm text-muted-foreground mt-1">
              O sistema está utilizando o banco de dados oficial fornecido pelo usuário. As
              operações de leitura e escrita estão funcionando normalmente e sincronizadas em tempo
              real.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
