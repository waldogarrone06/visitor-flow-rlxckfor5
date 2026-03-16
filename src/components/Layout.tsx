import { Outlet } from 'react-router-dom'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from './layout/AppSidebar'
import { TopHeader } from './layout/TopHeader'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Layout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-slate-50">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TopHeader />
          <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 animate-fade-in">
            <div className="mx-auto max-w-7xl w-full">
              <Outlet />
            </div>
          </div>
          <Link to="/agendamento" className="md:hidden fixed bottom-6 right-6 z-50">
            <Button size="icon" className="h-14 w-14 rounded-full shadow-elevation">
              <Plus className="h-6 w-6" />
            </Button>
          </Link>
        </main>
      </div>
    </SidebarProvider>
  )
}
