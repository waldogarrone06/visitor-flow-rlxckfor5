import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Key, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import { useMainStore } from '@/stores/main'
import { toast } from '@/hooks/use-toast'

export function SecretsVaultCard() {
  const { state, dispatch } = useMainStore()
  const secrets = state.settings?.secrets || []

  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [showValue, setShowValue] = useState(false)
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({})

  const suggestions = ['GOOGLE_CLIENT_ID', 'WHATSAPP_API_TOKEN', 'CRM_INTEGRATION_KEY']

  const handleAddSecret = () => {
    if (!key.trim() || !value.trim()) {
      toast({ title: 'Erro', description: 'Preencha a chave e o valor.', variant: 'destructive' })
      return
    }

    const newSecret = { id: `sec-${Date.now()}`, key: key.trim(), value: value.trim() }
    dispatch({ type: 'UPDATE_SETTINGS', payload: { secrets: [...secrets, newSecret] } })
    toast({ title: 'Secret Adicionada', description: 'Credencial salva com sucesso.' })
    setKey('')
    setValue('')
  }

  const handleRemoveSecret = (id: string) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { secrets: secrets.filter((s) => s.id !== id) } })
    toast({ title: 'Secret Removida', description: 'Credencial apagada do cofre.' })
  }

  const toggleVisibility = (id: string) => {
    setVisibleSecrets((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <Card className="flex flex-col shadow-subtle border-border/50 h-full">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="p-3 bg-zinc-100 text-zinc-700 rounded-lg mb-2">
            <Key className="h-6 w-6" />
          </div>
          <Badge variant="secondary">{secrets.length} Chaves</Badge>
        </div>
        <CardTitle>Gerenciamento de Secrets</CardTitle>
        <CardDescription>Cofre seguro para credenciais e tokens de API externos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 flex-1 flex flex-col">
        <div className="space-y-4 p-4 border rounded-md bg-muted/20">
          <div className="space-y-2">
            <Label htmlFor="secret-key">Nome da Chave</Label>
            <Input
              id="secret-key"
              placeholder="Ex: API_TOKEN"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-xs text-muted-foreground self-center">Sugestões:</span>
              {suggestions.map((s) => (
                <Badge
                  key={s}
                  variant="outline"
                  className="text-[10px] cursor-pointer hover:bg-muted font-normal"
                  onClick={() => setKey(s)}
                >
                  {s}
                </Badge>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="secret-value">Valor</Label>
            <div className="relative">
              <Input
                id="secret-value"
                type={showValue ? 'text' : 'password'}
                placeholder="Insira o token ou credencial"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowValue(!showValue)}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button onClick={handleAddSecret} className="w-full gap-2">
            <Plus className="h-4 w-4" /> Adicionar Secret
          </Button>
        </div>

        {secrets.length > 0 && (
          <div className="space-y-3 flex-1 overflow-y-auto min-h-0">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">
              Credenciais Salvas
            </Label>
            <div className="space-y-2">
              {secrets.map((secret) => (
                <div
                  key={secret.id}
                  className="flex items-center justify-between p-3 border rounded-md bg-background shadow-sm"
                >
                  <div className="overflow-hidden mr-4">
                    <p className="text-xs font-semibold text-foreground truncate">{secret.key}</p>
                    <p className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">
                      {visibleSecrets[secret.id] ? secret.value : '••••••••••••••••••••••••'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => toggleVisibility(secret.id)}
                    >
                      {visibleSecrets[secret.id] ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      onClick={() => handleRemoveSecret(secret.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
