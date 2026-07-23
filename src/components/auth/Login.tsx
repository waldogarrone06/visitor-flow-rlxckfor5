import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'
import { FourLabLogo } from '@/components/FourLabLogo'

export function Login() {
  const [email, setEmail] = useState('wal@fourlabnutri.com.br')
  const [password, setPassword] = useState('Skip@Pass')
  const [isLoading, setIsLoading] = useState(false)
  const { signIn } = useAuth()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    const { error } = await signIn(email, password)
    if (error) {
      toast({ title: 'Erro no login', description: error.message, variant: 'destructive' })
    }
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 animate-fade-in">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center w-full">
            <FourLabLogo className="h-12 w-auto text-foreground" />
          </div>
          <div>
            <CardTitle>Acesso ao Sistema</CardTitle>
            <CardDescription className="mt-1">
              Faça login para acessar o painel do Visitor Flow.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">E-mail</label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="nome@empresa.com"
                required
                className="bg-muted/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Senha</label>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="••••••••"
                required
                className="bg-muted/50"
              />
            </div>
            <Button type="submit" className="w-full h-11 text-base mt-2" disabled={isLoading}>
              {isLoading ? 'Autenticando...' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
