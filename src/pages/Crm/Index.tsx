import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Plus, Download } from 'lucide-react'
import { KanbanBoard } from './KanbanBoard'
import { LeadList } from './LeadList'
import { ImportCouponDialog } from './ImportCouponDialog'
import { UpcomingMeetingsWidget } from './UpcomingMeetingsWidget'

export default function CrmPage() {
  return (
    <div className="space-y-4 animate-slide-up h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CRM Pipeline</h1>
          <p className="text-muted-foreground">Gerencie o fluxo de seus contatos e clientes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImportCouponDialog />
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" /> Exportar
          </Button>
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" /> Novo Lead
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col xl:flex-row gap-4 min-h-0">
        <div className="w-full xl:w-[320px] flex-shrink-0 flex flex-col max-h-[350px] xl:max-h-none xl:h-full order-1 xl:order-2">
          <UpcomingMeetingsWidget />
        </div>

        <div className="flex-1 flex flex-col min-w-0 order-2 xl:order-1">
          <Tabs defaultValue="kanban" className="flex-1 flex flex-col min-h-0">
            <TabsList className="w-fit shrink-0">
              <TabsTrigger value="kanban">Kanban Board</TabsTrigger>
              <TabsTrigger value="list">Lista e Cupons</TabsTrigger>
            </TabsList>
            <TabsContent
              value="kanban"
              className="flex-1 mt-4 data-[state=active]:flex flex-col min-h-0"
            >
              <KanbanBoard />
            </TabsContent>
            <TabsContent
              value="list"
              className="mt-4 flex-1 data-[state=active]:flex flex-col min-h-0"
            >
              <LeadList />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
