import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { AlertCircle, PackagePlus, Plus, Minus, Trash2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

interface InventoryItem {
  id: string
  product_name: string
  stock_level: number
  min_threshold: number
}

export function KitInventory() {
  const { user } = useAuth()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newItem, setNewItem] = useState({ product_name: '', stock_level: 0, min_threshold: 10 })

  const loadInventory = async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await (supabase.from('inventory_items' as any) as any)
      .select('*')
      .eq('user_id', user.id)
      .order('product_name')

    if (!error && data) {
      setItems(data as InventoryItem[])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadInventory()
  }, [user])

  const handleAddItem = async () => {
    if (!user) return
    if (!newItem.product_name)
      return toast({
        title: 'Erro',
        description: 'Nome do produto é obrigatório',
        variant: 'destructive',
      })

    const { error } = await supabase.from('inventory_items' as any).insert([
      {
        user_id: user.id,
        product_name: newItem.product_name,
        stock_level: newItem.stock_level,
        min_threshold: newItem.min_threshold,
      },
    ])

    if (error) {
      toast({ title: 'Erro', description: 'Falha ao adicionar item.', variant: 'destructive' })
    } else {
      toast({ title: 'Sucesso', description: 'Item adicionado ao estoque.' })
      setIsAddOpen(false)
      setNewItem({ product_name: '', stock_level: 0, min_threshold: 10 })
      loadInventory()
    }
  }

  const handleUpdateStock = async (id: string, amount: number) => {
    const item = items.find((i) => i.id === id)
    if (!item) return
    const newStock = Math.max(0, item.stock_level + amount)

    // Optimistic update
    setItems(items.map((i) => (i.id === id ? { ...i, stock_level: newStock } : i)))

    const { error } = await supabase
      .from('inventory_items' as any)
      .update({ stock_level: newStock, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      toast({ title: 'Erro', description: 'Falha ao atualizar estoque.', variant: 'destructive' })
      loadInventory() // Revert optimistic update
    }
  }

  const handleDeleteItem = async (id: string) => {
    const { error } = await supabase
      .from('inventory_items' as any)
      .delete()
      .eq('id', id)

    if (error) {
      toast({ title: 'Erro', description: 'Falha ao remover item.', variant: 'destructive' })
    } else {
      toast({ title: 'Sucesso', description: 'Item removido do estoque.' })
      loadInventory()
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Itens em Estoque</h3>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Novo Produto
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Produto ao Estoque</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome do Produto / Amostra</Label>
                <Input
                  value={newItem.product_name}
                  onChange={(e) => setNewItem({ ...newItem, product_name: e.target.value })}
                  placeholder="Ex: Amostra Whey Protein"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Quantidade Inicial</Label>
                  <Input
                    type="number"
                    min={0}
                    value={newItem.stock_level}
                    onChange={(e) =>
                      setNewItem({ ...newItem, stock_level: parseInt(e.target.value) || 0 })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Alerta de Estoque Baixo</Label>
                  <Input
                    type="number"
                    min={1}
                    value={newItem.min_threshold}
                    onChange={(e) =>
                      setNewItem({ ...newItem, min_threshold: parseInt(e.target.value) || 10 })
                    }
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddItem}>Adicionar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="p-8 text-center text-muted-foreground animate-pulse border rounded-lg">
          Carregando estoque...
        </div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground border border-dashed rounded-lg bg-slate-50/50">
          <PackagePlus className="h-10 w-10 mx-auto mb-3 opacity-20" />
          Nenhum produto cadastrado no estoque.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => {
            const isLow = item.stock_level <= item.min_threshold
            const progress = Math.min((item.stock_level / (item.min_threshold * 3)) * 100, 100)

            return (
              <Card
                key={item.id}
                className={`shadow-subtle border-border/50 relative overflow-hidden ${isLow ? 'border-destructive/50 ring-1 ring-destructive/20' : ''}`}
              >
                {isLow && <div className="absolute top-0 inset-x-0 h-1 bg-destructive" />}
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-base truncate pr-2" title={item.product_name}>
                      {item.product_name}
                    </CardTitle>
                    <div className="flex items-center gap-1 shrink-0">
                      {isLow && <AlertCircle className="h-4 w-4 text-destructive" />}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive -mr-2"
                        onClick={() => handleDeleteItem(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className={`text-3xl font-bold ${isLow ? 'text-destructive' : ''}`}>
                      {item.stock_level}
                    </span>
                    <span className="text-sm text-muted-foreground">unidades</span>
                  </div>
                  <Progress
                    value={progress}
                    className={`h-2 ${isLow ? '[&>div]:bg-destructive' : ''}`}
                  />
                  <p className="text-xs text-muted-foreground mt-2 text-right">
                    Mínimo: {item.min_threshold}
                  </p>
                </CardContent>
                <CardFooter className="pt-0 pb-4">
                  <div className="flex w-full gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleUpdateStock(item.id, -1)}
                      disabled={item.stock_level <= 0}
                    >
                      <Minus className="h-3.5 w-3.5 mr-1" /> Remover
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleUpdateStock(item.id, 1)}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
