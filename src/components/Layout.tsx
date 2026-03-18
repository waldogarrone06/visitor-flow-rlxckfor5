import { Outlet, Link } from 'react-router-dom'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from './layout/AppSidebar'
import { TopHeader } from './layout/TopHeader'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { Login } from './auth/Login'

export default function Layout() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-muted-foreground font-medium">Carregando aplicação...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

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
