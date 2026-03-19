import { KitInventory } from './Inventory'
import { KitShipments } from './Shipments'
import { KitBuilder } from './KitBuilder'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function KitsPage() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gestão de Kits & Logística</h1>
        <p className="text-muted-foreground">
          Controle a montagem, estoque de amostras e acompanhamento de envios.
        </p>
      </div>

      <Tabs defaultValue="builder" className="w-full">
        <TabsList className="grid w-full md:w-[400px] grid-cols-2">
          <TabsTrigger value="builder">Montagem de Kits</TabsTrigger>
          <TabsTrigger value="inventory">Estoque & Envios</TabsTrigger>
        </TabsList>

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
                <div className="p-3 bg-muted rounded-md border text-xs">
                  Última sincronização com transportadora: <strong>Hoje, 09:30</strong>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
