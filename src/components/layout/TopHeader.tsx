import { Search, Bell } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { SidebarTrigger } from '@/components/ui/sidebar'

export function TopHeader() {
  return (
    <header className="h-16 flex items-center justify-between px-4 sm:px-6 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
      <div className="flex items-center gap-4 flex-1">
        <SidebarTrigger className="md:hidden" />
        <div className="relative max-w-md w-full hidden sm:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar contatos ou kits..."
            className="pl-9 bg-muted/50 border-none focus-visible:ring-1"
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="absolute top-2 right-2 h-2 w-2 bg-destructive rounded-full" />
        </Button>
        <div className="flex items-center gap-2 border-l border-border/50 pl-4">
          <Avatar className="h-8 w-8 ring-1 ring-border">
            <AvatarImage
              src="https://img.usecurling.com/ppl/thumbnail?gender=female&seed=12"
              alt="Vendor"
            />
            <AvatarFallback>AV</AvatarFallback>
          </Avatar>
          <div className="hidden sm:flex flex-col text-sm">
            <span className="font-medium leading-none">Ana Vendedora</span>
            <span className="text-xs text-muted-foreground">Vendas Externas</span>
          </div>
        </div>
      </div>
    </header>
  )
}
