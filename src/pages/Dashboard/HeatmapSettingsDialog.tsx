import { useState } from 'react'
import { useMainStore } from '@/stores/main'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Settings } from 'lucide-react'

export function HeatmapSettingsDialog() {
  const { state, dispatch } = useMainStore()
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState(state.heatmapConfig)

  const handleSave = () => {
    dispatch({ type: 'UPDATE_HEATMAP_CONFIG', payload: config })
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setConfig(state.heatmapConfig)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 shrink-0">
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">Configurações</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurações do Mapa de Calor</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cor (Mínima densidade)</Label>
              <div className="flex gap-2 items-center">
                <Input
                  type="color"
                  value={config.lowColor}
                  onChange={(e) => setConfig({ ...config, lowColor: e.target.value })}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input
                  type="text"
                  value={config.lowColor}
                  onChange={(e) => setConfig({ ...config, lowColor: e.target.value })}
                  className="flex-1 uppercase"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cor (Máxima densidade)</Label>
              <div className="flex gap-2 items-center">
                <Input
                  type="color"
                  value={config.highColor}
                  onChange={(e) => setConfig({ ...config, highColor: e.target.value })}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input
                  type="text"
                  value={config.highColor}
                  onChange={(e) => setConfig({ ...config, highColor: e.target.value })}
                  className="flex-1 uppercase"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Limite Mínimo (Visitas)</Label>
              <Input
                type="number"
                min="0"
                value={config.minThreshold}
                onChange={(e) =>
                  setConfig({ ...config, minThreshold: parseInt(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Limite Máximo (Visitas)</Label>
              <Input
                type="number"
                min="1"
                value={config.maxThreshold}
                onChange={(e) =>
                  setConfig({ ...config, maxThreshold: parseInt(e.target.value) || 1 })
                }
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end pt-2 border-t">
          <Button onClick={handleSave}>Salvar Alterações</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
