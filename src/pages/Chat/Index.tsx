import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Send, User, Loader2, Image as ImageIcon, FileText, Mic } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'

interface Contact {
  id: string
  name: string
  phone: string
  lastMessage?: string
  updatedAt?: string
}

interface Message {
  id: string
  content: string
  direction: string
  created_at: string
  contact_id: string
  status?: string | null
}

export default function ChatPage() {
  const { user } = useAuth()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) return
    loadContacts()

    // Configura inscrição em tempo real para otimizar atualizações no DOM
    const channel = supabase
      .channel('messages_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const newMsg = payload.new as Message

          // Adiciona a mensagem dinamicamente
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev

            // Só exibe no painel principal se for do contato selecionado
            if (selectedContact && newMsg.contact_id !== selectedContact.id) {
              return prev
            }
            return [...prev, newMsg]
          })

          // Atualiza a sidebar com a última mensagem imediatamente
          setContacts((prev) =>
            prev
              .map((c) =>
                c.id === newMsg.contact_id
                  ? { ...c, lastMessage: newMsg.content, updatedAt: newMsg.created_at }
                  : c,
              )
              .sort(
                (a, b) =>
                  new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime(),
              ),
          )
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, selectedContact])

  useEffect(() => {
    if (selectedContact) {
      loadMessages(selectedContact.id)
    } else {
      setMessages([])
    }
  }, [selectedContact])

  useEffect(() => {
    // Auto scroll otimizado
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const loadContacts = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false })

      if (!error && data) {
        setContacts(data)
      }
    } catch (e) {
      console.error('Erro ao carregar contatos', e)
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async (contactId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true })

    if (!error && data) {
      setMessages(data)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedContact || !user) return

    const content = newMessage.trim()
    setNewMessage('')
    setSending(true)

    // Optimistic Update: Adiciona mensagem instantaneamente na UI
    const tempId = `temp-${Date.now()}`
    const optimisticMsg: Message = {
      id: tempId,
      content,
      direction: 'outbound',
      created_at: new Date().toISOString(),
      contact_id: selectedContact.id,
      status: 'sending',
    }
    setMessages((prev) => [...prev, optimisticMsg])

    try {
      // Chamada ao Edge Function para despachar mensagem na VPS do listener
      const res = await supabase.functions.invoke('whatsapp-send', {
        body: { to: selectedContact.phone, text: content },
      })

      if (res.error) throw new Error(res.error.message || 'Falha na comunicação com a API')

      // Grava no banco e substitui a mensagem otimista via real-time (ou re-load silencioso)
      await supabase.from('messages').insert({
        user_id: user.id,
        contact_id: selectedContact.id,
        content,
        direction: 'outbound',
        status: 'delivered',
      })

      // Remove temp message as the real-time subscription will push the real one
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
    } catch (error) {
      console.error('Falha ao enviar mensagem:', error)
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      toast.error('Falha ao enviar mensagem. Tente novamente.')
    } finally {
      setSending(false)
    }
  }

  // Renderizador Dinâmico para mídias ou formatos anômalos
  const renderMessageContent = (content: string) => {
    if (!content) return <span className="italic text-muted-foreground">[vazio]</span>

    if (
      content.includes('[Mídia]') ||
      content.includes('[Imagem]') ||
      content.includes('[Vídeo]')
    ) {
      return (
        <span className="flex items-center gap-2 italic">
          <ImageIcon className="w-4 h-4" /> Mídia recebida
        </span>
      )
    }
    if (content.includes('[Áudio]')) {
      return (
        <span className="flex items-center gap-2 italic">
          <Mic className="w-4 h-4" /> Áudio recebido
        </span>
      )
    }
    if (content.includes('[Documento]')) {
      return (
        <span className="flex items-center gap-2 italic">
          <FileText className="w-4 h-4" /> Documento recebido
        </span>
      )
    }

    // Fallback para exibir qualquer outro tipo de conteúdo sem quebrar o render
    return <span className="whitespace-pre-wrap break-words">{content}</span>
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] border rounded-lg overflow-hidden bg-background shadow-sm">
      {/* Sidebar */}
      <div className="w-80 border-r flex flex-col bg-muted/20">
        <div className="p-4 border-b bg-background">
          <h2 className="font-semibold text-lg flex items-center gap-2">Conversas</h2>
        </div>
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhum contato encontrado. Mensagens recebidas aparecerão aqui.
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border/50">
              {contacts.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => setSelectedContact(contact)}
                  className={`flex items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50 ${selectedContact?.id === contact.id ? 'bg-muted' : ''}`}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="font-medium truncate">{contact.name || contact.phone}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {contact.lastMessage
                        ? renderMessageContent(contact.lastMessage)
                        : 'Nova conversa'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-muted/5 relative">
        {selectedContact ? (
          <>
            <div className="p-4 border-b bg-background flex items-center gap-3 shadow-sm z-10">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">{selectedContact.name}</h3>
                <p className="text-xs text-muted-foreground">{selectedContact.phone}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef as any}>
              {messages.map((msg) => {
                const isOutbound = msg.direction === 'outbound'
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2 shadow-sm ${
                        isOutbound
                          ? 'bg-primary text-primary-foreground rounded-br-sm'
                          : 'bg-background border rounded-bl-sm'
                      } ${msg.status === 'sending' ? 'opacity-70' : ''}`}
                    >
                      <div className="text-sm">{renderMessageContent(msg.content)}</div>
                      <div
                        className={`text-[10px] mt-1 flex items-center gap-1 ${isOutbound ? 'justify-end text-primary-foreground/70' : 'justify-start text-muted-foreground'}`}
                      >
                        {format(new Date(msg.created_at), 'HH:mm')}
                        {msg.status === 'sending' && <Loader2 className="w-3 h-3 animate-spin" />}
                      </div>
                    </div>
                  </div>
                )
              })}
              {messages.length === 0 && (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  O histórico de mensagens está vazio.
                </div>
              )}
            </div>

            <div className="p-4 bg-background border-t">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                  placeholder="Digite sua mensagem..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  disabled={sending}
                  className="flex-1"
                />
                <Button type="submit" disabled={!newMessage.trim() || sending} size="icon">
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <User className="w-8 h-8 opacity-50" />
            </div>
            <p className="text-sm">Selecione um contato na lateral para iniciar a conversa</p>
          </div>
        )}
      </div>
    </div>
  )
}
