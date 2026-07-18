import { useEffect, useState } from 'react'
import { getKits, deleteKit } from '@/services/kits'
import { useAuth } from '@/hooks/use-auth'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Trash2, Package } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'

export function KitCatalog() {
  const [kits, setKits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const { toast } = useToast()

  const fetchKits = async () => {
    try {
      if (!user) return
      const data = await getKits(user.id, true)
      setKits(data)
    } catch (error) {
      console.error('Error fetching kits:', error)
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os kits.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchKits()
  }, [user])

  const handleDeleteKit = async (id: string) => {
    try {
      // Optimistic update for instant visual feedback
      setKits((prev) => prev.filter((kit) => kit.id !== id))
      await deleteKit(id)
      toast({
        title: 'Kit removido',
        description: 'O kit foi deletado com sucesso.',
      })
    } catch (error) {
      console.error('Error deleting kit:', error)
      // Revert optimistic update on failure
      fetchKits()
      toast({
        title: 'Erro',
        description: 'Ocorreu um erro ao excluir o kit.',
        variant: 'destructive',
      })
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/3">Name</TableHead>
                <TableHead className="w-1/3">Items</TableHead>
                <TableHead className="w-1/6">Type</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3].map((i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-[150px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[200px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[80px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-8 ml-auto" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="rounded-md border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[150px]">Name</TableHead>
                <TableHead className="min-w-[200px]">Items</TableHead>
                <TableHead className="min-w-[120px]">Type</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kits.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-40 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Package className="h-10 w-10 mb-3 opacity-30" />
                      <p className="text-base font-medium">No kits found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                kits.map((kit) => (
                  <TableRow key={kit.id} className="group transition-colors hover:bg-muted/50">
                    <TableCell className="font-medium">{kit.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {kit.kit_items && kit.kit_items.length > 0 ? (
                          kit.kit_items.map((item: any) => (
                            <Badge
                              key={item.id}
                              variant="secondary"
                              className="font-normal bg-secondary/50"
                            >
                              {item.quantity}x {item.product_name}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground italic">No items</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {kit.is_personalized ? (
                        <Badge
                          variant="outline"
                          className="text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800"
                        >
                          Personalized
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-slate-600 bg-slate-50 dark:bg-slate-800 dark:text-slate-300"
                        >
                          Standard
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10 focus:opacity-100"
                            title="Delete kit"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Are you sure you want to delete this kit?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently delete the kit and
                              all its associated items.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteKit(kit.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Confirm
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
