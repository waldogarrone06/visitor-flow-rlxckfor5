import { useState } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { Mail } from 'lucide-react'

export function EmailSettingsCard() {
  const [active, setActive] = useState(true)

  const testConnection = () => {
    toast({
      title: 'E-mail Enviado',
      description: 'Um e-mail de teste foi enviado para sua caixa de entrada.',
    })
  }

  return (
    <Card className="flex flex-col shadow-subtle border-border/50">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg mb-2">
            <Mail className="h-6 w-6" />
          </div>
          <Badge
            variant={active ? 'default' : 'secondary'}
            className={active ? 'bg-purple-600 hover:bg-purple-700' : ''}
          >
            {active ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
        <CardTitle>Disparo de E-mails</CardTitle>
        <CardDescription>Configure notificações e relatórios automáticos.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-6">
        <div className="space-y-2">
          <Label>Nome do Remetente</Label>
          <Input defaultValue="FourLab Nutrição" />
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground cursor-pointer" htmlFor="delay-email">
              Alertas de Atraso de Kits
            </Label>
            <Switch id="delay-email" checked={active} onCheckedChange={setActive} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground cursor-pointer" htmlFor="weekly-email">
              Relatório Semanal de Conversão
            </Label>
            <Switch id="weekly-email" defaultChecked />
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button variant="secondary" onClick={testConnection} className="flex-1" disabled={!active}>
          Testar Disparo
        </Button>
      </CardFooter>
    </Card>
  )
}
