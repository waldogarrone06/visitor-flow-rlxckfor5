import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Package, Loader2, Boxes } from 'lucide-react'

interface KitItemsDialogProps {
  kitName: string | null
  children?: React.ReactNode
}

interface KitItem {
  id: string
  product_name: string
  quantity: number
}

export function KitItemsDialog({ kitName, children }: KitItemsDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<KitItem[]>([])
  const [isPersonalized, setIsPersonalized] = useState(false)

  const fetchKitItems = useCallback(async () => {
    if (!kitName) return
    setLoading(true)
    setItems([])
    setIsPersonalized(false)

    try {
      const { data: kit, error: kitError } = await supabase
        .from('kits')
        .select('id, is_personalized')
        .eq('name', kitName)
        .limit(1)
        .maybeSingle()

      if (kitError || !kit) {
        setLoading(false)
        return
      }

      setIsPersonalized(!!kit.is_personalized)

      const { data: kitItems, error: itemsError } = await supabase
        .from('kit_items')
        .select('id, product_name, quantity')
        .eq('kit_id', kit.id)
        .order('product_name', { ascending: true })

      if (!itemsError && kitItems) {
        setItems(kitItems)
      }
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [kitName])

  useEffect(() => {
    if (open && kitName) {
      fetchKitItems()
    }
  }, [open, kitName, fetchKitItems])

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled={!kitName}>
            <Boxes className="h-3.5 w-3.5" />
            Ver Itens
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Itens do Kit
          </DialogTitle>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm font-medium text-muted-foreground">
              {kitName || 'Kit Padrão'}
            </span>
            {isPersonalized && (
              <Badge variant="secondary" className="text-xs">
                Personalizado
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <Package className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhum item cadastrado para este kit</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Lista de Separação
                </span>
                <Badge variant="outline" className="text-xs">
                  {items.length} {items.length === 1 ? 'item' : 'itens'}
                  {totalQuantity !== items.length && ` · ${totalQuantity} un.`}
                </Badge>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="h-9 text-xs uppercase tracking-wider">
                        Produto
                      </TableHead>
                      <TableHead className="h-9 text-xs uppercase tracking-wider text-right w-20">
                        Qtd.
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <TableRow key={item.id} className={index % 2 === 1 ? 'bg-muted/20' : ''}>
                        <TableCell className="py-2.5 font-medium text-sm">
                          {item.product_name}
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          <Badge variant="secondary" className="font-bold tabular-nums">
                            {item.quantity}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                Confira cada item antes de finalizar a separação do pedido.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
