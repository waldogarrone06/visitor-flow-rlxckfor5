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
import { BookOpen, Save } from 'lucide-react'
import { getIntegrations, saveIntegrations } from '@/services/settings'
import { toast } from '@/hooks/use-toast'

interface CatalogSettingsCardProps {
  targetUserId?: string
}

export function CatalogSettingsCard({ targetUserId }: CatalogSettingsCardProps) {
  const [link, setLink] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const data = await getIntegrations(targetUserId)
      if (data) {
        setLink(data.catalog_link || '')
      }
      setLoading(false)
    }
    load()
  }, [targetUserId])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveIntegrations({ catalog_link: link }, targetUserId)
      toast({
        title: 'Configurações salvas',
        description: 'O link do catálogo foi salvo com sucesso.',
      })
    } catch (err) {
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar as configurações.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="flex flex-col shadow-subtle border-border/50">
      <CardHeader className="pb-4 border-b">
        <div className="flex justify-between items-start">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg mb-2">
            <BookOpen className="h-6 w-6" />
          </div>
        </div>
        <CardTitle>Link do Catálogo</CardTitle>
        <CardDescription>
          Configure o link do seu catálogo profissional para acessá-lo facilmente na agenda.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 flex-1 space-y-4">
        {loading ? (
          <div className="h-10 flex items-center justify-center text-muted-foreground text-sm">
            Carregando...
          </div>
        ) : (
          <div className="space-y-2">
            <Label>URL do Catálogo</Label>
            <Input
              placeholder="https://meucatalogo.com.br"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </div>
        )}
      </CardContent>
      <CardFooter className="border-t p-4 bg-slate-50/50 mt-auto">
        <Button onClick={handleSave} disabled={loading || saving} className="w-full gap-2">
          <Save className="h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
      </CardFooter>
    </Card>
  )
}
