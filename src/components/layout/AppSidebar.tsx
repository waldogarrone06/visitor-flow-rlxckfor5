import { Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Package,
  Settings,
  MessageCircle,
  Activity,
} from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { FourLabLogo } from '@/components/FourLabLogo'

const menuItems = [
  { title: 'Painel', url: '/', icon: LayoutDashboard },
  { title: 'Agendamento', url: '/agendamento', icon: CalendarDays },
  { title: 'CRM', url: '/crm', icon: Users },
  { title: 'Mensagens', url: '/chat', icon: MessageCircle },
  { title: 'Gestão de Kits', url: '/kits', icon: Package },
  { title: 'Logs do WhatsApp', url: '/logs', icon: Activity },
  { title: 'Configurações', url: '/config', icon: Settings },
]

export function AppSidebar() {
  const location = useLocation()
  const { user } = useAuth()
  const [isAdminOrJunior, setIsAdminOrJunior] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (user) {
      supabase
        .from('profiles')
        .select('is_admin, name, email')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            const isJunior =
              data.name?.toLowerCase().includes('junior') ||
              data.email?.toLowerCase().includes('junior') ||
              data.name?.toLowerCase().includes('jr')
            setIsAdminOrJunior(!!data.is_admin || isJunior)
          }
        })

      const fetchUnread = () => {
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('direction', 'inbound')
          .neq('status', 'read')
          .then(({ count }) => {
            setUnreadCount(count || 0)
          })
      }

      fetchUnread()

      const channel = supabase
        .channel('sidebar_unread')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
          fetchUnread()
        })
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [user])

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
                if (item.title === 'Logs do WhatsApp' && !isAdminOrJunior) return null

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
                      <Link to={item.url} className="flex items-center gap-3 px-4 w-full">
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span className="font-medium flex-1 truncate">{item.title}</span>
                        {item.title === 'Mensagens' && unreadCount > 0 && (
                          <Badge
                            variant="destructive"
                            className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] animate-pulse shadow-sm shadow-destructive/50"
                          >
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </Badge>
                        )}
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
