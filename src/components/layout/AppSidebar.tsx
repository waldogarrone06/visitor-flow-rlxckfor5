import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, CalendarDays, Users, Package, Settings } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
} from '@/components/ui/sidebar'
import { FourLabLogo } from '@/components/FourLabLogo'

const menuItems = [
  { title: 'Painel', url: '/', icon: LayoutDashboard },
  { title: 'Agendamento', url: '/agendamento', icon: CalendarDays },
  { title: 'CRM', url: '/crm', icon: Users },
  { title: 'Gestão de Kits', url: '/kits', icon: Package },
  { title: 'Configurações', url: '/config', icon: Settings },
]

export function AppSidebar() {
  const location = useLocation()

  return (
    <Sidebar className="border-r border-border/50 bg-sidebar">
      <SidebarHeader className="h-16 flex items-center px-6 border-b border-border/50">
        <div className="flex items-center gap-2 font-bold text-primary text-xl overflow-hidden">
          <FourLabLogo className="h-6 w-auto shrink-0 text-foreground" />
          <span className="truncate tracking-tight text-foreground">Visitor Flow</span>
        </div>
      </SidebarHeader>
      <SidebarContent className="pt-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive =
                  location.pathname === item.url ||
                  (item.url !== '/' && location.pathname.startsWith(item.url))
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={`h-11 ${isActive ? 'text-primary border-l-4 border-primary bg-primary/10 rounded-none' : 'text-muted-foreground'}`}
                    >
                      <Link to={item.url} className="flex items-center gap-3 px-4">
                        <item.icon className="h-5 w-5" />
                        <span className="font-medium">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
