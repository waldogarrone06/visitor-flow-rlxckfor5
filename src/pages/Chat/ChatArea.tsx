import { useState, useRef, useEffect, useMemo } from 'react'
import { useMainStore } from '@/stores/main'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Send,
  Check,
  CheckCheck,
  ArrowLeft,
  User,
  Paperclip,
  FileText,
  AlertCircle,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Link } from 'react-router-dom'
import { sendWhatsAppMessage } from '@/services/whatsapp'
import { useToast } from '@/hooks/use-toast'

export function ChatArea({ leadId, onBack }: { leadId: string; onBack: () => void }) {
  const { state, dispatch } = useMainStore()
  const { user } = useAuth()
  const { toast } = useToast()
  const [text, setText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [dbMessages, setDbMessages] = useState<any[]>([])
  const [contactId, setContactId] = useState<string | null>(null)

  const lead = useMemo(() => state.leads.find((l) => l.id === leadId), [state.leads, leadId])

  useEffect(() => {
    if (!user || !lead?.phone) return

    let isMounted = true

    let subscription: any = null

    const fetchContactAndMessages = async () => {
      console.log('🔍 [ChatArea] Buscando contato para o telefone:', lead.phone)

      const phone = lead.phone.replace(/\D/g, '')
      let cId = null

      // Busca por match exato
      const { data: exactContacts } = await supabase
        .from('contacts')
        .select('id')
        .eq('phone', phone)
        .eq('user_id', user.id)

      if (exactContacts && exactContacts.length > 0) {
        cId = exactContacts[0].id
        console.log('✅ [ChatArea] Contato encontrado (match exato):', cId)
      } else if (!phone.startsWith('55') && phone.length >= 10) {
        // Busca com prefixo 55
        const { data: contacts55 } = await supabase
          .from('contacts')
          .select('id')
          .eq('phone', '55' + phone)
          .eq('user_id', user.id)
        if (contacts55 && contacts55.length > 0) {
          cId = contacts55[0].id
          console.log('✅ [ChatArea] Contato encontrado (com prefixo 55):', cId)
        }
      } else if (phone.startsWith('55') && phone.length >= 12) {
        // Busca sem prefixo 55
        const { data: contactsNo55 } = await supabase
          .from('contacts')
          .select('id')
          .eq('phone', phone.substring(2))
          .eq('user_id', user.id)
        if (contactsNo55 && contactsNo55.length > 0) {
          cId = contactsNo55[0].id
          console.log('✅ [ChatArea] Contato encontrado (sem prefixo 55):', cId)
        }
      }

      if (!cId) {
        console.log('👤 [ChatArea] Contato não encontrado. Criando novo...', phone)
        const { data: newContact, error: createErr } = await supabase
          .from('contacts')
          .insert({
            user_id: user.id,
            phone,
            name: lead.name,
          })
          .select()
          .single()
        if (newContact) {
          cId = newContact.id
          console.log('✅ [ChatArea] Novo contato criado com sucesso:', cId)
        }
        if (createErr) console.error('❌ [ChatArea] Erro ao criar contato:', createErr)
      }

      if (cId && isMounted) {
        setContactId(cId)
        console.log('📡 [ChatArea] Buscando histórico de mensagens para o contato:', cId)

        const { data: msgs, error: msgsErr } = await supabase
          .from('messages')
          .select('*')
          .eq('contact_id', cId)
          .order('created_at', { ascending: true })

        if (msgsErr) console.error('❌ [ChatArea] Erro ao buscar histórico:', msgsErr)
        if (msgs) {
          console.log(`💬 [ChatArea] ${msgs.length} mensagens carregadas do banco.`)
          setDbMessages(msgs)
        }

        console.log('🔄 [ChatArea] Assinando canal Realtime para:', `messages-${leadId}`)
        subscription = supabase
          .channel(`messages-${leadId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'messages',
              filter: `contact_id=eq.${cId}`,
            },
            (payload) => {
              console.log('🟢 [ChatArea] Nova mensagem via Realtime (INSERT):', payload.new)
              if (!isMounted) return
              setDbMessages((prev) => {
                if (prev.find((m) => m.id === payload.new.id)) return prev
                return [...prev, payload.new]
              })
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'messages',
              filter: `contact_id=eq.${cId}`,
            },
            (payload) => {
              console.log('🔄 [ChatArea] Status de mensagem via Realtime (UPDATE):', payload.new)
              if (!isMounted) return
              setDbMessages((prev) => prev.map((m) => (m.id === payload.new.id ? payload.new : m)))
            },
          )
          .subscribe((status) => {
            console.log('📡 [ChatArea] Status da assinatura Realtime:', status)
          })
      }
    }

    fetchContactAndMessages()

    return () => {
      isMounted = false
      if (subscription) {
        supabase.removeChannel(subscription)
      }
    }
  }, [user, lead?.phone, lead?.name, leadId])

  const messages = useMemo(() => {
    const storeMsgs = state.messages
      .filter((m) => m.leadId === leadId)
      .map((m) => ({
        id: m.id,
        text: m.text,
        sender: m.sender,
        timestamp: m.timestamp,
        status: m.status,
        type: m.type,
        mediaUrl: m.mediaUrl,
        mediaName: m.mediaName,
      }))

    const dbMsgs = dbMessages.map((m) => ({
      id: m.id,
      text: m.content,
      sender: m.direction === 'outbound' ? 'me' : 'them',
      timestamp: m.created_at,
      status: m.status,
      type: 'text',
    }))

    const combined = [...storeMsgs, ...dbMsgs]
    const unique = Array.from(new Map(combined.map((item) => [item.id, item])).values())
    return unique.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  }, [state.messages, dbMessages, leadId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!lead) return null

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return

    const messageText = text.trim()
    setText('')

    let newMessageId = `m-${Date.now()}`

    // 1. Persist to Supabase immediately if possible
    if (user && contactId) {
      const { data: dbMsg } = await supabase
        .from('messages')
        .insert({
          user_id: user.id,
          contact_id: contactId,
          content: messageText,
          direction: 'outbound',
          status: 'sending',
        })
        .select()
        .single()

      if (dbMsg) newMessageId = dbMsg.id
    }

    // Optimistic UI updates
    dispatch({
      type: 'SEND_MESSAGE',
      payload: {
        id: newMessageId,
        leadId,
        text: messageText,
        sender: 'me',
        timestamp: new Date().toISOString(),
        status: 'sending',
      },
    })

    setDbMessages((prev) => {
      if (prev.find((m) => m.id === newMessageId)) return prev
      return [
        ...prev,
        {
          id: newMessageId,
          user_id: user?.id,
          contact_id: contactId,
          content: messageText,
          direction: 'outbound',
          status: 'sending',
          created_at: new Date().toISOString(),
        },
      ]
    })

    try {
      if (lead?.phone) {
        const response: any = await sendWhatsAppMessage(lead.phone, messageText)
        let clientId =
          response?.evolutionResponse?.key?.id ||
          response?.evolutionResponse?.messageId ||
          response?.evolutionResponse?.id

        if (contactId) {
          const updatePayload: any = { status: 'sent' }
          if (clientId) updatePayload.client_id = clientId

          await supabase.from('messages').update(updatePayload).eq('id', newMessageId)
        }

        setDbMessages((prev) =>
          prev.map((m) => (m.id === newMessageId ? { ...m, status: 'sent' } : m)),
        )
      } else {
        throw new Error('Este contato não possui um número de telefone configurado para envio.')
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao enviar',
        description: error.message || 'Falha na comunicação com o servidor.',
        variant: 'destructive',
      })

      if (contactId) {
        await supabase.from('messages').update({ status: 'error' }).eq('id', newMessageId)
      }
      setDbMessages((prev) =>
        prev.map((m) => (m.id === newMessageId ? { ...m, status: 'error' } : m)),
      )
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const isImage = file.type.startsWith('image/')
    const type = isImage ? 'image' : 'pdf'

    const mediaUrl = isImage
      ? `https://img.usecurling.com/p/400/300?q=${encodeURIComponent(file.name.split('.')[0] || 'photo')}`
      : '#'

    dispatch({
      type: 'SEND_MESSAGE',
      payload: {
        id: `m-${Date.now()}`,
        leadId,
        text: isImage ? 'Imagem anexada' : 'Documento anexado',
        sender: 'me',
        timestamp: new Date().toISOString(),
        status: 'sent',
        type,
        mediaUrl,
        mediaName: file.name,
      },
    })

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      <div className="flex items-center gap-3 p-3 border-b bg-card">
        <Button variant="ghost" size="icon" className="md:hidden shrink-0" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Avatar>
          <AvatarImage
            src={`https://img.usecurling.com/ppl/thumbnail?seed=${lead.avatarSeed || 1}`}
          />
          <AvatarFallback>
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-sm truncate">{lead.name}</h2>
          <p className="text-xs text-muted-foreground truncate">{lead.company || lead.type}</p>
        </div>
        <Link to={`/crm/prescritor/${lead.id}`}>
          <Button variant="outline" size="sm">
            Ver Perfil
          </Button>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[url('https://img.usecurling.com/i?q=seamless-pattern&color=azure')] bg-[length:300px] bg-opacity-5">
        <div className="absolute inset-0 bg-slate-50/90 pointer-events-none -z-10" />
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            <span className="bg-background px-4 py-2 rounded-full shadow-sm border">
              Nenhuma mensagem ainda. Envie um "Olá"!
            </span>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex flex-col max-w-[85%] md:max-w-[75%]',
              msg.sender === 'me' ? 'items-end ml-auto' : 'items-start mr-auto',
            )}
          >
            <div
              className={cn(
                'px-3 sm:px-4 py-2 rounded-2xl shadow-sm relative group',
                msg.sender === 'me'
                  ? msg.status === 'error'
                    ? 'bg-destructive text-destructive-foreground rounded-br-sm'
                    : 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-white border text-foreground rounded-bl-sm',
              )}
            >
              {msg.type === 'image' && msg.mediaUrl && (
                <a
                  href={msg.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full mb-2"
                >
                  <img
                    src={msg.mediaUrl}
                    alt="attachment"
                    className="rounded-lg w-full max-w-[240px] object-cover border border-white/20"
                  />
                </a>
              )}
              {msg.type === 'pdf' && (
                <a
                  href={msg.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    'flex items-center gap-2 p-2 rounded-md mb-2 transition-colors',
                    msg.sender === 'me'
                      ? 'bg-black/10 hover:bg-black/20 text-white'
                      : 'bg-muted hover:bg-muted/80 text-foreground',
                  )}
                >
                  <FileText className="h-5 w-5 shrink-0" />
                  <span className="text-sm truncate max-w-[160px] font-medium">
                    {msg.mediaName || 'Documento.pdf'}
                  </span>
                </a>
              )}

              {(!msg.type || msg.type === 'text' || (msg.text && msg.type)) && (
                <p
                  className={cn(
                    'text-[13px] sm:text-sm break-words whitespace-pre-wrap',
                    msg.type === 'image' || msg.type === 'pdf'
                      ? 'italic opacity-80 text-xs mt-1'
                      : '',
                  )}
                >
                  {msg.text}
                </p>
              )}

              <div
                className={cn(
                  'flex items-center justify-end gap-1 mt-1 text-[10px]',
                  msg.sender === 'me'
                    ? msg.status === 'error'
                      ? 'text-destructive-foreground/90 font-medium'
                      : 'text-primary-foreground/70'
                    : 'text-muted-foreground',
                )}
              >
                {msg.status === 'error' && <AlertCircle className="h-3 w-3 mr-0.5" />}
                {msg.status === 'error'
                  ? 'Erro de envio'
                  : format(new Date(msg.timestamp), 'HH:mm')}
                {msg.sender === 'me' && msg.status !== 'error' && (
                  <span
                    className={cn(
                      msg.status === 'read' ? 'text-[#34B7F1]' : 'text-primary-foreground/60',
                      'ml-0.5 flex items-center',
                    )}
                  >
                    {msg.status === 'sending' && <Check className="h-3 w-3 opacity-50" />}
                    {msg.status === 'sent' && <Check className="h-3 w-3" />}
                    {(msg.status === 'delivered' || msg.status === 'read') && (
                      <CheckCheck className="h-3 w-3" />
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-3 bg-card border-t flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full shrink-0 h-10 w-10 text-muted-foreground hover:text-foreground"
          onClick={() => fileInputRef.current?.click()}
          title="Anexar arquivo"
        >
          <Paperclip className="h-5 w-5" />
        </Button>
        <input
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileSelect}
        />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Mensagem"
          className="flex-1 rounded-full bg-muted/50 border-transparent focus-visible:bg-background px-4"
        />
        <Button
          type="submit"
          size="icon"
          className="rounded-full shrink-0 h-10 w-10 shadow-sm"
          disabled={!text.trim()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}
