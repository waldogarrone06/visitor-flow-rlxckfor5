import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Plus, Download } from 'lucide-react'
import { KanbanBoard } from './KanbanBoard'

export default function CrmPage() {
  return (
    <div className="space-y-4 animate-slide-up h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CRM Pipeline</h1>
          <p className="text-muted-foreground">Gerencie o fluxo de seus contatos e clientes.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" /> Exportar
          </Button>
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" /> Novo Lead
          </Button>
        </div>
      </div>

      <Tabs defaultValue="kanban" className="flex-1 flex flex-col">
        <TabsList className="w-fit">
          <TabsTrigger value="kanban">Kanban Board</TabsTrigger>
          <TabsTrigger value="list">Lista (Tabela)</TabsTrigger>
        </TabsList>
        <TabsContent
          value="kanban"
          className="flex-1 mt-4 data-[state=active]:flex flex-col min-h-0"
        >
          <KanbanBoard />
        </TabsContent>
        <TabsContent value="list" className="mt-4">
          <div className="bg-white border rounded-lg p-8 text-center text-muted-foreground">
            Visualização em lista em desenvolvimento. Use o Kanban.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
