import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { AlertTriangle, Package } from 'lucide-react'

interface InventoryItem {
  id: string
  product_name: string
  stock_level: number
  min_threshold: number
}

export function InventoryAlerts() {
  const { user } = useAuth()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const fetchInventory = async () => {
      setLoading(true)
      try {
        const { data } = await supabase
          .from('inventory_items')
          .select('id, product_name, stock_level, min_threshold')
          .eq('user_id', user.id)
          .order('stock_level', { ascending: true })

        const lowStock = (data || []).filter((item) => item.stock_level <= item.min_threshold)
        setItems(lowStock)
      } catch (err) {
        console.error('Error fetching inventory:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchInventory()
  }, [user])

  return (
    <Card className="shadow-subtle">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Alertas de Estoque
          {items.length > 0 && (
            <span className="ml-auto text-sm font-normal text-destructive">
              {items.length} item(ns)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Package className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">
              Todos os produtos estão com estoque adequado.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-2 rounded-lg border border-destructive/30 bg-destructive/5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.product_name}</p>
                  <Progress
                    value={Math.min((item.stock_level / (item.min_threshold * 3)) * 100, 100)}
                    className="h-1.5 mt-1.5 [&>div]:bg-destructive"
                  />
                </div>
                <div className="text-right shrink-0">
                  <span className="text-lg font-bold text-destructive">{item.stock_level}</span>
                  <span className="text-xs text-muted-foreground block">
                    mín: {item.min_threshold}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
