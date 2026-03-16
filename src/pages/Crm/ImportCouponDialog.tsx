import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Upload } from 'lucide-react'
import { useMainStore } from '@/stores/main'
import { toast } from 'sonner'

export function ImportCouponDialog() {
  const [isOpen, setIsOpen] = useState(false)
  const [csvData, setCsvData] = useState('')
  const { dispatch } = useMainStore()

  const handleImport = () => {
    try {
      const lines = csvData.split('\n').filter((l) => l.trim())
      const updates = lines.map((line) => {
        const parts = line.split(',')
        if (parts.length < 2) throw new Error(`Formato inválido na linha: ${line}`)
        const code = parts[0].trim()
        const usage = parseInt(parts[1].trim(), 10)
        if (!code || isNaN(usage)) throw new Error(`Dados inválidos na linha: ${line}`)
        return { code, usage }
      })

      dispatch({ type: 'IMPORT_COUPON_USAGE', payload: updates })
      toast.success('Importação concluída', {
        description: `${updates.length} registros processados com sucesso.`,
      })
      setIsOpen(false)
      setCsvData('')
    } catch (error: any) {
      toast.error('Erro na importação', { description: error.message })
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-2">
          <Upload className="h-4 w-4" /> Importar Uso de Cupom
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importar Utilização de Cupons</DialogTitle>
          <DialogDescription>
            Cole os dados no formato CSV (Cupom, Quantidade) abaixo. O sistema irá atualizar as
            métricas de conversão dos prescritores correspondentes.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <div className="text-sm text-muted-foreground mb-2 p-3 bg-muted rounded-md font-mono">
            Exemplo:
            <br />
            JOAO10, 25
            <br />
            CORPOFORTE20, 150
          </div>
          <Textarea
            placeholder="CUPOM_A, 10&#10;CUPOM_B, 5"
            className="h-40 font-mono text-sm resize-none"
            value={csvData}
            onChange={(e) => setCsvData(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={!csvData.trim()}>
            Processar Dados
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
