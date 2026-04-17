import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { ScrollArea } from '@/components/ui/scroll-area'
import { sendWhatsAppMessage } from '@/services/whatsapp'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Send,
  User,
  Loader2,
  Image as ImageIcon,
  FileText,
  Mic,
  AlertCircle,
  Check,
  CheckCheck,
  Search,
} from 'lucide-react'
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
  const [searchQuery, setSearchQuery] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const selectedContactRef = useRef<Contact | null>(null)

  useEffect(() => {
    selectedContactRef.current = selectedContact
  }, [selectedContact])

  useEffect(() => {
    if (!user) return
    loadContacts()

    const channel = supabase
      .channel('messages_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `user_id=eq.${user.id}` },
        (payload) => {
          console.log('🟢 Nova mensagem recebida via Realtime no ChatPage:', payload.new)
          const newMsg = payload.new as Message

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            if (selectedContactRef.current && newMsg.contact_id !== selectedContactRef.current.id) {
              return prev
            }
            return [...prev, newMsg]
          })

          setContacts((prev) => {
            const exists = prev.find((c) => c.id === newMsg.contact_id)
            if (!exists) {
              // Buscar novo contato assincronamente sem mutar estado diretamente aqui
              setTimeout(async () => {
                const { data } = await supabase
                  .from('contacts')
                  .select('*')
                  .eq('id', newMsg.contact_id)
                  .single()

                if (data) {
                  setContacts((curr) => {
                    if (curr.some((c) => c.id === data.id)) return curr
                    return [
                      { ...data, lastMessage: newMsg.content, updatedAt: newMsg.created_at },
                      ...curr,
                    ].sort(
                      (a, b) =>
                        new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime(),
                    )
                  })
                }
              }, 100)
              return prev
            }

            // Contato já existe, apenas move para o topo e atualiza a última mensagem
            const updated = prev.map((c) =>
              c.id === newMsg.contact_id
                ? { ...c, lastMessage: newMsg.content, updatedAt: newMsg.created_at }
                : c,
            )

            return updated.sort((a, b) => {
              const timeA = a.updatedAt
                ? new Date(a.updatedAt).getTime()
                : new Date(a.created_at || 0).getTime()
              const timeB = b.updatedAt
                ? new Date(b.updatedAt).getTime()
                : new Date(b.created_at || 0).getTime()
              return timeB - timeA
            })
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const updatedMsg = payload.new as Message
          setMessages((prev) => prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m)))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  useEffect(() => {
    if (selectedContact) {
      loadMessages(selectedContact.id)
    } else {
      setMessages([])
    }
  }, [selectedContact])

  useEffect(() => {
    if (scrollRef.current) {
      // Pequeno timeout para garantir que a UI atualizou antes do scroll
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      }, 50)
    }
  }, [messages])

  const loadContacts = async () => {
    setLoading(true)
    try {
      const { data: contactsData, error } = await supabase
        .from('contacts')
        .select(`
          *,
          messages (
            content,
            created_at
          )
        `)
        .order('created_at', { foreignTable: 'messages', ascending: false })
        .limit(1, { foreignTable: 'messages' })
        .order('created_at', { ascending: false })

      if (!error && contactsData) {
        const formatted = contactsData.map((c: any) => {
          const msgs = c.messages || []
          const lastMsg = msgs[0]
          return {
            id: c.id,
            name: c.name,
            phone: c.phone,
            created_at: c.created_at,
            lastMessage: lastMsg?.content,
            updatedAt: lastMsg?.created_at || c.created_at,
          }
        })

        formatted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        setContacts(formatted)
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

    const tempId = `temp-${Date.now()}`

    // 1. Optimistic UI update (aparece imediatamente na tela)
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        content,
        direction: 'outbound',
        created_at: new Date().toISOString(),
        contact_id: selectedContact.id,
        status: 'sending',
      },
    ])

    let actualMessageId = tempId

    try {
      // 2. Persistir localmente PRIMEIRO, garantindo que o histórico nunca seja perdido
      const { data: dbMsg, error: dbError } = await supabase
        .from('messages')
        .insert({
          user_id: user.id,
          contact_id: selectedContact.id,
          content,
          direction: 'outbound',
          status: 'sending',
        })
        .select()
        .single()

      if (dbError) throw new Error('Erro ao salvar no banco de dados local.')
      actualMessageId = dbMsg.id

      // Atualiza a UI para o ID real retornado pelo banco
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: actualMessageId } : m)))

      // 3. Dispara a chamada assíncrona para a VPS rodando a Evolution API
      const response: any = await sendWhatsAppMessage(selectedContact.phone, content)

      let clientId = null
      if (response && response.evolutionResponse) {
        const ev = response.evolutionResponse
        // Tenta extrair o ID da mensagem retornado pela API para salvar na tabela
        clientId =
          ev?.key?.id || ev?.message?.key?.id || ev?.messageId || ev?.id || ev?.data?.key?.id
      }

      // 4. Sucesso: atualiza o status final para entregue e registra o clientId se disponível
      const updatePayload: any = { status: 'delivered' }
      if (clientId) updatePayload.client_id = clientId

      await supabase.from('messages').update(updatePayload).eq('id', actualMessageId)

      setMessages((prev) =>
        prev.map((m) => (m.id === actualMessageId ? { ...m, status: 'delivered' } : m)),
      )
    } catch (error: any) {
      console.error('Falha ao enviar mensagem:', error)

      // 5. Tratamento de Erro Visual - não deleta a mensagem, apenas marca como Erro
      if (actualMessageId && !actualMessageId.startsWith('temp-')) {
        await supabase.from('messages').update({ status: 'error' }).eq('id', actualMessageId)
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === actualMessageId || m.id === tempId ? { ...m, status: 'error' } : m,
        ),
      )
      toast.error(error.message || 'Falha ao enviar mensagem. Tente novamente.')
    } finally {
      setSending(false)
    }
  }

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

    return <span className="whitespace-pre-wrap break-words">{content}</span>
  }

  const filteredContacts = contacts.filter((contact) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    const normalize = (str: string | null | undefined) =>
      (str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()

    return (
      normalize(contact.name).includes(normalize(q)) ||
      (contact.phone && contact.phone.includes(q)) ||
      (contact.lastMessage && normalize(contact.lastMessage).includes(normalize(q)))
    )
  })

  return (
    <div className="flex h-[calc(100vh-6rem)] border rounded-lg overflow-hidden bg-background shadow-sm">
      <div className="w-80 border-r flex flex-col bg-muted/20">
        <div className="p-4 border-b bg-background space-y-4">
          <h2 className="font-semibold text-lg flex items-center gap-2">Conversas</h2>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar contato ou conversa..."
              className="pl-9 bg-muted/50 border-transparent focus-visible:bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {searchQuery
                ? 'Nenhum contato encontrado para a busca.'
                : 'Nenhum contato encontrado. Mensagens recebidas aparecerão aqui.'}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border/50">
              {filteredContacts.map((contact) => (
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
                const isError = msg.status === 'error'
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2 shadow-sm ${
                        isOutbound
                          ? isError
                            ? 'bg-destructive text-destructive-foreground rounded-br-sm'
                            : 'bg-primary text-primary-foreground rounded-br-sm'
                          : 'bg-background border rounded-bl-sm'
                      } ${msg.status === 'sending' ? 'opacity-70' : ''}`}
                    >
                      <div className="text-sm">{renderMessageContent(msg.content)}</div>
                      <div
                        className={`text-[10px] mt-1 flex items-center gap-1 ${isOutbound ? 'justify-end text-primary-foreground/70' : 'justify-start text-muted-foreground'}`}
                      >
                        {format(new Date(msg.created_at), 'HH:mm')}
                        {msg.status === 'sending' && <Loader2 className="w-3 h-3 animate-spin" />}
                        {isOutbound && msg.status === 'sent' && <Check className="w-3 h-3" />}
                        {isOutbound &&
                          (msg.status === 'delivered' ||
                            msg.status === 'read' ||
                            msg.status === 'played') && (
                            <CheckCheck
                              className={`w-3 h-3 ${msg.status === 'read' || msg.status === 'played' ? 'text-[#34B7F1]' : ''}`}
                            />
                          )}
                        {isError && (
                          <span className="flex items-center text-destructive-foreground font-medium ml-1">
                            <AlertCircle className="w-3 h-3 mr-0.5" />
                            Erro
                          </span>
                        )}
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
