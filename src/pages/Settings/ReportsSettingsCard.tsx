import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { FileText } from 'lucide-react'
import { useMainStore } from '@/stores/main'

export function ReportsSettingsCard() {
  const { state, dispatch } = useMainStore()

  return (
    <Card className="flex flex-col shadow-subtle border-border/50">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg mb-2">
            <FileText className="h-6 w-6" />
          </div>
        </div>
        <CardTitle>CRM & Relatórios</CardTitle>
        <CardDescription>
          Automatize a geração de relatórios de presença e a atualização de prontuários.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label
              className="text-sm text-muted-foreground cursor-pointer pr-4"
              htmlFor="auto-generate-reports"
            >
              <span className="font-medium text-foreground block mb-1">
                Relatórios de Participação Automáticos
              </span>
              Pré-preencher os relatórios de presença automaticamente após o fim de reuniões via
              Google Meet.
            </Label>
            <Switch
              id="auto-generate-reports"
              checked={state.settings?.autoGenerateParticipationReports ?? false}
              onCheckedChange={(c) =>
                dispatch({
                  type: 'UPDATE_SETTINGS',
                  payload: { autoGenerateParticipationReports: c },
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <Label
              className="text-sm text-muted-foreground cursor-pointer pr-4"
              htmlFor="auto-export-crm"
            >
              <span className="font-medium text-foreground block mb-1">
                Exportar para Prontuário CRM
              </span>
              Exportar detalhes de presença (Presente/Ausente) diretamente para o prontuário
              eletrônico do prescritor após concluir o relatório.
            </Label>
            <Switch
              id="auto-export-crm"
              checked={state.settings?.autoExportToCRM ?? false}
              onCheckedChange={(c) =>
                dispatch({ type: 'UPDATE_SETTINGS', payload: { autoExportToCRM: c } })
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
