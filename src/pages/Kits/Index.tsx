import { KitInventory } from './Inventory'
import { KitShipments } from './Shipments'

export default function KitsPage() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gestão de Kits & Logística</h1>
        <p className="text-muted-foreground">
          Controle de estoque de amostras e acompanhamento de envios automáticos.
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-3">Visão Geral do Estoque</h2>
          <KitInventory />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <KitShipments />
          </div>
          <div>
            <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6 space-y-4">
              <h3 className="font-semibold text-lg">Lógica de Disparo</h3>
              <p className="text-sm text-muted-foreground">
                Os kits são despachados automaticamente quando um Lead no CRM é movido para o
                estágio
                <strong className="text-foreground"> "Visitado"</strong>. O sistema gera uma ordem
                de envio e atualiza o estoque.
              </p>
              <div className="p-3 bg-muted rounded-md border text-xs">
                Última sincronização com transportadora: <strong>Hoje, 09:30</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
