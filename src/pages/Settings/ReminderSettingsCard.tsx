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
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { Bell, Save, Loader2, Eye } from 'lucide-react'
import { getIntegrations, saveIntegrations } from '@/services/settings'

export function ReminderSettingsCard({ targetUserId }: { targetUserId?: string }) {
  const [enabled, setEnabled] = useState(false)
  const [emailTemplate, setEmailTemplate] = useState('')
  const [whatsappTemplate, setWhatsappTemplate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)

  const defaultTemplate = 'Olá {{nome_cliente}}, lembramos do seu agendamento amanhã às {{hora}}.'

  useEffect(() => {
    if (!targetUserId) return
    setLoading(true)
    getIntegrations(targetUserId)
      .then((data) => {
        if (data) {
          setEnabled(data.reminder_enabled || false)
          setEmailTemplate(data.reminder_email_template || defaultTemplate)
          setWhatsappTemplate(data.reminder_whatsapp_template || defaultTemplate)
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        setLoading(false)
      })
  }, [targetUserId])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveIntegrations(
        {
          reminder_enabled: enabled,
          reminder_email_template: emailTemplate,
          reminder_whatsapp_template: whatsappTemplate,
        },
        targetUserId,
      )
      toast({
        title: 'Sucesso',
        description: 'Configurações de lembrete salvas com sucesso.',
      })
    } catch (e: any) {
      toast({
        title: 'Erro',
        description: e.message || 'Falha ao salvar',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const renderPreview = (text: string) => {
    let result = text
    result = result.replace(/\{\{nome_cliente\}\}/g, 'João Silva')
    result = result.replace(/\{\{data\}\}/g, '20/04/2026')
    result = result.replace(/\{\{hora\}\}/g, '14:30')
    return result
  }

  if (!targetUserId) return null

  return (
    <Card className="flex flex-col shadow-subtle border-border/50">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg mb-2">
            <Bell className="h-6 w-6" />
          </div>
          <Badge
            variant={enabled ? 'default' : 'secondary'}
            className={enabled ? 'bg-blue-600 hover:bg-blue-700' : ''}
          >
            {enabled ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
        <CardTitle>Lembretes Automáticos (24h)</CardTitle>
        <CardDescription>
          Configure os templates das mensagens enviadas automaticamente 1 dia antes do agendamento.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <Label
                className="text-sm text-muted-foreground cursor-pointer pr-4"
                htmlFor="reminder-enabled"
              >
                <span className="font-medium text-foreground block mb-1">Ativar Lembretes</span>
                Disparar mensagens via E-mail e WhatsApp automaticamente 24h antes da visita.
              </Label>
              <Switch id="reminder-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="space-y-4 pt-4 border-t">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-semibold">Templates de Mensagem</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreviewMode(!previewMode)}
                  className="h-8 gap-2"
                >
                  <Eye className="h-4 w-4" />
                  {previewMode ? 'Editar' : 'Visualizar Exemplo'}
                </Button>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Template para WhatsApp</Label>
                  {previewMode ? (
                    <div className="p-3 bg-muted rounded-md text-sm min-h-[100px] whitespace-pre-wrap">
                      {renderPreview(whatsappTemplate)}
                    </div>
                  ) : (
                    <Textarea
                      value={whatsappTemplate}
                      onChange={(e) => setWhatsappTemplate(e.target.value)}
                      placeholder="Olá {{nome_cliente}}..."
                      className="min-h-[100px]"
                      disabled={!enabled}
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Template para E-mail</Label>
                  {previewMode ? (
                    <div className="p-3 bg-muted rounded-md text-sm min-h-[100px] whitespace-pre-wrap">
                      {renderPreview(emailTemplate)}
                    </div>
                  ) : (
                    <Textarea
                      value={emailTemplate}
                      onChange={(e) => setEmailTemplate(e.target.value)}
                      placeholder="Olá {{nome_cliente}}..."
                      className="min-h-[100px]"
                      disabled={!enabled}
                    />
                  )}
                </div>
              </div>

              <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
                <span className="font-semibold block mb-1">Variáveis Disponíveis:</span>
                <code>{`{{nome_cliente}}`}</code>, <code>{`{{data}}`}</code>,{' '}
                <code>{`{{hora}}`}</code>
              </div>
            </div>
          </>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={loading || saving} className="w-full gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Salvando...' : 'Salvar Templates'}
        </Button>
      </CardFooter>
    </Card>
  )
}
