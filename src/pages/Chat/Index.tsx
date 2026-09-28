import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import {
  sendWhatsAppMessage,
  editWhatsAppMessage,
  deleteWhatsAppMessage,
} from '@/services/whatsapp'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
  Clock,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  WhatsAppTemplateSelector,
  type SelectedTemplate,
} from '@/components/whatsapp-template-selector'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { MessageMenu } from './MessageMenu'

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
  last_inbound_at?: string | null
}

interface Message {
  id: string
  content: string
  direction: string
  created_at: string
  contact_id: string
  status?: string | null
  client_id?: string | null
  is_edited?: boolean | null
  whatsapp_key?: any
  user_id?: string
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
  const [instanceStatus, setInstanceStatus] = useState<'online' | 'offline' | 'checking'>(
    'checking',
  )

  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  const [editingText, setEditingText] = useState('')
  const [deletingMessage, setDeletingMessage] = useState<Message | null>(null)

  const [primaryProvider, setPrimaryProvider] = useState<'official' | 'evolution'>('evolution')
  const [isWindowOpen, setIsWindowOpen] = useState(true)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<SelectedTemplate | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const selectedContactRef = useRef<Contact | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    selectedContactRef.current = selectedContact
  }, [selectedContact])

  useEffect(() => {
    if (!user) return
    loadAllTags()
    loadContacts()

    let connChannel: any = null
    const checkConnection = async () => {
      const { data: integration } = await supabase
        .from('user_integrations')
        .select('whatsapp_connected, whatsapp_instance_id, primary_provider')
        .eq('user_id', user.id)
        .maybeSingle()

      if (integration) {
        setInstanceStatus(integration.whatsapp_connected ? 'online' : 'offline')
        if (integration.primary_provider) {
          setPrimaryProvider(integration.primary_provider as 'official' | 'evolution')
        }

        if (integration.whatsapp_instance_id) {
          const { data: latestEvent } = await supabase
            .from('whatsapp_events')
            .select('message')
            .eq('instance', integration.whatsapp_instance_id)
            .eq('message_type', 'connection.update')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (latestEvent && latestEvent.message) {
            const state =
              (latestEvent.message as any)?.data?.state || (latestEvent.message as any)?.state
            if (state === 'open') setInstanceStatus('online')
            else if (state === 'close') setInstanceStatus('offline')
          }

          connChannel = supabase
            .channel('chat_conn_status')
            .on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'whatsapp_events',
                filter: `instance=eq.${integration.whatsapp_instance_id}`,
              },
              (payload) => {
                const newEvent = payload.new as any
                if (
                  newEvent.message_type === 'connection.update' ||
                  newEvent.message_type === 'connection_update'
                ) {
                  const state = newEvent.message?.data?.state || newEvent.message?.state
                  if (state === 'open') setInstanceStatus('online')
                  else if (state === 'close') setInstanceStatus('offline')
                }
              },
            )
            .subscribe()
        }
      }
    }
    checkConnection()

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
              setSelectedContact((prev) =>
                prev ? { ...prev, last_inbound_at: newMsg.created_at } : prev,
              )
            }
          } else if (newMsg.direction === 'inbound') {
            toast.info('Nova mensagem recebida!', {
              description: newMsg.content.substring(0, 50) + '...',
            })
          }

          setContacts((prev) => {
            const exists = prev.find((c) => c.id === newMsg.contact_id)
            const isCurrentlySelected = selectedContactRef.current?.id === newMsg.contact_id

            if (!exists) {
              // Async fetch for new contact, avoid blocking the sync state update
              supabase
                .from('contacts')
                .select(`*, contact_tag_relations(contact_tags(id, name, color))`)
                .eq('id', newMsg.contact_id)
                .single()
                .then(({ data }) => {
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
                          new Date(b.updatedAt || 0).getTime() -
                          new Date(a.updatedAt || 0).getTime(),
                      )
                    })
                  }
                })
              return prev
            }

            const updated = prev.map((c) =>
              c.id === newMsg.contact_id
                ? {
                    ...c,
                    lastMessage: newMsg.content,
                    updatedAt: newMsg.created_at,
                    last_inbound_at:
                      newMsg.direction === 'inbound' ? newMsg.created_at : c.last_inbound_at,
                    hasUnread:
                      newMsg.direction === 'inbound' && !isCurrentlySelected ? true : c.hasUnread,
                  }
                : c,
            )

            return updated.sort((a, b) => {
              const timeA = a.updatedAt
                ? new Date(a.updatedAt).getTime()
                : new Date((a as any).created_at || 0).getTime()
              const timeB = b.updatedAt
                ? new Date(b.updatedAt).getTime()
                : new Date((b as any).created_at || 0).getTime()
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
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const deletedMsg = payload.old as { id: string }
          setMessages((prev) => prev.filter((m) => m.id !== deletedMsg.id))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (connChannel) supabase.removeChannel(connChannel)
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
    if (primaryProvider !== 'official' || !selectedContact) {
      setIsWindowOpen(true)
      return
    }
    if (!selectedContact.last_inbound_at) {
      setIsWindowOpen(false)
      return
    }
    const lastInbound = new Date(selectedContact.last_inbound_at)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    setIsWindowOpen(lastInbound > twentyFourHoursAgo)
  }, [selectedContact, primaryProvider])

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
    if (!user) return
    const { data } = await supabase
      .from('contact_tags')
      .select('*')
      .eq('user_id', user.id)
      .order('name')
    if (data) setAllTags(data)
  }

  const loadContacts = async () => {
    if (!user) return
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
        .eq('user_id', user.id)
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
            last_inbound_at: c.last_inbound_at,
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
          last_inbound_at: null as string | null,
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

  const handleEdit = async () => {
    if (!user || !editingMessage) return
    if (!editingText.trim() || editingText === editingMessage.content) {
      setEditingMessage(null)
      return
    }

    const newText = editingText.trim()
    const msgId = editingMessage.id
    const whatsappKey = editingMessage.whatsapp_key

    try {
      if (whatsappKey) {
        await editWhatsAppMessage(msgId, newText, whatsappKey)
      } else {
        await supabase
          .from('messages')
          .update({ content: newText, is_edited: true })
          .eq('id', msgId)
          .eq('user_id', user.id)
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, content: newText, is_edited: true } : m)),
      )
      toast.success('Mensagem editada com sucesso')
    } catch (error: any) {
      toast.error('Erro ao editar: ' + (error.message || 'Falha na comunicação com o servidor.'))
    } finally {
      setEditingMessage(null)
      setEditingText('')
    }
  }

  const handleDelete = async () => {
    if (!user || !deletingMessage || !selectedContact) return
    const msgId = deletingMessage.id
    const whatsappKey = deletingMessage.whatsapp_key

    try {
      if (whatsappKey) {
        await deleteWhatsAppMessage(msgId, whatsappKey)
      } else {
        await supabase.from('messages').delete().eq('id', msgId).eq('user_id', user.id)
      }

      setMessages((prev) => prev.filter((m) => m.id !== msgId))
      toast.success('Mensagem apagada com sucesso')
    } catch (error: any) {
      toast.error('Erro ao excluir: ' + (error.message || 'Falha na comunicação com o servidor.'))
    } finally {
      setDeletingMessage(null)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedContact || !user) return
    if (primaryProvider === 'official' && !isWindowOpen) return

    const content = newMessage.trim()
    setNewMessage('')
    if (textareaRef.current) {
      textareaRef.current.style.height = ''
    }
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
        client_id: null,
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

      const response: any = await sendWhatsAppMessage(
        selectedContact.phone,
        content,
        actualMessageId,
        { contactId: selectedContact.id },
      )

      let clientId = null
      let whatsappKey = null
      if (response?.wamid) {
        clientId = response.wamid
      }
      if (response && response.evolutionResponse) {
        const ev = response.evolutionResponse
        clientId =
          clientId ||
          ev?.key?.id ||
          ev?.message?.key?.id ||
          ev?.messageId ||
          ev?.id ||
          ev?.data?.key?.id
        whatsappKey = ev?.key || ev?.message?.key || ev?.data?.key
      }

      const updatePayload: any = { status: 'delivered' }
      if (clientId) updatePayload.client_id = clientId
      if (whatsappKey) updatePayload.whatsapp_key = whatsappKey

      await supabase.from('messages').update(updatePayload).eq('id', actualMessageId)

      setMessages((prev) =>
        prev.map((m) =>
          m.id === actualMessageId
            ? { ...m, status: 'delivered', client_id: clientId, whatsapp_key: whatsappKey }
            : m,
        ),
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

  const handleSendTemplate = async () => {
    if (!selectedContact || !user || !selectedTemplate) return
    setSending(true)

    const templateContent = `[Template: ${selectedTemplate.name}]`
    const tempId = `temp-${Date.now()}`

    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        content: templateContent,
        direction: 'outbound',
        created_at: new Date().toISOString(),
        contact_id: selectedContact.id,
        status: 'sending',
        client_id: null,
      },
    ])

    let actualTemplateId = tempId

    try {
      const { data: dbMsg } = await supabase
        .from('messages')
        .insert({
          user_id: user.id,
          contact_id: selectedContact.id,
          content: templateContent,
          direction: 'outbound',
          status: 'sending',
        })
        .select()
        .single()

      if (dbMsg) {
        actualTemplateId = dbMsg.id
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, id: actualTemplateId } : m)),
        )
      }

      const response: any = await sendWhatsAppMessage(
        selectedContact.phone,
        templateContent,
        actualTemplateId,
        {
          isTemplate: true,
          templateName: selectedTemplate.name,
          templateLanguage: selectedTemplate.language,
          parameterFormat: selectedTemplate.parameter_format,
          parameters: selectedTemplate.parameters?.map((p) => ({
            type: 'text',
            text: p.value,
            parameter_name: p.name,
          })),
          contactId: selectedContact.id,
        },
      )

      let clientId = null
      if (response?.wamid) clientId = response.wamid
      if (response?.evolutionResponse) {
        const ev = response.evolutionResponse
        clientId =
          clientId ||
          ev?.key?.id ||
          ev?.message?.key?.id ||
          ev?.messageId ||
          ev?.id ||
          ev?.data?.key?.id
      }

      const updatePayload: any = { status: 'delivered' }
      if (clientId) updatePayload.client_id = clientId

      if (actualTemplateId !== tempId) {
        await supabase.from('messages').update(updatePayload).eq('id', actualTemplateId)
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === actualTemplateId ? { ...m, status: 'delivered', client_id: clientId } : m,
        ),
      )

      setTemplateDialogOpen(false)
      setSelectedTemplate(null)
      toast.success('Template enviado com sucesso!')
    } catch (error: any) {
      toast.error('Erro ao enviar template: ' + error.message)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId || m.id === actualTemplateId ? { ...m, status: 'error' } : m,
        ),
      )
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
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-lg">Conversas</h2>
              <div
                className={`w-2 h-2 rounded-full ${instanceStatus === 'online' ? 'bg-green-500' : instanceStatus === 'checking' ? 'bg-yellow-500' : 'bg-red-500'}`}
                title={instanceStatus === 'online' ? 'WhatsApp Conectado' : 'WhatsApp Desconectado'}
              />
            </div>
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
              {messages
                .filter((m) => m.status !== 'deleted')
                .map((msg) => {
                  const isOutbound = msg.direction === 'outbound'
                  const isError = msg.status === 'error'
                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex relative group',
                        isOutbound ? 'justify-end' : 'justify-start',
                      )}
                    >
                      <MessageMenu
                        message={msg}
                        currentUserId={user.id}
                        onEdit={(m) => {
                          setEditingMessage(m)
                          setEditingText(m.content || '')
                        }}
                        onDelete={(m) => setDeletingMessage(m)}
                      />
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
                          {msg.is_edited && !isError && (
                            <span className="mr-1 italic opacity-70">(editado)</span>
                          )}
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
              {messages.filter((m) => m.status !== 'deleted').length === 0 && (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  O histórico de mensagens está vazio.
                </div>
              )}
            </div>

            <div className="p-3 bg-card border-t space-y-2">
              {primaryProvider === 'official' && (
                <div className="flex items-center gap-2">
                  {isWindowOpen ? (
                    <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs">
                      <Clock className="w-3 h-3 mr-1" /> Janela ativa
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="w-3 h-3 mr-1" /> Janela de 24h fechada
                    </Badge>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTemplateDialogOpen(true)}
                    className="ml-auto h-7 text-xs"
                  >
                    <FileText className="w-3 h-3 mr-1" /> Enviar Template
                  </Button>
                </div>
              )}
              {primaryProvider === 'official' && !isWindowOpen && (
                <p className="text-xs text-destructive text-center">
                  A janela de 24h está fechada. Envie um template para iniciar a conversa.
                </p>
              )}
              <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                {primaryProvider === 'official' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="rounded-full shrink-0 h-10 w-10 text-muted-foreground hover:text-foreground mb-0.5"
                    onClick={() => setTemplateDialogOpen(true)}
                    title="Enviar Template"
                  >
                    <FileText className="h-5 w-5" />
                  </Button>
                )}
                <Textarea
                  ref={textareaRef}
                  placeholder={
                    primaryProvider === 'official' && !isWindowOpen
                      ? 'Janela de 24h fechada. Use um template.'
                      : 'Digite sua mensagem...'
                  }
                  value={newMessage}
                  onChange={(e) => {
                    setNewMessage(e.target.value)
                    e.target.style.height = ''
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (newMessage.trim()) {
                        handleSendMessage(e)
                      }
                    }
                  }}
                  disabled={sending || (primaryProvider === 'official' && !isWindowOpen)}
                  className="flex-1 min-h-[40px] max-h-[120px] rounded-2xl bg-muted/50 border-transparent focus-visible:ring-0 focus-visible:bg-background px-4 py-2 sm:py-2.5 resize-none overflow-y-auto"
                  rows={1}
                />
                <Button
                  type="submit"
                  disabled={
                    !newMessage.trim() ||
                    sending ||
                    (primaryProvider === 'official' && !isWindowOpen)
                  }
                  size="icon"
                  className="rounded-full shrink-0 h-10 w-10 shadow-sm mb-0.5"
                >
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

      <Dialog open={!!editingMessage} onOpenChange={(open) => !open && setEditingMessage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Mensagem</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              className="min-h-[100px] resize-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleEdit()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMessage(null)}>
              Cancelar
            </Button>
            <Button onClick={handleEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <AlertDialog
        open={!!deletingMessage}
        onOpenChange={(open) => !open && setDeletingMessage(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar mensagem</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente apagar esta mensagem para todos? Esta ação não pode ser desfeita e a
              mensagem será removida do WhatsApp do destinatário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Apagar para todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar Template</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <WhatsAppTemplateSelector
              userId={user?.id}
              enabled={true}
              onTemplateChange={setSelectedTemplate}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSendTemplate} disabled={!selectedTemplate || sending}>
              {sending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Enviar Template
            </Button>
          </DialogFooter>
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
