import { useParams, Link } from 'react-router-dom'
import { useMainStore } from '@/stores/main'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft,
  User,
  MapPin,
  Tag,
  MessageCircle,
  Paperclip,
  FileText,
  CalendarCheck,
  Video,
  Phone,
  NotebookText,
  Save,
  Sparkles,
} from 'lucide-react'
import { createYampiCouponDirect } from '@/services/yampi'
import { Badge } from '@/components/ui/badge'
import { ConversionEvolutionChart } from './ConversionEvolutionChart'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'
import { updateContactCoupons } from '@/services/contacts'

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { state } = useMainStore()
  const { toast } = useToast()

  const lead = state.leads.find((l) => l.id === id)

  const [nutritionistCoupon, setNutritionistCoupon] = useState('')
  const [patientCoupon, setPatientCoupon] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isGeneratingYampi, setIsGeneratingYampi] = useState(false)

  useEffect(() => {
    if (lead) {
      setNutritionistCoupon(lead.nutritionistCoupon || (lead as any).nutritionist_coupon || '')
      setPatientCoupon(lead.patientCoupon || (lead as any).patient_coupon || '')
    }
  }, [lead])

  const messages = state.messages
    .filter((m) => m.leadId === id)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  const interactions =
    state.interactions
      ?.filter((i) => i.leadId === id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) || []

  if (!lead) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold">Prescritor não encontrado</h2>
        <Link to="/crm">
          <Button variant="link" className="mt-4">
            Voltar ao CRM
          </Button>
        </Link>
      </div>
    )
  }

  const getInteractionIcon = (type: string) => {
    switch (type) {
      case 'Meeting':
        return <Video className="h-4 w-4" />
      case 'Visit':
        return <CalendarCheck className="h-4 w-4" />
      case 'Call':
        return <Phone className="h-4 w-4" />
      default:
        return <NotebookText className="h-4 w-4" />
    }
  }

  const getStatusColor = (status?: string) => {
    if (status === 'Presente' || status === 'Realizada')
      return 'bg-success/10 text-success border-success/30 hover:bg-success/20'
    if (status === 'Ausente' || status === 'Cancelada')
      return 'bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20'
    return 'bg-secondary text-secondary-foreground'
  }

  const handleSaveCoupons = async () => {
    if (!lead.id) return
    setIsSaving(true)
    try {
      await updateContactCoupons(lead.id, nutritionistCoupon, patientCoupon)
      toast({ title: 'Cupons atualizados com sucesso.' })
      lead.nutritionistCoupon = nutritionistCoupon
      ;(lead as any).nutritionist_coupon = nutritionistCoupon
      lead.patientCoupon = patientCoupon
      ;(lead as any).patient_coupon = patientCoupon
    } catch (error) {
      toast({ title: 'Erro ao atualizar cupons.', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const currentNutriCoupon =
    nutritionistCoupon || lead.nutritionistCoupon || (lead as any).nutritionist_coupon
  const currentPatientCoupon = patientCoupon || lead.patientCoupon || (lead as any).patient_coupon

  return (
    <div className="space-y-6 animate-slide-up pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/crm">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{lead.name}</h1>
            <p className="text-muted-foreground flex items-center gap-2 mt-1">
              {lead.company || lead.type}
              <Badge variant="outline">{lead.stage}</Badge>
            </p>
          </div>
        </div>
        <Link to={`/chat?contactId=${lead.id}`}>
          <Button className="bg-green-600 hover:bg-green-700 text-white shadow-md gap-2 w-full sm:w-auto">
            <MessageCircle className="h-4 w-4" />
            <span>WhatsApp</span>
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="coupons">Lista e Cupons</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-1 shadow-subtle h-fit">
              <CardHeader>
                <CardTitle className="text-lg">Informações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Contato</p>
                    <p className="text-sm text-muted-foreground">{lead.email || 'Sem e-mail'}</p>
                    <p className="text-sm text-muted-foreground">{lead.phone || 'Sem telefone'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Endereço</p>
                    <p className="text-sm text-muted-foreground">{lead.address}</p>
                    <p className="text-sm text-muted-foreground">
                      {lead.neighborhood} - {lead.state}
                    </p>
                  </div>
                </div>
                {(currentNutriCoupon || currentPatientCoupon || lead.couponCode) && (
                  <div className="flex items-start gap-3">
                    <Tag className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Cupons Ativos</p>
                      {currentNutriCoupon && (
                        <div className="mt-2">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                            Nutricionista
                          </p>
                          <Badge variant="secondary" className="font-mono">
                            {currentNutriCoupon}
                          </Badge>
                        </div>
                      )}
                      {currentPatientCoupon && (
                        <div className="mt-2">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                            Pacientes
                          </p>
                          <Badge variant="secondary" className="font-mono">
                            {currentPatientCoupon}
                          </Badge>
                        </div>
                      )}
                      {lead.couponCode && !currentNutriCoupon && !currentPatientCoupon && (
                        <div className="mt-2">
                          <Badge variant="secondary" className="font-mono">
                            {lead.couponCode}
                          </Badge>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-3">
                        Total de usos: {lead.couponUsage || 0}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2 shadow-subtle">
              <CardHeader>
                <CardTitle className="text-lg">Evolução de Conversões</CardTitle>
                <CardDescription>Histórico de uso do cupom ao longo dos meses.</CardDescription>
              </CardHeader>
              <CardContent>
                <ConversionEvolutionChart data={lead.conversionsHistory || []} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2 mt-6">
            <Card className="shadow-subtle">
              <CardHeader className="pb-4 border-b border-border/50 mb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <NotebookText className="h-5 w-5 text-indigo-600" />
                  Prontuário (Atendimentos)
                </CardTitle>
                <CardDescription>Histórico de visitas e reuniões exportadas.</CardDescription>
              </CardHeader>
              <CardContent>
                {interactions.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8 border rounded-md border-dashed">
                    Nenhum atendimento registrado.
                  </div>
                ) : (
                  <div className="relative border-l border-border/60 ml-3 pl-6 space-y-6">
                    {interactions.map((int) => (
                      <div key={int.id} className="relative">
                        <span className="absolute -left-[35px] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-background border border-border/60 text-muted-foreground shadow-sm">
                          {getInteractionIcon(int.type)}
                        </span>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {format(new Date(int.date), "dd/MM/yyyy 'às' HH:mm", {
                                locale: ptBR,
                              })}
                            </span>
                            {int.status && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] h-5 ${getStatusColor(int.status)}`}
                              >
                                {int.status}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{int.description}</p>
                          {int.link && (
                            <a
                              href={int.link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary hover:underline w-fit mt-1 flex items-center gap-1"
                            >
                              Ver Sala / Referência
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-subtle flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/50 mb-4">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-green-600" />
                    Histórico de WhatsApp
                  </CardTitle>
                  <CardDescription>Últimas mensagens trocadas.</CardDescription>
                </div>
                <Link to={`/chat?contactId=${lead.id}`}>
                  <Button variant="outline" size="sm" className="gap-2 shrink-0">
                    <MessageCircle className="h-4 w-4" /> Abrir Chat
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto max-h-[400px]">
                {messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8 border rounded-md border-dashed">
                    Nenhuma mensagem registrada.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.slice(-10).map((msg) => (
                      <div key={msg.id} className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {msg.sender === 'me' ? 'Você' : lead.name}
                          </span>
                          <span>•</span>
                          <span>
                            {new Date(msg.timestamp).toLocaleString('pt-BR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                          {msg.sender === 'me' && (
                            <Badge
                              variant="outline"
                              className="text-[10px] py-0 h-4 bg-muted/50 border-border/50 text-muted-foreground font-normal px-1.5"
                            >
                              {msg.status === 'read'
                                ? 'Lido'
                                : msg.status === 'delivered'
                                  ? 'Entregue'
                                  : 'Enviado'}
                            </Badge>
                          )}
                        </div>
                        <div className="p-3 bg-muted/30 border border-border/50 rounded-md text-sm">
                          {msg.type === 'image' && (
                            <div className="flex items-center gap-2 mb-2 text-blue-600">
                              <Paperclip className="h-4 w-4" />
                              <span className="text-xs font-medium">Imagem Anexada</span>
                            </div>
                          )}
                          {msg.type === 'pdf' && (
                            <div className="flex items-center gap-2 mb-2 text-red-600">
                              <FileText className="h-4 w-4" />
                              <span className="text-xs font-medium">
                                {msg.mediaName || 'Documento PDF'}
                              </span>
                            </div>
                          )}
                          {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="coupons">
          <Card className="shadow-subtle max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5 text-primary" />
                Gerenciar Cupons
              </CardTitle>
              <CardDescription>
                Defina os cupons exclusivos para o nutricionista e para seus pacientes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="nutritionistCoupon">Cupom Nutricionista</Label>
                <Input
                  id="nutritionistCoupon"
                  placeholder="Ex: NUTRI10"
                  value={nutritionistCoupon}
                  onChange={(e) =>
                    setNutritionistCoupon(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())
                  }
                  className="font-mono max-w-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Apenas letras e números. Este cupom é para uso exclusivo do profissional.
                </p>
              </div>
              <div className="space-y-3">
                <Label htmlFor="patientCoupon">Cupom Paciente</Label>
                <Input
                  id="patientCoupon"
                  placeholder="Ex: PACIENTE05"
                  value={patientCoupon}
                  onChange={(e) =>
                    setPatientCoupon(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())
                  }
                  className="font-mono max-w-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Apenas letras e números. Este cupom deve ser compartilhado com os pacientes.
                </p>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button
                  onClick={handleSaveCoupons}
                  disabled={isSaving || isGeneratingYampi}
                  className="w-full sm:w-auto gap-2"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? 'Salvando...' : 'Salvar Cupons'}
                </Button>

                <Button
                  variant="outline"
                  onClick={async () => {
                    setIsGeneratingYampi(true)
                    try {
                      // Generate both coupons on Yampi if not present
                      const baseName = lead.name || 'CLIENTE'
                      const cleanBase = baseName
                        .replace(/[^a-zA-Z0-9]/g, '')
                        .substring(0, 4)
                        .toUpperCase()
                      const rand = Math.floor(1000 + Math.random() * 9000)

                      const nutriCode = nutritionistCoupon || `NUTRI-${cleanBase}-${rand}`
                      const patientCode = patientCoupon || `PACIENTE-${cleanBase}-${rand}`

                      const [resNutri, resPatient] = await Promise.all([
                        createYampiCouponDirect({
                          userId: lead.userId || (lead as any).user_id,
                          code: nutriCode,
                          prescritor: lead.name,
                          name: lead.name,
                          lead_id: lead.id,
                          discount_type: 'p',
                          type: 'percent',
                          value: 15,
                          description: `Cupom Nutricionista (15%, 50 un) - ${lead.name}`,
                        }),
                        createYampiCouponDirect({
                          userId: lead.userId || (lead as any).user_id,
                          code: patientCode,
                          prescritor: lead.name,
                          name: lead.name,
                          lead_id: lead.id,
                          discount_type: 'p',
                          type: 'percent',
                          value: 10,
                          description: `Cupom Pacientes (10%, 50 un) - ${lead.name}`,
                        }),
                      ])

                      if (!resNutri.success && !resPatient.success) {
                        throw new Error(
                          resNutri.error || resPatient.error || 'Falha ao emitir cupons na Yampi.',
                        )
                      }

                      const finalNutri = resNutri.code || nutriCode
                      const finalPatient = resPatient.code || patientCode

                      setNutritionistCoupon(finalNutri)
                      setPatientCoupon(finalPatient)
                      await updateContactCoupons(lead.id, finalNutri, finalPatient)

                      const warnings: string[] = []
                      if (resNutri.warning) warnings.push(resNutri.warning)
                      if (resPatient.warning) warnings.push(resPatient.warning)

                      toast({
                        title: 'Cupons Emitidos na Yampi (50 un, %)',
                        description: `Nutri (15%): ${finalNutri} | Paciente (10%): ${finalPatient}${
                          warnings.length > 0 ? ` (${warnings[0]})` : ''
                        }`,
                      })
                    } catch (err: any) {
                      toast({
                        title: 'Erro ao emitir na Yampi',
                        description: err.message || 'Falha na comunicação com a API Yampi.',
                        variant: 'destructive',
                      })
                    } finally {
                      setIsGeneratingYampi(false)
                    }
                  }}
                  disabled={isSaving || isGeneratingYampi}
                  className="w-full sm:w-auto gap-2 border-primary/30 text-primary hover:bg-primary/5"
                >
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  {isGeneratingYampi ? 'Emitindo na Yampi...' : 'Gerar Cupons Automáticos (Yampi)'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
