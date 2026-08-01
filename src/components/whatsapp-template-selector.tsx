import { useState, useEffect, useCallback } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { Loader2, RefreshCw, AlertCircle } from 'lucide-react'

export interface TemplateParameter {
  name: string
  type: string
  value: string
}

export interface SelectedTemplate {
  name: string
  language: string
  parameter_format: string
  parameters: TemplateParameter[]
}

interface WhatsAppTemplateSelectorProps {
  userId?: string
  enabled: boolean
  onTemplateChange: (template: SelectedTemplate | null) => void
  refetchTrigger?: number
}

export function WhatsAppTemplateSelector({
  userId,
  enabled,
  onTemplateChange,
  refetchTrigger,
}: WhatsAppTemplateSelectorProps) {
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedName, setSelectedName] = useState('')
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  const fetchTemplates = useCallback(async () => {
    if (!userId || !enabled) return
    setLoading(true)
    setError('')
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-templates', {
        body: { userId },
      })
      if (error) {
        let errorDetail = error.message
        if (error instanceof FunctionsHttpError) {
          try {
            const errorBody = await error.context.json()
            errorDetail = errorBody?.error || errorDetail
          } catch {
            try {
              errorDetail = await error.context.text()
            } catch {
              /* intentionally ignored */
            }
          }
        }
        console.error('[WhatsAppTemplateSelector] Erro ao carregar templates:', errorDetail)
        setError(`Erro ao carregar templates: ${errorDetail}`)
        return
      }
      if (data?.templates) {
        setTemplates(data.templates)
      } else if (data?.error) {
        console.error('[WhatsAppTemplateSelector] Erro ao carregar templates:', data.error)
        setError(`Erro ao carregar templates: ${data.error}`)
      }
    } catch (err: any) {
      console.error('[WhatsAppTemplateSelector] Erro ao carregar templates:', err)
      setError(err.message || 'Falha ao carregar templates')
    } finally {
      setLoading(false)
    }
  }, [userId, enabled])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates, refetchTrigger])

  useEffect(() => {
    if (!selectedName) {
      onTemplateChange(null)
      return
    }
    const template = templates.find((t) => t.name === selectedName)
    if (!template) {
      onTemplateChange(null)
      return
    }
    const params: TemplateParameter[] = (template.parameters || []).map((p: any) => ({
      name: p.name,
      type: p.type,
      value: paramValues[p.name] || '',
    }))
    onTemplateChange({
      name: template.name,
      language: template.language,
      parameter_format: template.parameter_format,
      parameters: params,
    })
  }, [selectedName, paramValues, templates, onTemplateChange])

  if (!enabled) return null

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando templates...
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive leading-relaxed">{error}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchTemplates}>
          <RefreshCw className="h-3 w-3 mr-1" />
          Tentar novamente
        </Button>
      </div>
    )
  }

  if (templates.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Nenhum template aprovado encontrado na sua conta do Meta. Crie e aprove templates no Meta
          Business Manager para que apareçam aqui.
        </p>
        <Button variant="outline" size="sm" onClick={fetchTemplates}>
          <RefreshCw className="h-3 w-3 mr-1" />
          Atualizar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Template</Label>
        <Button variant="ghost" size="sm" onClick={fetchTemplates}>
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
      <Select value={selectedName} onValueChange={setSelectedName}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione um template" />
        </SelectTrigger>
        <SelectContent>
          {templates.map((t) => (
            <SelectItem key={t.id} value={t.name}>
              {t.name} ({t.language})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedName &&
        (() => {
          const template = templates.find((t) => t.name === selectedName)
          if (!template?.parameters?.length) return null
          return (
            <div className="space-y-2">
              {template.parameters.map((p: any, i: number) => (
                <div key={i} className="space-y-1">
                  <Label className="text-xs">
                    {template.parameter_format === 'NAMED' ? p.name : `Parâmetro ${i + 1}`}
                  </Label>
                  <Input
                    value={paramValues[p.name] || ''}
                    onChange={(e) =>
                      setParamValues((prev) => ({ ...prev, [p.name]: e.target.value }))
                    }
                    placeholder={`Valor para ${p.name}`}
                  />
                </div>
              ))}
            </div>
          )
        })()}
    </div>
  )
}
