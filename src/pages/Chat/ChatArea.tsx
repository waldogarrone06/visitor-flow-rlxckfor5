import { useState, useRef, useEffect, useMemo } from 'react'
import { useMainStore } from '@/stores/main'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Send, Check, CheckCheck, ArrowLeft, User, Paperclip, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Link } from 'react-router-dom'

export function ChatArea({ leadId, onBack }: { leadId: string; onBack: () => void }) {
  const { state, dispatch } = useMainStore()
  const [text, setText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const lead = useMemo(() => state.leads.find((l) => l.id === leadId), [state.leads, leadId])
  const messages = useMemo(
    () =>
      state.messages
        .filter((m) => m.leadId === leadId)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [state.messages, leadId],
  )

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!lead) return null

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    dispatch({
      type: 'SEND_MESSAGE',
      payload: {
        id: `m-${Date.now()}`,
        leadId,
        text: text.trim(),
        sender: 'me',
        timestamp: new Date().toISOString(),
        status: 'sent',
      },
    })
    setText('')
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
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
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
                  msg.sender === 'me' ? 'text-primary-foreground/70' : 'text-muted-foreground',
                )}
              >
                {format(new Date(msg.timestamp), 'HH:mm')}
                {msg.sender === 'me' && (
                  <span
                    className={cn(
                      msg.status === 'read' ? 'text-[#34B7F1]' : 'text-primary-foreground/60',
                      'ml-0.5 flex items-center',
                    )}
                  >
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
