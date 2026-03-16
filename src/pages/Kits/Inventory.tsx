import { useMainStore } from '@/stores/main'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { AlertCircle, PackagePlus } from 'lucide-react'

export function KitInventory() {
  const { state } = useMainStore()

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {state.kits.map((kit) => {
        const isLow = kit.stock <= kit.threshold
        const progress = Math.min((kit.stock / (kit.threshold * 3)) * 100, 100)

        return (
          <Card
            key={kit.id}
            className={`shadow-subtle border-border/50 relative overflow-hidden ${isLow ? 'border-destructive/50 ring-1 ring-destructive/20' : ''}`}
          >
            {isLow && <div className="absolute top-0 inset-x-0 h-1 bg-destructive" />}
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-base">{kit.name}</CardTitle>
                {isLow && <AlertCircle className="h-5 w-5 text-destructive" />}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{kit.description}</p>
            </CardHeader>
            <CardContent className="pb-2">
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-3xl font-bold ${isLow ? 'text-destructive' : ''}`}>
                  {kit.stock}
                </span>
                <span className="text-sm text-muted-foreground">em estoque</span>
              </div>
              <Progress
                value={progress}
                className={`h-2 ${isLow ? '[&>div]:bg-destructive' : ''}`}
              />
              <p className="text-xs text-muted-foreground mt-2 text-right">
                Mínimo: {kit.threshold}
              </p>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full gap-2 h-8 text-xs">
                <PackagePlus className="h-3 w-3" /> Repor Estoque
              </Button>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}
