import { useState, useEffect, useRef } from 'react'
import {
  Plus,
  Send,
  User,
  Search,
  Phone,
  Loader2,
  AlertCircle,
  RefreshCw,
  Check,
  CheckCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from '@/hooks/use-toast'
import { getContacts, createContact } from '@/services/contacts'
import { sendWhatsAppMessage } from '@/services/whatsapp'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'

export default function ChatPage() {
  const { user } = useAuth()
  const [contacts, setContacts] = useState<any[]>([])
  const [selectedContact, setSelectedContact] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [search, setSearch] = useState('')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [loadingContacts, setLoadingContacts] = useState(true)

  const [newContact, setNewContact] = useState({ name: '', phone: '' })
  const scrollRef = useRef<HTMLDivElement>(null)
  const selectedContactRef = useRef<any>(null)

  useEffect(() => {
    selectedContactRef.current = selectedContact
  }, [selectedContact])

  useEffect(() => {
    if (!user) return
    loadContacts()

    // Inscreve no canal em tempo real para ouvir novas mensagens do webhook otimizado pelo user_id
    const channel = supabase
      .channel('messages_channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const newMsg = payload.new
          const currentContact = selectedContactRef.current

          if (currentContact && newMsg.contact_id === currentContact.id) {
            setMessages((prev) => {
              // Verifica se a mensagem já existe pelo client_id (otimista) ou id
              const existingIndex = prev.findIndex(
                (m) => (newMsg.client_id && m.client_id === newMsg.client_id) || m.id === newMsg.id,
              )

              if (existingIndex >= 0) {
                const newMessages = [...prev]
                newMessages[existingIndex] = { ...newMessages[existingIndex], ...newMsg }
                return newMessages
              }

              return [...prev, newMsg]
            })
          } else {
            if (newMsg.direction === 'inbound') {
              toast({
                title: 'Nova mensagem recebida',
                description: 'Verifique a lista de contatos.',
              })
            }
            // Recarrega a lista de contatos para refletir as novas mensagens no sidebar
            loadContacts()
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const updatedMsg = payload.new
          const currentContact = selectedContactRef.current
          if (currentContact && updatedMsg.contact_id === currentContact.id) {
            setMessages((prev) =>
              prev.map((m) => (m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m)),
            )
          }
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
    }
  }, [selectedContact])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const loadContacts = async () => {
    try {
      const data = await getContacts()
      setContacts(data)
    } catch (e: any) {
      toast({ title: 'Erro ao carregar contatos', description: e.message, variant: 'destructive' })
    } finally {
      setLoadingContacts(false)
    }
  }

  const loadMessages = async (contactId: string) => {
    try {
      // Busca direta pelo Supabase para carregar também status e client_id que não estavam na modelagem base
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: true })

      if (error) throw error
      setMessages(data || [])
    } catch (e: any) {
      toast({ title: 'Erro ao carregar mensagens', description: e.message, variant: 'destructive' })
    }
  }

  const handleAddContact = async () => {
    if (!newContact.name || !newContact.phone) {
      toast({ title: 'Aviso', description: 'Preencha todos os campos', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      let formattedPhone = newContact.phone.replace(/\D/g, '')
      if (formattedPhone.length === 10 || formattedPhone.length === 11) {
        formattedPhone = '55' + formattedPhone
      }
      const created = await createContact({ ...newContact, phone: formattedPhone })
      setContacts((prev) => [...prev, created])
      setIsAddOpen(false)
      setNewContact({ name: '', phone: '' })
      setSelectedContact(created)
      toast({ title: 'Sucesso', description: 'Contato adicionado com sucesso!' })
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedContact || !user || sending) return

    const content = newMessage.trim()
    setNewMessage('')
    setSending(true)

    const clientId = crypto.randomUUID()
    const optimisticMsg = {
      id: clientId,
      client_id: clientId,
      content,
      direction: 'outbound',
      created_at: new Date().toISOString(),
      status: 'sending',
    }

    setMessages((prev) => [...prev, optimisticMsg])

    try {
      const response = await sendWhatsAppMessage(selectedContact.phone, content)

      const { data: saved, error } = await supabase
        .from('messages')
        .insert({
          user_id: user.id,
          contact_id: selectedContact.id,
          content,
          direction: 'outbound',
          client_id: clientId,
          status: 'sent',
        })
        .select()
        .single()

      if (error) throw error

      setMessages((prev) => prev.map((m) => (m.client_id === clientId ? saved : m)))

      if (response?.warning) {
        toast({
          title: 'Aviso',
          description: response.warning,
          variant: 'default',
        })
      }
    } catch (e: any) {
      console.error('Erro ao enviar mensagem:', e)
      // Feedback visual de erro
      setMessages((prev) =>
        prev.map((m) =>
          m.client_id === clientId ? { ...m, status: 'error', error_msg: e.message } : m,
        ),
      )
    } finally {
      setSending(false)
    }
  }

  const handleRetry = async (msg: any) => {
    if (!user || !selectedContact) return

    setMessages((prev) =>
      prev.map((m) =>
        m.client_id === msg.client_id ? { ...m, status: 'sending', error_msg: null } : m,
      ),
    )

    try {
      await sendWhatsAppMessage(selectedContact.phone, msg.content)

      const { data: saved, error } = await supabase
        .from('messages')
        .insert({
          user_id: user.id,
          contact_id: selectedContact.id,
          content: msg.content,
          direction: 'outbound',
          client_id: msg.client_id,
          status: 'sent',
        })
        .select()
        .single()

      if (error) throw error

      setMessages((prev) => prev.map((m) => (m.client_id === msg.client_id ? saved : m)))
    } catch (e: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.client_id === msg.client_id ? { ...m, status: 'error', error_msg: e.message } : m,
        ),
      )
    }
  }

  const filteredContacts = contacts.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search),
  )

  return (
    <div className="flex h-[calc(100vh-theme(spacing.24))] bg-card border rounded-xl overflow-hidden m-6 shadow-sm">
      <div className="w-80 border-r flex flex-col bg-muted/10">
        <div className="p-4 border-b bg-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Conversas</h2>
            <Button size="icon" variant="ghost" onClick={() => setIsAddOpen(true)}>
              <Plus className="h-5 w-5" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar contatos..."
              className="pl-9 bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          {loadingContacts ? (
            <div className="p-8 flex justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center text-muted-foreground space-y-3">
              <User className="h-10 w-10 opacity-20" />
              <p className="text-sm">Nenhum contato encontrado.</p>
              <Button variant="outline" size="sm" onClick={() => setIsAddOpen(true)}>
                Adicionar Novo
              </Button>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredContacts.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => setSelectedContact(contact)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all',
                    selectedContact?.id === contact.id
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-accent transparent text-foreground',
                  )}
                >
                  <Avatar className="h-10 w-10 border bg-background">
                    <AvatarFallback className="bg-primary/5 text-primary text-sm">
                      {contact.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 overflow-hidden">
                    <p className="font-medium truncate text-sm">{contact.name}</p>
                    <p
                      className={cn(
                        'text-xs truncate',
                        selectedContact?.id === contact.id
                          ? 'text-primary/70'
                          : 'text-muted-foreground',
                      )}
                    >
                      +{contact.phone}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col bg-card">
        {selectedContact ? (
          <>
            <div className="h-16 border-b flex items-center px-6 gap-3 bg-card shadow-sm z-10">
              <Avatar className="h-10 w-10 border">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {selectedContact.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold text-sm">{selectedContact.name}</h3>
                <p className="text-xs text-muted-foreground">+{selectedContact.phone}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-muted/5" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
                  <div className="h-16 w-16 bg-background rounded-full flex items-center justify-center border shadow-sm">
                    <Phone className="h-6 w-6 text-primary/50" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-foreground">
                      Inicie uma conversa com {selectedContact.name}
                    </p>
                    <p className="text-sm mt-1">Sua mensagem será enviada via WhatsApp API</p>
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex flex-col max-w-[70%]',
                      msg.direction === 'outbound' ? 'ml-auto items-end' : 'mr-auto items-start',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {msg.direction === 'outbound' && msg.status === 'error' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-full"
                              onClick={() => handleRetry(msg)}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Falha ao enviar. Clique para tentar novamente.</p>
                            {msg.error_msg && (
                              <p className="text-xs text-muted-foreground mt-1">{msg.error_msg}</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      <div
                        className={cn(
                          'px-4 py-2.5 rounded-2xl text-sm shadow-sm relative group',
                          msg.direction === 'outbound'
                            ? msg.status === 'error'
                              ? 'bg-destructive/10 text-destructive border border-destructive/20 rounded-tr-sm'
                              : 'bg-primary text-primary-foreground rounded-tr-sm'
                            : 'bg-background border rounded-tl-sm',
                        )}
                      >
                        {msg.content}
                      </div>
                    </div>
                    <div
                      className={cn(
                        'flex items-center gap-1 mt-1.5 px-1',
                        msg.direction === 'outbound' ? 'justify-end' : 'justify-start',
                      )}
                    >
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {msg.direction === 'outbound' && (
                        <span className="text-muted-foreground ml-1">
                          {msg.status === 'sending' && <Loader2 className="h-3 w-3 animate-spin" />}
                          {msg.status === 'sent' && <Check className="h-3 w-3" />}
                          {msg.status === 'delivered' && (
                            <CheckCheck className="h-3 w-3 text-blue-500" />
                          )}
                          {msg.status === 'error' && (
                            <AlertCircle className="h-3 w-3 text-destructive" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t bg-card">
              <form onSubmit={handleSendMessage} className="flex gap-2 max-w-4xl mx-auto">
                <Input
                  placeholder="Escreva sua mensagem..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="flex-1 bg-muted/20 border-transparent focus-visible:bg-background h-12 rounded-full px-6"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-12 w-12 rounded-full shrink-0 shadow-sm"
                  disabled={!newMessage.trim() || sending}
                >
                  {sending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-muted/5">
            <div className="h-20 w-20 bg-background rounded-full flex items-center justify-center border shadow-sm mb-6">
              <Phone className="h-8 w-8 text-primary/40" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">Módulo de Mensagens</h3>
            <p className="text-sm max-w-sm text-center">
              Selecione um contato na lateral ou adicione um novo para iniciar o envio de mensagens.
            </p>
          </div>
        )}
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Novo Contato</DialogTitle>
            <DialogDescription>
              Insira os dados do cliente para habilitar o envio de mensagens.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome do Cliente</Label>
              <Input
                placeholder="Ex: João Silva"
                value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp (DDI + DDD + Número)</Label>
              <div className="flex">
                <div className="flex items-center px-3 bg-muted border border-r-0 rounded-l-md text-muted-foreground text-sm">
                  +
                </div>
                <Input
                  placeholder="5511999999999"
                  value={newContact.phone}
                  onChange={(e) =>
                    setNewContact({ ...newContact, phone: e.target.value.replace(/\D/g, '') })
                  }
                  className="rounded-l-none"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Digite apenas números, incluindo o código do país (ex: 55 para Brasil).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAddOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAddContact}
              disabled={loading || !newContact.name || !newContact.phone}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Contato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
