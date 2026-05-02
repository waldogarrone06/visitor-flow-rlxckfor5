import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
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
  Plus,
  Tag as TagIcon,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ContactTag {
  id: string
  name: string
  color: string
}

interface Contact {
  id: string
  name: string
  phone: string
  lastMessage?: string
  updatedAt?: string
  tags?: ContactTag[]
  hasUnread?: boolean
}

interface Message {
  id: string
  content: string
  direction: string
  created_at: string
  contact_id: string
  status?: string | null
}

const PRESET_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#0284c7',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
]

export default function ChatPage() {
  const { user } = useAuth()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [allTags, setAllTags] = useState<ContactTag[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFilterTag, setSelectedFilterTag] = useState<string | null>(null)

  const [newContactOpen, setNewContactOpen] = useState(false)
  const [newContactName, setNewContactName] = useState('')
  const [newContactPhone, setNewContactPhone] = useState('')
  const [creatingContact, setCreatingContact] = useState(false)

  const [manageTagsOpen, setManageTagsOpen] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0])
  const [creatingTag, setCreatingTag] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const selectedContactRef = useRef<Contact | null>(null)

  useEffect(() => {
    selectedContactRef.current = selectedContact
  }, [selectedContact])

  useEffect(() => {
    if (!user) return
    loadAllTags()
    loadContacts()

    const channel = supabase
      .channel('messages_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const newMsg = payload.new as Message

          if (selectedContactRef.current && newMsg.contact_id === selectedContactRef.current.id) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev
              return [...prev, newMsg]
            })
            if (newMsg.direction === 'inbound') {
              supabase.from('messages').update({ status: 'read' }).eq('id', newMsg.id).then()
            }
          }

          setContacts((prev) => {
            const exists = prev.find((c) => c.id === newMsg.contact_id)
            const isCurrentlySelected = selectedContactRef.current?.id === newMsg.contact_id

            if (!exists) {
              setTimeout(async () => {
                const { data } = await supabase
                  .from('contacts')
                  .select(`*, contact_tag_relations(contact_tags(id, name, color))`)
                  .eq('id', newMsg.contact_id)
                  .single()

                if (data) {
                  const tags = (data.contact_tag_relations || [])
                    .map((r: any) => r.contact_tags)
                    .filter(Boolean)

                  setContacts((curr) => {
                    if (curr.some((c) => c.id === data.id)) return curr
                    return [
                      {
                        ...data,
                        tags,
                        lastMessage: newMsg.content,
                        updatedAt: newMsg.created_at,
                        hasUnread: newMsg.direction === 'inbound' && !isCurrentlySelected,
                      },
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

            const updated = prev.map((c) =>
              c.id === newMsg.contact_id
                ? {
                    ...c,
                    lastMessage: newMsg.content,
                    updatedAt: newMsg.created_at,
                    hasUnread:
                      newMsg.direction === 'inbound' && !isCurrentlySelected ? true : c.hasUnread,
                  }
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
  }, [selectedContact?.id])

  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      }, 50)
    }
  }, [messages])

  const loadAllTags = async () => {
    const { data } = await supabase.from('contact_tags').select('*').order('name')
    if (data) setAllTags(data)
  }

  const loadContacts = async () => {
    setLoading(true)
    try {
      const { data: contactsData, error } = await supabase
        .from('contacts')
        .select(`
          *,
          messages (
            content,
            created_at,
            direction,
            status
          ),
          contact_tag_relations (
            contact_tags (
              id,
              name,
              color
            )
          )
        `)
        .order('created_at', { foreignTable: 'messages', ascending: false })
        .limit(1, { foreignTable: 'messages' })
        .order('created_at', { ascending: false })

      if (!error && contactsData) {
        const formatted = contactsData.map((c: any) => {
          const msgs = c.messages || []
          const lastMsg = msgs[0]
          const hasUnread = lastMsg?.direction === 'inbound' && lastMsg?.status !== 'read'

          const tags = (c.contact_tag_relations || [])
            .map((r: any) => r.contact_tags)
            .filter(Boolean)

          return {
            id: c.id,
            name: c.name,
            phone: c.phone,
            created_at: c.created_at,
            lastMessage: lastMsg?.content,
            updatedAt: lastMsg?.created_at || c.created_at,
            tags,
            hasUnread,
          }
        })

        formatted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        setContacts(formatted)

        if (selectedContactRef.current) {
          const current = formatted.find((f) => f.id === selectedContactRef.current?.id)
          if (current) setSelectedContact(current)
        }
      }
    } catch (e) {
      console.error('Erro ao carregar contatos', e)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (contactId: string, msgs: Message[]) => {
    const unreadIds = msgs
      .filter((m) => m.direction === 'inbound' && m.status !== 'read')
      .map((m) => m.id)

    if (unreadIds.length > 0) {
      await supabase.from('messages').update({ status: 'read' }).in('id', unreadIds)
      setMessages((prev) =>
        prev.map((m) => (unreadIds.includes(m.id) ? { ...m, status: 'read' } : m)),
      )
      setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, hasUnread: false } : c)))
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
      markAsRead(contactId, data)
    }
  }

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newContactName.trim() || !newContactPhone.trim() || !user) return

    setCreatingContact(true)
    try {
      let phone = newContactPhone.replace(/\D/g, '')
      if (phone.length === 10 || phone.length === 11) {
        phone = '55' + phone
      }

      const { data: existing } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.id)
        .eq('phone', phone)
        .maybeSingle()

      let finalContact = existing

      if (!existing) {
        const { data: newContact, error } = await supabase
          .from('contacts')
          .insert({
            user_id: user.id,
            name: newContactName,
            phone,
          })
          .select()
          .single()

        if (error) throw error
        finalContact = newContact
      }

      if (finalContact) {
        const newFormattedContact = {
          id: finalContact.id,
          name: finalContact.name,
          phone: finalContact.phone,
          created_at: finalContact.created_at,
          updatedAt: finalContact.created_at,
          tags: [],
          hasUnread: false,
        }

        setContacts((prev) => {
          if (prev.some((c) => c.id === finalContact.id)) return prev
          return [newFormattedContact, ...prev]
        })

        setSelectedContact(newFormattedContact)
        setNewContactOpen(false)
        setNewContactName('')
        setNewContactPhone('')
        toast.success('Contato pronto para conversar!')
      }
    } catch (error: any) {
      toast.error('Erro ao criar contato: ' + error.message)
    } finally {
      setCreatingContact(false)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedContact || !user) return

    const content = newMessage.trim()
    setNewMessage('')
    setSending(true)

    const tempId = `temp-${Date.now()}`

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

      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: actualMessageId } : m)))

      const response: any = await sendWhatsAppMessage(selectedContact.phone, content)

      let clientId = null
      if (response && response.evolutionResponse) {
        const ev = response.evolutionResponse
        clientId =
          ev?.key?.id || ev?.message?.key?.id || ev?.messageId || ev?.id || ev?.data?.key?.id
      }

      const updatePayload: any = { status: 'delivered' }
      if (clientId) updatePayload.client_id = clientId

      await supabase.from('messages').update(updatePayload).eq('id', actualMessageId)

      setMessages((prev) =>
        prev.map((m) => (m.id === actualMessageId ? { ...m, status: 'delivered' } : m)),
      )
    } catch (error: any) {
      console.error('Falha ao enviar mensagem:', error)

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

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTagName.trim() || !user) return
    setCreatingTag(true)
    try {
      const { data, error } = await supabase
        .from('contact_tags')
        .insert({
          user_id: user.id,
          name: newTagName.trim(),
          color: newTagColor,
        })
        .select()
        .single()

      if (error) throw error
      if (data) {
        setAllTags((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
        setNewTagName('')

        if (selectedContact) {
          await toggleContactTag(data, true)
        }
        toast.success('Tag criada com sucesso!')
      }
    } catch (error: any) {
      toast.error('Erro ao criar tag: ' + error.message)
    } finally {
      setCreatingTag(false)
    }
  }

  const handleDeleteTag = async (tagId: string) => {
    if (
      !confirm('Tem certeza que deseja excluir esta tag? Ela será removida de todos os contatos.')
    )
      return
    try {
      await supabase.from('contact_tags').delete().eq('id', tagId)
      setAllTags((prev) => prev.filter((t) => t.id !== tagId))

      const updateTags = (tags: ContactTag[] | undefined) => tags?.filter((t) => t.id !== tagId)

      setContacts((prev) => prev.map((c) => ({ ...c, tags: updateTags(c.tags) })))
      if (selectedContact) {
        setSelectedContact((prev) => (prev ? { ...prev, tags: updateTags(prev.tags) } : null))
      }
      if (selectedFilterTag === tagId) setSelectedFilterTag(null)
      toast.success('Tag removida com sucesso.')
    } catch (error: any) {
      toast.error('Erro ao excluir tag: ' + error.message)
    }
  }

  const toggleContactTag = async (tag: ContactTag, forceAdd?: boolean) => {
    if (!selectedContact) return
    const hasTag = selectedContact.tags?.some((t) => t.id === tag.id)

    try {
      if (hasTag && !forceAdd) {
        await supabase
          .from('contact_tag_relations')
          .delete()
          .eq('contact_id', selectedContact.id)
          .eq('tag_id', tag.id)

        const newTags = selectedContact.tags!.filter((t) => t.id !== tag.id)
        updateContactTagsLocally(selectedContact.id, newTags)
      } else if (!hasTag) {
        await supabase
          .from('contact_tag_relations')
          .insert({ contact_id: selectedContact.id, tag_id: tag.id })

        const newTags = [...(selectedContact.tags || []), tag]
        updateContactTagsLocally(selectedContact.id, newTags)
      }
    } catch (error: any) {
      toast.error('Erro ao atualizar tag do contato')
    }
  }

  const updateContactTagsLocally = (contactId: string, tags: ContactTag[]) => {
    setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, tags } : c)))
    setSelectedContact((prev) => (prev?.id === contactId ? { ...prev, tags } : prev))
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
    if (selectedFilterTag && !contact.tags?.some((t) => t.id === selectedFilterTag)) {
      return false
    }

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
        <div className="p-4 border-b bg-background space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg flex items-center gap-2">Conversas</h2>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setNewContactOpen(true)}
              title="Nova Conversa"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar contato ou conversa..."
              className="pl-9 bg-muted/50 border-transparent focus-visible:bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {allTags.length > 0 && (
            <ScrollArea className="w-full whitespace-nowrap pb-1">
              <div className="flex gap-1.5">
                <Badge
                  variant={selectedFilterTag === null ? 'default' : 'secondary'}
                  onClick={() => setSelectedFilterTag(null)}
                  className="cursor-pointer font-normal hover:bg-primary/90"
                >
                  Todos
                </Badge>
                {allTags.map((tag) => (
                  <Badge
                    key={tag.id}
                    style={{
                      backgroundColor: selectedFilterTag === tag.id ? tag.color : 'transparent',
                      borderColor: tag.color,
                      color: selectedFilterTag === tag.id ? '#fff' : tag.color,
                    }}
                    onClick={() =>
                      setSelectedFilterTag(selectedFilterTag === tag.id ? null : tag.id)
                    }
                    className="cursor-pointer font-normal"
                    variant="outline"
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
              <ScrollBar orientation="horizontal" className="h-1.5" />
            </ScrollArea>
          )}
        </div>
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {searchQuery || selectedFilterTag
                ? 'Nenhum contato encontrado para a busca ou tag selecionada.'
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
                    <div
                      className={`font-medium truncate flex items-center gap-2 ${contact.hasUnread ? 'font-bold text-foreground' : ''}`}
                    >
                      <span className="truncate">{contact.name || contact.phone}</span>
                      {contact.hasUnread && (
                        <div className="w-2 h-2 rounded-full bg-destructive flex-shrink-0" />
                      )}
                    </div>

                    {contact.tags && contact.tags.length > 0 && (
                      <div className="flex gap-1 mt-0.5 mb-1 overflow-hidden items-center">
                        {contact.tags.slice(0, 3).map((t) => (
                          <div
                            key={t.id}
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: t.color }}
                            title={t.name}
                          />
                        ))}
                        {contact.tags.length > 3 && (
                          <span className="text-[10px] text-muted-foreground ml-1">
                            +{contact.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    <div
                      className={`text-xs truncate ${contact.hasUnread ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
                    >
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
            <div className="p-4 border-b bg-background flex items-center justify-between shadow-sm z-10">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div className="overflow-hidden">
                  <h3 className="font-semibold truncate">{selectedContact.name}</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs text-muted-foreground">{selectedContact.phone}</p>

                    {selectedContact.tags && selectedContact.tags.length > 0 && (
                      <div className="flex gap-1 items-center border-l pl-2">
                        {selectedContact.tags.map((t) => (
                          <Badge
                            key={t.id}
                            variant="outline"
                            className="text-[10px] px-1 h-4 font-normal whitespace-nowrap"
                            style={{ borderColor: t.color, color: t.color }}
                          >
                            {t.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setManageTagsOpen(true)}
                className="flex-shrink-0 ml-2"
              >
                <TagIcon className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">Tags</span>
              </Button>
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
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-4 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <User className="w-8 h-8 opacity-50" />
            </div>
            <p className="text-sm">Selecione um contato na lateral para iniciar a conversa</p>
          </div>
        )}
      </div>

      <Dialog open={newContactOpen} onOpenChange={setNewContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Conversa</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateContact} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Nome do Contato</Label>
              <Input
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                placeholder="Ex: João Silva"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone (WhatsApp)</Label>
              <Input
                value={newContactPhone}
                onChange={(e) => setNewContactPhone(e.target.value)}
                placeholder="Ex: 11999999999"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewContactOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creatingContact}>
                {creatingContact && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Iniciar Conversa
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={manageTagsOpen} onOpenChange={setManageTagsOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Gerenciar Tags: {selectedContact?.name}</DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6 my-2 pb-4">
              <div className="space-y-3">
                <Label>Tags do Contato</Label>
                <div className="flex flex-wrap gap-2 p-4 bg-muted/30 rounded-lg min-h-[4rem] border border-border/50">
                  {allTags.length === 0 ? (
                    <span className="text-sm text-muted-foreground italic w-full text-center py-2">
                      Nenhuma tag cadastrada no sistema.
                    </span>
                  ) : (
                    allTags.map((tag) => {
                      const isSelected = selectedContact?.tags?.some((t) => t.id === tag.id)
                      return (
                        <Badge
                          key={tag.id}
                          style={{
                            backgroundColor: isSelected ? tag.color : 'transparent',
                            borderColor: tag.color,
                            color: isSelected ? '#fff' : tag.color,
                          }}
                          onClick={() => toggleContactTag(tag)}
                          className="cursor-pointer hover:opacity-80 transition-all flex items-center gap-1 py-1"
                          variant={isSelected ? 'default' : 'outline'}
                        >
                          {tag.name}
                          {isSelected && <Check className="w-3 h-3 ml-1" />}
                        </Badge>
                      )
                    })
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground text-center">
                  Clique numa tag acima para adicionar ou remover do contato atual.
                </p>
              </div>

              <div className="border-t pt-4">
                <Label className="text-base font-medium">Criar Nova Tag</Label>
                <form onSubmit={handleCreateTag} className="flex flex-col gap-4 mt-3">
                  <div className="flex gap-3">
                    <Input
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="Nome da tag (ex: VIP, Retorno)..."
                      className="flex-1"
                      maxLength={20}
                    />
                    <div className="w-10 h-10 rounded-md border flex-shrink-0 overflow-hidden relative">
                      <input
                        type="color"
                        value={newTagColor}
                        onChange={(e) => setNewTagColor(e.target.value)}
                        className="absolute -inset-2 w-16 h-16 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap bg-muted/30 p-2 rounded-lg justify-center">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={cn(
                          'w-5 h-5 rounded-full transition-transform hover:scale-110',
                          newTagColor === color
                            ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
                            : 'opacity-80',
                        )}
                        style={{ backgroundColor: color }}
                        onClick={() => setNewTagColor(color)}
                        title={color}
                      />
                    ))}
                  </div>

                  <Button
                    type="submit"
                    disabled={!newTagName.trim() || creatingTag}
                    className="w-full"
                  >
                    {creatingTag ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    Criar e Atribuir ao Contato
                  </Button>
                </form>
              </div>

              {allTags.length > 0 && (
                <div className="border-t pt-4">
                  <Label className="text-sm font-medium mb-3 block">
                    Gerenciar Tags do Sistema
                  </Label>
                  <div className="space-y-1 bg-muted/20 p-2 rounded-lg border border-border/50">
                    {allTags.map((tag) => (
                      <div
                        key={tag.id}
                        className="flex items-center justify-between group p-2 hover:bg-muted/50 rounded-md transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-4 h-4 rounded-full shadow-sm"
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="text-sm font-medium">{tag.name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteTag(tag.id)}
                          title="Excluir tag do sistema"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
