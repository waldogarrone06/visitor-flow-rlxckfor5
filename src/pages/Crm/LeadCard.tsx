import { useState, useEffect } from 'react'
import { useMainStore } from '@/stores/main'
import { Lead } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import {
  X,
  Tag as TagIcon,
  MoreHorizontal,
  MapPin,
  Ticket,
  Video,
  Copy,
  Mail,
  Smartphone,
  Trash2,
} from 'lucide-react'
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { syncCalendarService } from '@/features/syncCalendarService'

export function LeadCard({
  lead,
  onDragStart,
}: {
  lead: Lead
  onDragStart: (e: React.DragEvent, id: string) => void
}) {
  const { state, dispatch } = useMainStore()
  const kit = lead.assignedKitId ? state.kits.find((k) => k.id === lead.assignedKitId) : null
  const [dbApp, setDbApp] = useState<any>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const fetchApp = async () => {
      const { data } = await supabase
        .from('appointments')
        .select(
          'id, google_meet_link, status, client_name, client_phone, client_email, appointment_date, start_time, kit_name, patient_coupon, nutritionist_coupon',
        )
        .eq('client_name', lead.name)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data) setDbApp(data)
    }
    fetchApp()

    const channel = supabase
      .channel(`lead-app-${lead.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `client_name=eq.${lead.name}`,
        },
        (payload) => {
          setDbApp(payload.new)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [lead.name, lead.id])

  const generateLink = async () => {
    if (!dbApp?.id) {
      toast.error('Agendamento não encontrado.')
      return
    }
    setIsSyncing(true)
    try {
      const result = await syncCalendarService.syncCreate(dbApp.id)

      if (!result.success) {
        throw new Error(result.error || 'Falha ao gerar link. Tente novamente.')
      }

      toast.success('Link do Meet gerado com sucesso!')

      if (import.meta.env.DEV) {
        console.log('[LeadCard] Link gerado com sucesso:', result.data)
      }

      await new Promise((resolve) => setTimeout(resolve, 500))
    } catch (err: any) {
      console.error('[LeadCard] Erro ao gerar link:', err)
      toast.error(err.message || 'Falha ao gerar link. Tente novamente.')
    } finally {
      setIsSyncing(false)
    }
  }

  const resendLink = async (method: 'whatsapp' | 'email') => {
    if (!dbApp?.id) return
    setIsResending(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado')

      const { data: integration, error: intErr } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (intErr || !integration) throw new Error('Configuração de integração não encontrada')

      const { data: app, error: appErr } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', dbApp.id)
        .single()

      if (appErr || !app) throw new Error('Agendamento não encontrado')

      const replaceVars = (template: string) => {
        let msg = template || ''
        msg = msg.replace(/\{\{nome_cliente\}\}/g, app.client_name || '')
        msg = msg.replace(
          /\{\{data\}\}/g,
          app.appointment_date ? app.appointment_date.split('-').reverse().join('/') : '',
        )
        msg = msg.replace(/\{\{hora\}\}/g, app.start_time || '')
        msg = msg.replace(/\{\{meet_link\}\}/g, app.google_meet_link || '')
        return msg
      }

      const messageTemplate = `Olá, {{nome_cliente}}! 👋

Sua visita online com a equipe Fourlab está confirmada e o link da reunião já está pronto.

📅 Data: {{data}}
🕐 Horário: {{hora}}

🔗 Acesse pelo link abaixo:
{{meet_link}}

Nossa visitadora já estará na sala aguardando você no horário marcado. Basta clicar no link e solicitar entrada — ela liberará seu acesso em instantes.

Até logo! 😊
*Equipe Fourlab*`

      const finalMsg = replaceVars(messageTemplate)

      if (method === 'whatsapp') {
        if (!app.client_phone) throw new Error('Cliente não possui telefone cadastrado')

        const { error } = await supabase.functions.invoke('whatsapp-send', {
          body: {
            to: app.client_phone,
            text: finalMsg,
            userId: user.id,
          },
        })
        if (error) throw error
        toast.success('Link enviado via WhatsApp!')
      } else {
        if (!app.client_email) throw new Error('Cliente não possui e-mail cadastrado')

        const { error } = await supabase.functions.invoke('send-email', {
          body: {
            to: app.client_email,
            subject: 'Sua visita online está pronta - Fourlab',
            html: `<div style="font-family: sans-serif; padding: 20px; color: #333;"><p>${finalMsg.replace(/\n/g, '<br/>')}</p></div>`,
            senderName: 'Atendimento',
            userId: user.id,
            meetLink: app.google_meet_link,
          },
        })
        if (error) throw error
        toast.success('Link enviado via E-mail!')
      }
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Falha ao reenviar link')
    } finally {
      setIsResending(false)
    }
  }

  const handleDelete = async () => {
    try {
      setIsDeleting(true)
      const { error } = await supabase.from('appointments').delete().eq('id', lead.id)
      if (error) throw error
      toast.success('Agendamento apagado com sucesso!')
      dispatch({ type: 'REMOVE_LEAD', payload: lead.id })
    } catch (err: any) {
      console.error(err)
      toast.error('Falha ao apagar agendamento.')
    } finally {
      setIsDeleting(false)
    }
  }

  const locationStr = lead.state
    ? `${lead.neighborhood ? lead.neighborhood + ', ' : ''}${lead.state}`
    : lead.neighborhood || (lead.type === 'B2B' ? lead.company : 'Consumidor')

  return (
    <Card
      draggable
      onDragStart={(e) => onDragStart(e, lead.id)}
      className={`cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow border-border/60 ${isDeleting ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <CardContent className="p-3">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={`https://img.usecurling.com/ppl/thumbnail?gender=female&seed=${lead.avatarSeed || 1}`}
              />
              <AvatarFallback>{lead.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium leading-none truncate w-[140px]">{lead.name}</p>
              <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span className="truncate w-[120px]">{locationStr}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="sr-only">Apagar</span>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Apagar Agendamento</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja apagar este agendamento? Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
                    Cancelar
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete()
                    }}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Apagar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-6 w-6 p-0 -mr-1 ml-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="sr-only">Ações</span>
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem
                  onClick={() =>
                    dispatch({
                      type: 'ADD_TAG',
                      payload: { id: lead.id, tag: 'Revisitar 30 dias' },
                    })
                  }
                >
                  <TagIcon className="mr-2 h-4 w-4" /> Revisitar 30 dias
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    dispatch({
                      type: 'ADD_TAG',
                      payload: { id: lead.id, tag: 'Revisitar 90 dias' },
                    })
                  }
                >
                  <TagIcon className="mr-2 h-4 w-4" /> Revisitar 90 dias
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <div className="text-xs text-muted-foreground flex justify-between items-center w-full">
            <span>{format(new Date(lead.lastInteraction), 'dd/MM/yyyy')}</span>
            <div className="flex gap-1 items-center">
              <span
                className="font-mono text-[9px] uppercase bg-muted px-1.5 py-0.5 rounded-sm border"
                title="Código de Confirmação"
              >
                ID: {(lead as any).confirmationCode || lead.id.split('-')[0]}
              </span>
              <Badge variant="outline" className="text-[10px] px-1 h-4">
                {lead.score} ⭐
              </Badge>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {dbApp?.google_meet_link ? (
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-xs bg-teal-50 text-teal-700 hover:bg-teal-100 hover:text-teal-800 border-teal-200 flex items-center justify-center gap-1.5 shadow-none truncate px-2"
                  onClick={(e) => {
                    e.stopPropagation()
                    window.open(dbApp.google_meet_link, '_blank')
                  }}
                  title="Acessar Reunião"
                >
                  <Video className="h-3 w-3 shrink-0" />
                  <span className="truncate">Meet</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-7 h-7 p-0 shrink-0 border-teal-200 text-teal-700 hover:bg-teal-100 shadow-none"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigator.clipboard.writeText(dbApp.google_meet_link)
                    toast.success('Link copiado!')
                  }}
                  title="Copiar Link"
                >
                  <Copy className="h-3 w-3" />
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isResending}
                      className="w-7 h-7 p-0 shrink-0 border-teal-200 text-teal-700 hover:bg-teal-100 shadow-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={async (e) => {
                        e.stopPropagation()
                        await resendLink('whatsapp')
                      }}
                    >
                      <Smartphone className="mr-2 h-4 w-4" /> Enviar WhatsApp
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={async (e) => {
                        e.stopPropagation()
                        await resendLink('email')
                      }}
                    >
                      <Mail className="mr-2 h-4 w-4" /> Enviar E-mail
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (dbApp || (lead as any).isOnline) && !dbApp?.google_meet_link ? (
              <Button
                variant="outline"
                size="sm"
                disabled={isSyncing}
                className="w-full h-7 text-xs bg-slate-50 text-slate-700 border-slate-200 flex items-center justify-center gap-1.5 shadow-none"
                onClick={(e) => {
                  e.stopPropagation()
                  generateLink()
                }}
              >
                <Video className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {isSyncing ? 'Sincronizando...' : 'Gerar Link do Meet'}
                </span>
              </Button>
            ) : null}

            {dbApp?.patient_coupon ||
            dbApp?.nutritionist_coupon ||
            lead.patientCoupon ||
            lead.nutritionistCoupon ? (
              <div className="flex flex-col gap-1">
                {(dbApp?.patient_coupon || lead.patientCoupon) && (
                  <Badge
                    variant="outline"
                    className="w-fit text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 pointer-events-none gap-1"
                  >
                    <Ticket className="h-3 w-3" />
                    Paciente (10%): {dbApp?.patient_coupon || lead.patientCoupon}
                  </Badge>
                )}
                {(dbApp?.nutritionist_coupon || lead.nutritionistCoupon) && (
                  <Badge
                    variant="outline"
                    className="w-fit text-[10px] bg-purple-50 text-purple-700 border-purple-200 pointer-events-none gap-1"
                  >
                    <Ticket className="h-3 w-3" />
                    Pessoal (30%): {dbApp?.nutritionist_coupon || lead.nutritionistCoupon}
                  </Badge>
                )}
              </div>
            ) : lead.couponCode ? (
              <Badge
                variant="outline"
                className="w-fit text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 pointer-events-none gap-1"
              >
                <Ticket className="h-3 w-3" />
                Cupom: {lead.couponCode} ({lead.couponUsage || 0})
              </Badge>
            ) : null}

            {(kit || dbApp?.kit_name) && (
              <Badge
                variant="secondary"
                className="w-fit text-[10px] bg-primary/10 text-primary hover:bg-primary/20 pointer-events-none"
              >
                Kit: {dbApp?.kit_name || kit?.name}
              </Badge>
            )}

            {lead.tags && lead.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {lead.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-[10px] bg-orange-50 text-orange-700 border-orange-200 gap-1 pr-1 pointer-events-none"
                  >
                    {tag}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        dispatch({ type: 'REMOVE_TAG', payload: { id: lead.id, tag } })
                      }}
                      className="hover:bg-orange-200 hover:text-orange-900 rounded-full p-0.5 ml-0.5 pointer-events-auto cursor-pointer transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
