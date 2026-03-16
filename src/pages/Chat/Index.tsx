import { useSearchParams, Link } from 'react-router-dom'
import { useMainStore } from '@/stores/main'
import { ChatSidebar } from './ChatSidebar'
import { ChatArea } from './ChatArea'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MessageCircle, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function ChatPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedContactId = searchParams.get('contactId')
  const { state } = useMainStore()

  if (!state.settings?.whatsappConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100dvh-140px)] animate-fade-in space-y-4">
        <div className="p-6 bg-green-50 rounded-full text-green-600 mb-4">
          <MessageCircle className="h-12 w-12" />
        </div>
        <h2 className="text-2xl font-bold">WhatsApp Não Conectado</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Para utilizar o chat integrado, é necessário conectar a sua conta do WhatsApp nas
          configurações da plataforma.
        </p>
        <Link to="/config">
          <Button size="lg" className="mt-4">
            <Settings className="mr-2 h-4 w-4" /> Ir para Configurações
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="h-[calc(100dvh-120px)] sm:h-[calc(100dvh-140px)] min-h-[500px] flex gap-4 animate-slide-up pb-2">
      <Card
        className={cn(
          'flex-1 overflow-hidden flex flex-col shadow-subtle border-border/50',
          selectedContactId ? 'hidden md:flex md:max-w-xs lg:max-w-sm' : 'flex',
        )}
      >
        <div className="p-4 border-b">
          <h2 className="font-semibold text-lg">Mensagens</h2>
        </div>
        <ChatSidebar
          selectedId={selectedContactId}
          onSelect={(id) => setSearchParams({ contactId: id })}
        />
      </Card>

      {selectedContactId ? (
        <Card
          className={cn(
            'flex-1 overflow-hidden flex flex-col shadow-subtle border-border/50',
            !selectedContactId && 'hidden md:flex',
          )}
        >
          <ChatArea leadId={selectedContactId} onBack={() => setSearchParams({})} />
        </Card>
      ) : (
        <Card className="hidden md:flex flex-1 items-center justify-center flex-col text-muted-foreground shadow-subtle border-border/50 bg-slate-50/50">
          <div className="h-20 w-20 rounded-full bg-white border flex items-center justify-center mb-6 shadow-sm">
            <MessageCircle className="h-10 w-10 opacity-30" />
          </div>
          <p className="font-medium text-lg text-foreground/80">Nenhuma conversa selecionada</p>
          <p className="text-sm mt-1">Selecione um contato na lista para iniciar o atendimento.</p>
        </Card>
      )}
    </div>
  )
}
