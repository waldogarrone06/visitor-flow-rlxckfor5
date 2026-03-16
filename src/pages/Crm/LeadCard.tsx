import { useMainStore } from '@/stores/main'
import { Lead } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { X, Tag as TagIcon, MoreHorizontal, MapPin } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function LeadCard({
  lead,
  onDragStart,
}: {
  lead: Lead
  onDragStart: (e: React.DragEvent, id: string) => void
}) {
  const { state, dispatch } = useMainStore()
  const kit = lead.assignedKitId ? state.kits.find((k) => k.id === lead.assignedKitId) : null

  const locationStr = lead.state
    ? `${lead.neighborhood ? lead.neighborhood + ', ' : ''}${lead.state}`
    : lead.neighborhood || (lead.type === 'B2B' ? lead.company : 'Consumidor')

  return (
    <Card
      draggable
      onDragStart={(e) => onDragStart(e, lead.id)}
      className="cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow border-border/60"
    >
      <CardContent className="p-3">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={`https://img.usecurling.com/ppl/thumbnail?gender=female&seed=${lead.avatarSeed || 1}`}
              />
              <AvatarFallback>{lead.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium leading-none truncate w-[140px]">{lead.name}</p>
              <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span className="truncate w-[120px]">{locationStr}</span>
              </p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-6 w-6 p-0 -mr-1">
                <span className="sr-only">Ações</span>
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  dispatch({ type: 'ADD_TAG', payload: { id: lead.id, tag: 'Revisitar 30 dias' } })
                }
              >
                <TagIcon className="mr-2 h-4 w-4" /> Revisitar 30 dias
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  dispatch({ type: 'ADD_TAG', payload: { id: lead.id, tag: 'Revisitar 90 dias' } })
                }
              >
                <TagIcon className="mr-2 h-4 w-4" /> Revisitar 90 dias
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <div className="text-xs text-muted-foreground flex justify-between items-center w-full">
            <span>{format(new Date(lead.lastInteraction), 'dd/MM/yyyy')}</span>
            <Badge variant="outline" className="text-[10px] px-1 h-4">
              {lead.score} ⭐
            </Badge>
          </div>

          <div className="flex flex-col gap-1.5">
            {kit && (
              <Badge
                variant="secondary"
                className="w-fit text-[10px] bg-primary/10 text-primary hover:bg-primary/20 pointer-events-none"
              >
                Kit: {kit.name}
              </Badge>
            )}

            {lead.tags && lead.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {lead.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-[10px] bg-orange-50 text-orange-700 border-orange-200 gap-1 pr-1 pointer-events-none"
                  >
                    {tag}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        dispatch({ type: 'REMOVE_TAG', payload: { id: lead.id, tag } })
                      }}
                      className="hover:bg-orange-200 hover:text-orange-900 rounded-full p-0.5 ml-0.5 pointer-events-auto cursor-pointer transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
