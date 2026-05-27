import { useState, useEffect } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { PackageSearch } from 'lucide-react'
import { getIntegrations, saveIntegrations } from '@/services/settings'

export function MelhorEnvioCard({ targetUserId }: { targetUserId?: string }) {
  const [token, setToken] = useState('')
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!targetUserId) return
    setLoading(true)
    getIntegrations(targetUserId).then((data) => {
      if (data && data.melhor_envio_token) {
        setToken(data.melhor_envio_token)
        setConnected(true)
      } else {
        setToken('')
        setConnected(false)
      }
      setLoading(false)
    })
  }, [targetUserId])

  const handleSave = async () => {
    if (!token) {
      toast({
        title: 'Aviso',
        description: 'Preencha o token para conectar.',
        variant: 'destructive',
      })
      return
    }
    await saveIntegrations({ melhor_envio_token: token }, targetUserId)
    setConnected(true)
    toast({
      title: 'Melhor Envio Conectado',
      description: 'Token de integração salvo com sucesso.',
    })
  }

  const handleDisconnect = async () => {
    await saveIntegrations({ melhor_envio_token: null }, targetUserId)
    setToken('')
    setConnected(false)
    toast({ title: 'Melhor Envio Desconectado' })
  }

  if (!targetUserId) return null

  return (
    <Card className="flex flex-col shadow-subtle border-border/50">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg mb-2">
            <PackageSearch className="h-6 w-6" />
          </div>
          <Badge
            variant={connected ? 'default' : 'secondary'}
            className={connected ? 'bg-green-600 hover:bg-green-700' : ''}
          >
            {connected ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
        <CardTitle>Integração Melhor Envio</CardTitle>
        <CardDescription>
          Conecte para rastrear envios de kits e automatizar o status para "Entregue".
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {loading ? (
          <div className="animate-pulse h-10 bg-muted rounded w-full"></div>
        ) : (
          <div className="space-y-2">
            <Label>Token da API Melhor Envio</Label>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Seu token de acesso (Bearer)"
              type="password"
              disabled={connected}
            />
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {connected ? (
          <Button
            variant="outline"
            onClick={handleDisconnect}
            className="w-full text-destructive hover:bg-destructive/10"
          >
            Desconectar
          </Button>
        ) : (
          <Button onClick={handleSave} className="w-full" disabled={loading || !token}>
            Salvar Token
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
