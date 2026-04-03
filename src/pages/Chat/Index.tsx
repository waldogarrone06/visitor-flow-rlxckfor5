import { useState, useEffect, useRef } from 'react'
import { Plus, Send, User, Search, Phone, Loader2 } from 'lucide-react'
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
import { toast } from '@/hooks/use-toast'
import { getContacts, createContact, getMessages, saveMessage } from '@/services/contacts'
import { sendWhatsAppMessage } from '@/services/whatsapp'
import { cn } from '@/lib/utils'

export default function ChatPage() {
  const [contacts, setContacts] = useState<any[]>([])
  const [selectedContact, setSelectedContact] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [search, setSearch] = useState('')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingContacts, setLoadingContacts] = useState(true)

  const [newContact, setNewContact] = useState({ name: '', phone: '' })
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadContacts()
  }, [])

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
      const data = await getMessages(contactId)
      setMessages(data)
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
      const created = await createContact(newContact)
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
    if (!newMessage.trim() || !selectedContact) return

    const content = newMessage
    setNewMessage('')

    const optimisticMsg = {
      id: Math.random().toString(),
      content,
      direction: 'outbound',
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticMsg])

    try {
      await sendWhatsAppMessage(selectedContact.phone, content)
      const saved = await saveMessage(selectedContact.id, content, 'outbound')
      setMessages((prev) => prev.map((m) => (m.id === optimisticMsg.id ? saved : m)))
    } catch (e: any) {
      toast({
        title: 'Aviso de Envio',
        description: 'Mensagem salva localmente. Falha na API: ' + e.message,
      })
      const saved = await saveMessage(selectedContact.id, content, 'outbound')
      setMessages((prev) => prev.map((m) => (m.id === optimisticMsg.id ? saved : m)))
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
                    <p className="text-sm mt-1">
                      Sua mensagem será enviada via WhatsApp API própria (Session)
                    </p>
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
                    <div
                      className={cn(
                        'px-4 py-2.5 rounded-2xl text-sm shadow-sm',
                        msg.direction === 'outbound'
                          ? 'bg-primary text-primary-foreground rounded-tr-sm'
                          : 'bg-background border rounded-tl-sm',
                      )}
                    >
                      {msg.content}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1.5 px-1 font-medium">
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
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
                  disabled={!newMessage.trim()}
                >
                  <Send className="h-5 w-5" />
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
              Selecione um contato na lateral ou adicione um novo para iniciar o envio de mensagens
              via sua API de WhatsApp independente.
            </p>
          </div>
        )}
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Novo Contato</DialogTitle>
            <DialogDescription>
              Insira os dados do cliente para habilitar o envio de mensagens via WhatsApp.
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
