import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Pencil, Trash2 } from 'lucide-react'

interface MessageMenuProps {
  message: any
  currentUserId?: string
  onEdit: (msg: any) => void
  onDelete: (msg: any) => void
}

export function MessageMenu({ message, currentUserId, onEdit, onDelete }: MessageMenuProps) {
  const isOutbound = message.direction === 'outbound' || message.sender === 'me'
  const isOwner = message.user_id === currentUserId || !message.user_id

  if (!isOutbound || !isOwner) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="absolute -left-6 top-1/2 -translate-y-1/2 p-1 text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-foreground transition-opacity">
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {message.whatsapp_key && message.status !== 'error' && (
          <DropdownMenuItem onClick={() => onEdit(message)}>
            <Pencil className="mr-2 h-4 w-4" /> Editar
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => onDelete(message)}
        >
          <Trash2 className="mr-2 h-4 w-4" /> Apagar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
