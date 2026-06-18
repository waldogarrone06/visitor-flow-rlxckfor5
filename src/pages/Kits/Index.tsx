import { KitInventory } from './Inventory'
import { KitShipments } from './Shipments'
import { KitBuilder } from './KitBuilder'
import { KitCatalog } from './KitCatalog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function KitsPage() {
  return (
    <Card className="w-full max-w-full overflow-hidden animate-slide-up border-none shadow-none sm:border sm:shadow-sm bg-transparent sm:bg-card">
      <CardHeader className="px-0 sm:px-6 pt-0 sm:pt-6">
        <CardTitle className="text-2xl font-bold tracking-tight">
          Gestão de Kits & Logística
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Controle a montagem, estoque de amostras e acompanhamento de envios.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-0 sm:px-6 pb-0 sm:pb-6">
        <Tabs defaultValue="catalog" className="w-full max-w-full">
          <TabsList className="grid w-full md:w-[800px] grid-cols-4">
            <TabsTrigger value="catalog">Catálogo</TabsTrigger>
            <TabsTrigger value="builder">Kit e Cupom</TabsTrigger>
            <TabsTrigger value="inventory">Estoque</TabsTrigger>
            <TabsTrigger value="shipments">Envio</TabsTrigger>
          </TabsList>

          <TabsContent value="catalog" className="mt-6">
            <KitCatalog />
          </TabsContent>

          <TabsContent value="builder" className="mt-6">
            <KitBuilder />
          </TabsContent>

          <TabsContent value="inventory" className="mt-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-lg font-semibold">Controle de Estoque</h2>
                  <p className="text-sm text-muted-foreground">
                    Gerencie o nível de estoque dos produtos e amostras.
                  </p>
                </div>
              </div>
              <KitInventory />
            </div>
          </TabsContent>

          <TabsContent value="shipments" className="mt-6 space-y-6">
            <div className="w-full max-w-full overflow-hidden">
              <KitShipments />
            </div>
            <div className="rounded-lg border bg-muted/50 text-muted-foreground shadow-sm p-4 mt-6">
              <h3 className="font-semibold text-base mb-1 text-foreground">
                Lógica de Disparo Automático
              </h3>
              <p className="text-sm">
                A sincronização com a transportadora ocorre automaticamente em background. O sistema
                atualiza os kits para "Enviado" assim que um código de rastreio válido é salvo e
                para "Entregue" quando a transportadora confirma a entrega. O NPS é acionado
                automaticamente 24h após a marcação de "Entregue".
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
