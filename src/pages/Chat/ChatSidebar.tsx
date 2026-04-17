import { useMainStore } from '@/stores/main'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Search } from 'lucide-react'
import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

export function ChatSidebar({
  selectedId,
  onSelect,
}: {
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { state } = useMainStore()
  const [search, setSearch] = useState('')

  const contacts = useMemo(() => {
    let list = state.leads.map((lead) => {
      const messages = state.messages.filter((m) => m.leadId === lead.id)
      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null
      return { lead, lastMessage }
    })

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((c) => {
        const matchLead =
          c.lead.name.toLowerCase().includes(q) ||
          (c.lead.company && c.lead.company.toLowerCase().includes(q)) ||
          (c.lead.phone && c.lead.phone.includes(q))

        const matchMessages = state.messages
          .filter((m) => m.leadId === c.lead.id)
          .some((m) => m.text.toLowerCase().includes(q))

        return matchLead || matchMessages
      })
    }

    return list.sort((a, b) => {
      if (!a.lastMessage) return 1
      if (!b.lastMessage) return -1
      return (
        new Date(b.lastMessage.timestamp).getTime() - new Date(a.lastMessage.timestamp).getTime()
      )
    })
  }, [state.leads, state.messages, search])

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden">
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar contato ou conversa..."
            className="pl-9 bg-muted/50 border-transparent focus-visible:bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Nenhum contato encontrado.
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {contacts.map(({ lead, lastMessage }) => (
              <button
                key={lead.id}
                onClick={() => onSelect(lead.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-4 text-left hover:bg-muted/60 transition-colors',
                  selectedId === lead.id && 'bg-muted',
                )}
              >
                <Avatar>
                  <AvatarImage
                    src={`https://img.usecurling.com/ppl/thumbnail?seed=${lead.avatarSeed || 1}`}
                  />
                  <AvatarFallback>{lead.name.substring(0, 2)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <h3 className="font-medium text-sm truncate pr-2">{lead.name}</h3>
                    {lastMessage && (
                      <span className="text-[10px] text-muted-foreground shrink-0 font-medium">
                        {format(new Date(lastMessage.timestamp), 'HH:mm')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {lastMessage ? lastMessage.text : 'Iniciar conversa...'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
