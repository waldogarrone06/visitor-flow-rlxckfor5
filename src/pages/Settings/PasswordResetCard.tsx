import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'
import { KeyRound, Loader2 } from 'lucide-react'

// Contas criadas por migrations com senha padrão conhecida ("Skip@Pass" /
// "Skip@Pass123"). Envia e-mail de redefinição (fluxo recovery do Supabase)
// para cada uma, para que a senha padrão deixe de ser a credencial válida.
// Lista conciliada com o banco vivo (crypt('Skip@Pass', encrypted_password) em
// auth.users, conferido em 2026-11): apenas esta conta ainda tem a senha
// padrão — as demais (anderson@, caique.andrada@, admin@example.com,
// user@example.com) já foram redefinidas.
const DEFAULT_PASSWORD_EMAILS = ['wal@fourlabnutri.com.br']

export function PasswordResetCard() {
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string[]>([])

  const handleReset = async (email: string) => {
    setIsLoading(email)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      })
      if (error) throw error
      setSentTo((prev) => [...prev, email])
      toast({
        title: 'E-mail de redefinição enviado',
        description: `Instruções enviadas para ${email}.`,
      })
    } catch (error: any) {
      toast({
        title: 'Erro ao enviar redefinição',
        description: error.message || `Falha para ${email}.`,
        variant: 'destructive',
      })
    } finally {
      setIsLoading(null)
    }
  }

  const handleResetAll = async () => {
    for (const email of DEFAULT_PASSWORD_EMAILS) {
      if (!sentTo.includes(email)) {
        // Sequencial para não disparar rate-limit do Supabase Auth.
        await handleReset(email)
      }
    }
  }

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-amber-600" />
          Senhas padrão a redefinir
        </CardTitle>
        <CardDescription>
          Contas criadas por migrations com senha padrão conhecida (Skip@Pass / Skip@Pass123). Envie
          o e-mail de redefinição para cada uma — a senha padrão não pode continuar válida.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {DEFAULT_PASSWORD_EMAILS.map((email) => (
            <li key={email} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate" title={email}>
                {email}
                {sentTo.includes(email) && (
                  <span className="ml-2 text-xs text-green-600">✓ e-mail enviado</span>
                )}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={isLoading === email}
                onClick={() => handleReset(email)}
              >
                {isLoading === email ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  'Enviar redefinição'
                )}
              </Button>
            </li>
          ))}
        </ul>
        <Button
          className="w-full"
          variant="secondary"
          disabled={isLoading !== null}
          onClick={handleResetAll}
        >
          {isLoading !== null ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Enviar para todos pendentes'
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          O link de redefinição usa o fluxo de recovery do Supabase e expira sozinho. Repita o envio
          se algum e-mail não chegar.
        </p>
      </CardContent>
    </Card>
  )
}
