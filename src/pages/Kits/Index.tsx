import { useState } from 'react'
import { KitInventory } from './Inventory'
import { KitShipments } from './Shipments'
import { KitBuilder } from './KitBuilder'
import { KitCatalog } from './KitCatalog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'

export default function KitsPage() {
  const [isSyncing, setIsSyncing] = useState(false)

  const handleSyncTracking = async () => {
    try {
      setIsSyncing(true)
      const { data, error } = await supabase.functions.invoke('track-shipping', {
        method: 'POST',
      })
      if (error) throw error

      if (data && data.updatedCount > 0) {
        toast.success(`Sincronização concluída. ${data.updatedCount} kits atualizados!`)
      } else {
        toast.info('Sincronização concluída. Nenhum kit precisava de atualização.')
      }
    } catch (err: any) {
      toast.error('Erro ao sincronizar com a transportadora', {
        description: err.message,
      })
    } finally {
      setIsSyncing(false)
    }
  }
  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gestão de Kits & Logística</h1>
        <p className="text-muted-foreground">
          Controle a montagem, estoque de amostras e acompanhamento de envios.
        </p>
      </div>

      <Tabs defaultValue="catalog" className="w-full">
        <TabsList className="grid w-full md:w-[600px] grid-cols-3">
          <TabsTrigger value="catalog">Catálogo de Kits</TabsTrigger>
          <TabsTrigger value="builder">Montagem de Kits</TabsTrigger>
          <TabsTrigger value="inventory">Estoque & Envios</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="mt-6">
          <KitCatalog />
        </TabsContent>

        <TabsContent value="builder" className="mt-6">
          <KitBuilder />
        </TabsContent>

        <TabsContent value="inventory" className="mt-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-3">Visão Geral do Estoque Base</h2>
            <KitInventory />
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <KitShipments />
            </div>
            <div>
              <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6 space-y-4">
                <h3 className="font-semibold text-lg">Lógica de Disparo Automático</h3>
                <p className="text-sm text-muted-foreground">
                  No novo fluxo, os kits são despachados quando você altera o{' '}
                  <strong>Status do Kit</strong> do Lead no CRM para "Enviado" ou "Entregue". O NPS
                  é acionado automaticamente 24h após a marcação de "Entregue".
                </p>
                <div className="p-3 bg-muted rounded-md border text-xs flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                  <span>
                    A sincronização ocorre automaticamente. Para forçar a verificação de todos os
                    envios pendentes agora, clique ao lado.
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSyncTracking}
                    disabled={isSyncing}
                    className="shrink-0"
                  >
                    <RefreshCw className={`h-3 w-3 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
