import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Trash2,
  Plus,
  Package,
  Check,
  ChevronsUpDown,
  Send,
  Loader2,
  Sparkles,
  Phone,
  Mail,
  UserCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Tag,
  RefreshCw,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { getKits, createKit, deleteKit, assignKitToPrescriber } from '@/services/kits'
import { getAllLeadsForKits, LeadOption } from '@/services/leads'
import { updateContactCoupons } from '@/services/contacts'
import { triggerDualCouponsFlow, DualCouponsResult } from '@/services/coupons-flow'
import { supabase } from '@/lib/supabase/client'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface LinkedContactData {
  id?: string
  name: string
  phone: string
  email: string
  whatsappFound: boolean
}

interface CouponStatusFeedback {
  type: 'success' | 'error' | 'existing'
  patientCode: string
  patientDiscount: number
  personalCode: string
  personalDiscount: number
  patientCreated: boolean
  personalCreated: boolean
  communicationChannel?: 'whatsapp' | 'email' | 'none'
  communicationStatus?: 'sent' | 'failed' | 'not_available' | 'already_emitted'
  recipient?: string
  message?: string
  errorMessage?: string
}

function cleanPrescriberNameForBase(rawName: string): string {
  const normalized = (rawName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .trim()

  const words = normalized.split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'NUTRI'

  const filtered = words.filter((w) => !['DRA', 'DR', 'NUTRI', 'NUTRICIONISTA'].includes(w))
  const targetWords = filtered.length > 0 ? filtered : words

  if (targetWords.length === 1) {
    return targetWords[0].substring(0, 15)
  }
  return `${targetWords[0]}${targetWords[1]}`.substring(0, 20)
}

export function KitBuilder() {
  const { user } = useAuth()
  const [leads, setLeads] = useState<LeadOption[]>([])
  const [kits, setKits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [kitName, setKitName] = useState('')
  const [kitComboOpen, setKitComboOpen] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [leadComboOpen, setLeadComboOpen] = useState(false)
  const [leadSearch, setLeadSearch] = useState('')
  const [nutriCoupon, setNutriCoupon] = useState('')
  const [patientCoupon, setPatientCoupon] = useState('')
  const [items, setItems] = useState<{ product_name: string; quantity: number }[]>([])

  // Dados vinculados do Lead / Prescritor (WhatsApp, Contato)
  const [linkedContact, setLinkedContact] = useState<LinkedContactData | null>(null)
  const [loadingContact, setLoadingContact] = useState(false)

  // Feedback visual do Yampi para os cupons criados
  const [couponsFeedback, setCouponsFeedback] = useState<CouponStatusFeedback | null>(null)

  const loadData = useCallback(async () => {
    if (!user) return
    try {
      const [leadsData, kitsData] = await Promise.all([
        getAllLeadsForKits(user.id),
        getKits(user.id, true),
      ])
      setLeads(leadsData)
      setKits(kitsData)
    } catch (err) {
      console.error('Error loading data', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Ao selecionar um Lead / Prescritor, linkar com o cadastro de contacts para obter WhatsApp e dados
  useEffect(() => {
    if (!selectedLeadId) {
      setLinkedContact(null)
      return
    }

    const lead = leads.find((l) => l.id === selectedLeadId)
    if (!lead) return

    let cancelled = false
    setLoadingContact(true)

    async function fetchLinkedContact() {
      try {
        let contactMatch: any = null

        // 1. Tentar buscar pelo client_email no contacts
        if (lead?.client_email) {
          const { data: byEmail } = await supabase
            .from('contacts')
            .select('id, name, phone, email, nutritionist_coupon, patient_coupon')
            .ilike('email', lead.client_email.trim())
            .limit(1)
            .maybeSingle()
          if (byEmail) contactMatch = byEmail
        }

        // 2. Se não achou por email e temos telefone no appointment, buscar pelo telefone
        if (!contactMatch && lead?.client_phone) {
          const rawDigits = lead.client_phone.replace(/\D/g, '')
          if (rawDigits.length >= 8) {
            const { data: byPhone } = await supabase
              .from('contacts')
              .select('id, name, phone, email, nutritionist_coupon, patient_coupon')
              .ilike('phone', `%${rawDigits.slice(-8)}%`)
              .limit(1)
              .maybeSingle()
            if (byPhone) contactMatch = byPhone
          }
        }

        if (cancelled) return

        const effectiveName = (contactMatch?.name || lead.client_name || '').trim()
        const effectivePhone = (contactMatch?.phone || lead.client_phone || '').trim()
        const effectiveEmail = (contactMatch?.email || lead.client_email || '').trim()
        const phoneDigits = effectivePhone.replace(/\D/g, '')

        setLinkedContact({
          id: contactMatch?.id,
          name: effectiveName,
          phone: effectivePhone,
          email: effectiveEmail,
          whatsappFound: phoneDigits.length >= 10,
        })

        // Sugerir códigos nos campos abertos caso ainda não digitados:
        // Se já existiam cupons salvos, preencher; se não, sugerir com a base do nome
        const existingNutri = contactMatch?.nutritionist_coupon || lead.nutritionist_coupon || ''
        const existingPat = contactMatch?.patient_coupon || lead.patient_coupon || ''
        if (existingNutri) {
          setNutriCoupon(existingNutri)
        } else {
          const base = cleanPrescriberNameForBase(effectiveName)
          setNutriCoupon(`${base}30`)
        }

        if (existingPat) {
          setPatientCoupon(existingPat)
        } else {
          const base = cleanPrescriberNameForBase(effectiveName)
          setPatientCoupon(`${base}10`)
        }

        // Se o lead já tinha cupons criados, exibir estado visual prévio
        if (existingNutri && existingPat) {
          setCouponsFeedback({
            type: 'existing',
            patientCode: existingPat,
            patientDiscount: 10,
            personalCode: existingNutri,
            personalDiscount: 30,
            patientCreated: true,
            personalCreated: true,
            communicationChannel: 'none',
            communicationStatus: 'already_emitted',
            message: 'Cupons já vinculados anteriormente a este prescritor.',
          })
        } else {
          setCouponsFeedback(null)
        }
      } catch (err) {
        console.error('Erro ao buscar dados do contato:', err)
      } finally {
        if (!cancelled) setLoadingContact(false)
      }
    }

    fetchLinkedContact()

    return () => {
      cancelled = true
    }
  }, [selectedLeadId, leads])

  const handleAddItem = () => setItems([...items, { product_name: '', quantity: 1 }])
  const handleRemoveItem = (i: number) => setItems(items.filter((_, idx) => idx !== i))
  const handleItemChange = (i: number, field: string, value: string | number) =>
    setItems(items.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)))

  const selectedLead = leads.find((l) => l.id === selectedLeadId)

  // Filtragem dos leads por nome/telefone/email a partir de 3 caracteres
  const filteredLeads = (() => {
    const term = leadSearch.trim().toLowerCase()
    if (term.length < 3) {
      return leads
    }
    const cleanSearch = term.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const digitsOnly = term.replace(/\D/g, '')

    return leads.filter((lead) => {
      const name = (lead.client_name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      const email = (lead.client_email || '').toLowerCase()
      const phone = lead.client_phone || ''
      const phoneDigits = phone.replace(/\D/g, '')

      if (name.includes(cleanSearch)) return true
      if (email.includes(cleanSearch)) return true
      if (digitsOnly.length >= 3 && phoneDigits.includes(digitsOnly)) return true
      if (phone.toLowerCase().includes(term)) return true
      return false
    })
  })()

  // Regenerar sugestão de códigos baseada no nome
  const handleRegenerateCodes = () => {
    const name =
      linkedContact?.name || leads.find((l) => l.id === selectedLeadId)?.client_name || 'NUTRI'
    const base = cleanPrescriberNameForBase(name)
    setPatientCoupon(`${base}10`)
    setNutriCoupon(`${base}30`)
  }

  // SOLICITAR KIT + DISPARO AUTOMÁTICO YAMPI CUPOONS DUPLOS + WHATSAPP
  const handleSolicitarKit = async () => {
    if (!user || !kitName) {
      toast({
        title: 'Nome do kit obrigatório',
        description: 'Selecione ou digite um nome para o kit.',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    const lead = leads.find((l) => l.id === selectedLeadId)

    try {
      // 1. Criar/Registrar o Kit no banco
      const kitData: any = { name: kitName, is_personalized: true }
      if (lead?.client_email) kitData.prescriber_email = lead.client_email
      await createKit(
        user.id,
        kitData,
        items.filter((i) => i.product_name),
      )

      // Se temos o lead selecionado, vincular kit_name e atualizar status para 'Requested' / pendente
      // Se não havia appointment mas temos linkedContact ou prescriber selecionado, garantir registro em appointments para que a expedição veja em Meus Envios
      if (lead?.id) {
        // Obter dados de endereço do contato se appointment não tiver
        const updatePayload: any = {
          kit_name: kitName,
          kit_status: 'Requested',
          nutritionist_coupon: nutriCoupon.trim() || undefined,
          patient_coupon: patientCoupon.trim() || undefined,
        }

        // Se o lead ainda não tem endereço mas o contato vinculado tem, enriquecer o appointment
        if (linkedContact?.id) {
          const { data: contactDetails } = await supabase
            .from('contacts')
            .select('address, cep, document')
            .eq('id', linkedContact.id)
            .maybeSingle()
          if (contactDetails?.address) {
            updatePayload.clinic_address = contactDetails.address
          }
          if (contactDetails?.cep) {
            updatePayload.clinic_cep = contactDetails.cep
          }
          if (contactDetails?.document) {
            updatePayload.client_document = contactDetails.document
          }
        }

        await supabase.from('appointments').update(updatePayload).eq('id', lead.id)
      } else if (linkedContact || lead?.client_email) {
        // Criar ou atualizar agendamento/registro de envio para o prescritor
        const email = linkedContact?.email || lead?.client_email || ''
        const name = linkedContact?.name || lead?.client_name || 'Prescritor'
        const phone = linkedContact?.phone || lead?.client_phone || ''

        // Verificar se já existe appointment recente para este prescritor
        let existingAptQuery = supabase
          .from('appointments')
          .select('id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)

        if (email) {
          existingAptQuery = existingAptQuery.eq('client_email', email)
        } else if (phone) {
          existingAptQuery = existingAptQuery.eq('client_phone', phone)
        }

        const { data: existingApt } = await existingAptQuery.maybeSingle()

        if (existingApt?.id) {
          await supabase
            .from('appointments')
            .update({
              kit_name: kitName,
              kit_status: 'Requested',
              nutritionist_coupon: nutriCoupon.trim() || undefined,
              patient_coupon: patientCoupon.trim() || undefined,
            })
            .eq('id', existingApt.id)
        } else {
          // Criar novo registro de envio em appointments
          let contactAddress = ''
          let contactCep = ''
          let contactDoc = ''
          if (linkedContact?.id) {
            const { data: cd } = await supabase
              .from('contacts')
              .select('address, cep, document')
              .eq('id', linkedContact.id)
              .maybeSingle()
            contactAddress = cd?.address || ''
            contactCep = cd?.cep || ''
            contactDoc = cd?.document || ''
          }

          await supabase.from('appointments').insert({
            user_id: user.id,
            client_name: name,
            client_email: email,
            client_phone: phone,
            appointment_date: new Date().toISOString().split('T')[0],
            start_time: '00:00',
            end_time: '00:00',
            kit_name: kitName,
            kit_status: 'Requested',
            status: 'lead',
            clinic_address: contactAddress,
            clinic_cep: contactCep,
            client_document: contactDoc,
            nutritionist_coupon: nutriCoupon.trim() || undefined,
            patient_coupon: patientCoupon.trim() || undefined,
          })
        }
      }

      // 2. Disparar a criação dos 2 cupons na Yampi via edge function yampi-dual-coupons
      let dualResult: DualCouponsResult | null = null

      if (lead?.id || linkedContact?.id) {
        toast({
          title: 'Kit solicitado!',
          description: 'Enviando dados à Yampi para gerar os 2 cupons e disparar WhatsApp...',
        })

        dualResult = await triggerDualCouponsFlow({
          appointmentId: lead?.id,
          contactId: linkedContact?.id,
          userId: user.id,
          force: true, // Força a emissão/reenvio com os códigos escolhidos pelo digitador
          customPatientCoupon: patientCoupon.trim() || undefined,
          customPersonalCoupon: nutriCoupon.trim() || undefined,
        })

        if (dualResult?.success) {
          const pat = dualResult.coupons?.patient?.code || patientCoupon
          const pers = dualResult.coupons?.personal?.code || nutriCoupon
          const comm = dualResult.communication

          setCouponsFeedback({
            type: dualResult.isExisting ? 'existing' : 'success',
            patientCode: pat,
            patientDiscount: dualResult.coupons?.patient?.discount || 10,
            personalCode: pers,
            personalDiscount: dualResult.coupons?.personal?.discount || 30,
            patientCreated: true,
            personalCreated: true,
            communicationChannel: comm?.channel,
            communicationStatus: comm?.status,
            recipient: comm?.recipient,
            message:
              comm?.status === 'sent'
                ? `Cupons criados com sucesso na Yampi e enviados via ${comm.channel === 'whatsapp' ? 'WhatsApp Oficial' : 'E-mail'}!`
                : `Cupons criados com sucesso na Yampi (${pat} e ${pers}).`,
          })

          if (comm?.status === 'sent') {
            toast({
              title: '✓ Sucesso Completo!',
              description: `Kit solicitado e cupons (${pat} e ${pers}) enviados via ${comm.channel === 'whatsapp' ? 'WhatsApp' : 'E-mail'}!`,
            })
          } else {
            toast({
              title: '✓ Cupons Criados na Yampi!',
              description: `Kit solicitado e cupons (${pat} / ${pers}) registrados.`,
            })
          }
        } else {
          let errDetail = dualResult?.error || 'Erro ao processar cupons na Yampi.'
          if (
            errDetail.toLowerCase().includes('edge function returned') ||
            errDetail.toLowerCase().includes('failed to fetch')
          ) {
            errDetail =
              'Não foi possível emitir os cupons na Yampi. Verifique se as credenciais da loja (Alias, User-Token e User-Secret-Key) estão configuradas em Configurações > Integração Yampi.'
          }

          setCouponsFeedback({
            type: 'error',
            patientCode: patientCoupon,
            patientDiscount: 10,
            personalCode: nutriCoupon,
            personalDiscount: 30,
            patientCreated: false,
            personalCreated: false,
            errorMessage: errDetail,
          })
          toast({
            title: 'Kit solicitado, mas falha no cupom Yampi',
            description: errDetail,
            variant: 'destructive',
          })
        }
      } else {
        toast({
          title: 'Kit criado!',
          description: 'O kit foi solicitado com sucesso.',
        })
      }

      loadData()
    } catch (err: any) {
      console.error('Erro ao solicitar kit:', err)
      toast({
        title: 'Erro',
        description: err?.message || 'Não foi possível solicitar o kit.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Apenas salvar / atribuir os cupons localmente sem disparar a Yampi
  const handleAssignCoupons = async () => {
    const lead = leads.find((l) => l.id === selectedLeadId)
    if (!lead) return
    try {
      if (linkedContact?.id) {
        await updateContactCoupons(linkedContact.id, nutriCoupon, patientCoupon)
      } else if (lead.client_email) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', lead.client_email)
          .maybeSingle()
        if (contact) {
          await updateContactCoupons(contact.id, nutriCoupon, patientCoupon)
        }
      }

      await supabase
        .from('appointments')
        .update({
          nutritionist_coupon: nutriCoupon || null,
          patient_coupon: patientCoupon || null,
        })
        .eq('id', lead.id)

      toast({
        title: 'Cupons vinculados localmente!',
        description: 'Os cupons foram atribuídos ao cadastro.',
      })
      loadData()
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível atribuir os cupons.',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteKit = async (kitId: string) => {
    try {
      await deleteKit(kitId)
      toast({ title: 'Kit excluído' })
      loadData()
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível excluir.', variant: 'destructive' })
    }
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>

  return (
    <div className="space-y-6">
      <Card className="border-border shadow-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Package className="h-5 w-5 text-emerald-600" /> Criar Kit e Atribuir Cupom
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm mt-1">
                Selecione o prescritor para vincular o WhatsApp, customize os cupons e clique em{' '}
                <strong>Solicitar Kit</strong> para criar os cupons na Yampi e disparar a mensagem
                oficial.
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className="w-fit bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 text-xs"
            >
              <Sparkles className="h-3 w-3" /> Yampi + WhatsApp Oficial
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* SELEÇÃO DO KIT E DO LEAD / PRESCRITOR */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">
                Nome do Kit
              </Label>
              <Popover open={kitComboOpen} onOpenChange={setKitComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={kitComboOpen}
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">{kitName || 'Selecione ou busque um kit...'}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar kit cadastrado..." />
                    <CommandList>
                      <CommandEmpty>Nenhum kit padrão encontrado.</CommandEmpty>
                      <CommandGroup>
                        {kits.map((kit) => (
                          <CommandItem
                            key={kit.id}
                            value={kit.name}
                            onSelect={() => {
                              setKitName(kit.name)
                              setKitComboOpen(false)
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                kitName === kit.name ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                            {kit.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {/* Opção para digitar nome personalizado de kit caso queira */}
              <Input
                placeholder="Ou digite um nome customizado para o kit..."
                value={kitName}
                onChange={(e) => setKitName(e.target.value)}
                className="text-xs h-8"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">
                Lead / Prescritor
              </Label>
              <Popover open={leadComboOpen} onOpenChange={setLeadComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={leadComboOpen}
                    className="w-full justify-between font-normal text-left h-auto min-h-10 py-2"
                  >
                    {selectedLead ? (
                      <div className="flex flex-col text-left truncate leading-tight">
                        <span className="font-medium text-slate-900 truncate">
                          {selectedLead.client_name}
                        </span>
                        {(selectedLead.client_phone || selectedLead.client_email) && (
                          <span className="text-xs text-muted-foreground truncate">
                            {selectedLead.client_phone}
                            {selectedLead.client_phone && selectedLead.client_email ? ' • ' : ''}
                            {selectedLead.client_email}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground truncate">
                        Selecione ou busque um prescritor...
                      </span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] min-w-[320px] max-w-[500px] p-0"
                  align="start"
                >
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Digite 3 ou mais letras para buscar..."
                      value={leadSearch}
                      onValueChange={setLeadSearch}
                    />
                    <CommandList className="max-h-72">
                      {leadSearch.trim().length > 0 && leadSearch.trim().length < 3 && (
                        <div className="py-2.5 px-3 text-center text-xs text-muted-foreground">
                          Digite mais {3 - leadSearch.trim().length}{' '}
                          {3 - leadSearch.trim().length === 1 ? 'caractere' : 'caracteres'} para
                          filtrar...
                        </div>
                      )}
                      {filteredLeads.length === 0 ? (
                        <CommandEmpty>Nenhum lead ou prescritor encontrado.</CommandEmpty>
                      ) : (
                        <CommandGroup
                          heading={
                            leadSearch.trim().length >= 3
                              ? `${filteredLeads.length} prescritor(es) encontrado(s)`
                              : `Todos os prescritores (${leads.length})`
                          }
                        >
                          {filteredLeads.map((lead) => (
                            <CommandItem
                              key={lead.id}
                              value={lead.id}
                              onSelect={() => {
                                setSelectedLeadId(lead.id)
                                setLeadComboOpen(false)
                              }}
                              className="cursor-pointer py-2"
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4 shrink-0',
                                  selectedLeadId === lead.id ? 'opacity-100' : 'opacity-0',
                                )}
                              />
                              <div className="flex flex-col min-w-0">
                                <span className="font-medium truncate">{lead.client_name}</span>
                                {(lead.client_phone || lead.client_email) && (
                                  <span className="text-xs text-muted-foreground truncate">
                                    {lead.client_phone}
                                    {lead.client_phone && lead.client_email ? ' • ' : ''}
                                    {lead.client_email}
                                  </span>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* PAINEL DE DADOS DO CONTATO VINCULADO (WHATSAPP & CADASTRO) */}
          {selectedLeadId && (
            <div className="rounded-lg border border-border/80 bg-slate-50/70 p-3 sm:p-4 animate-fade-in">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-semibold uppercase text-slate-700">
                    Dados do Prescritor Linkados
                  </span>
                </div>
                {loadingContact && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Buscando cadastro...
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block">Nome:</span>
                  <span className="font-medium text-slate-900 truncate block">
                    {linkedContact?.name || 'Não informado'}
                  </span>
                </div>

                <div>
                  <span className="text-xs text-muted-foreground block flex items-center gap-1">
                    <Phone className="h-3 w-3" /> WhatsApp / Telefone:
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-medium text-slate-900">
                      {linkedContact?.phone || 'Sem telefone'}
                    </span>
                    {linkedContact?.whatsappFound ? (
                      <Badge
                        variant="outline"
                        className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0 h-4"
                      >
                        WhatsApp OK
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0 h-4"
                      >
                        Sem WhatsApp
                      </Badge>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-xs text-muted-foreground block flex items-center gap-1">
                    <Mail className="h-3 w-3" /> E-mail (fallback):
                  </span>
                  <span className="font-medium text-slate-900 truncate block">
                    {linkedContact?.email || 'Sem e-mail'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ITENS DO KIT */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">
                Itens do Kit (opcional)
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddItem}
                className="gap-1 h-8 text-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar Produto
              </Button>
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground italic bg-slate-50 border border-dashed rounded p-2.5">
                Nenhum produto individual adicionado (será criado com os itens padrão do kit
                selecionado).
              </p>
            ) : (
              items.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    placeholder="Nome do produto ou amostra"
                    value={item.product_name}
                    onChange={(e) => handleItemChange(i, 'product_name', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => handleItemChange(i, 'quantity', parseInt(e.target.value) || 1)}
                    className="w-24"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveItem(i)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* CAMPOS ABERTOS / EDITÁVEIS PARA OS CUPONS (DIGITADOR CRIA O NOME QUE QUISER) */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Tag className="h-4 w-4 text-emerald-600" />
                <Label className="text-xs font-semibold uppercase text-slate-700">
                  Cupons Yampi (Campos Abertos & Customizáveis)
                </Label>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRegenerateCodes}
                className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="h-3 w-3" /> Sugerir códigos
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Você pode alterar livremente os nomes abaixo. Ao clicar em{' '}
              <strong>Solicitar Kit</strong>, a Yampi cria esses cupons com as regras fixas (50
              unidades, % off e exclusão de combos) e notifica via WhatsApp oficial.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* CUPOM DA NUTRI (PESSOAL - 30%) */}
              <div className="space-y-1.5 rounded-lg border border-border/80 p-3 bg-card">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-800">
                    Cupom da Nutricionista (Uso Pessoal)
                  </Label>
                  <Badge
                    variant="outline"
                    className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                  >
                    30% OFF • 50 un
                  </Badge>
                </div>
                <Input
                  value={nutriCoupon}
                  onChange={(e) => setNutriCoupon(e.target.value.toUpperCase())}
                  placeholder="Ex: JULIAMENEZES30"
                  className="font-mono uppercase font-semibold text-sm"
                />
                <span className="text-[11px] text-muted-foreground block">
                  Exclusivo para compras da profissional (regra de 30% na Yampi).
                </span>
              </div>

              {/* CUPOM DO PACIENTE (10%) */}
              <div className="space-y-1.5 rounded-lg border border-border/80 p-3 bg-card">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-800">
                    Cupom para Pacientes
                  </Label>
                  <Badge
                    variant="outline"
                    className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]"
                  >
                    10% OFF • 50 un
                  </Badge>
                </div>
                <Input
                  value={patientCoupon}
                  onChange={(e) => setPatientCoupon(e.target.value.toUpperCase())}
                  placeholder="Ex: JULIAMENEZES10"
                  className="font-mono uppercase font-semibold text-sm"
                />
                <span className="text-[11px] text-muted-foreground block">
                  Código que ela divulga para os pacientes na loja oficial FourLab.
                </span>
              </div>
            </div>
          </div>

          {/* RETORNO VISUAL DO YAMPI COM CHECK POR CUPOM ("tipo um check em cupom criado") */}
          {couponsFeedback && (
            <div
              className={cn(
                'rounded-lg border p-4 space-y-3 transition-all animate-fade-in',
                couponsFeedback.type === 'success' || couponsFeedback.type === 'existing'
                  ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                  : 'bg-red-50/60 border-red-200 text-red-950',
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {couponsFeedback.type === 'success' || couponsFeedback.type === 'existing' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <span className="font-semibold text-sm">
                    {couponsFeedback.type === 'success'
                      ? 'Retorno Yampi: Cupons Criados e Ativos'
                      : couponsFeedback.type === 'existing'
                        ? 'Retorno Yampi: Cupons Já Cadastrados'
                        : 'Retorno Yampi: Falha ao Criar Cupons'}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs uppercase',
                    couponsFeedback.type === 'success' || couponsFeedback.type === 'existing'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-red-100 text-red-800 border-red-300',
                  )}
                >
                  {couponsFeedback.type === 'success'
                    ? '✓ Criado na Yampi'
                    : couponsFeedback.type === 'existing'
                      ? '✓ Ativo'
                      : 'Erro'}
                </Badge>
              </div>

              {/* Checks individuais por cupom */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Check Cupom Nutri */}
                <div className="flex items-center justify-between rounded bg-white/80 p-2.5 border border-border/50">
                  <div className="space-y-0.5">
                    <span className="text-xs text-muted-foreground block">
                      Cupom Nutricionista (30%)
                    </span>
                    <span className="font-mono font-bold text-sm text-slate-900">
                      {couponsFeedback.personalCode}
                    </span>
                  </div>
                  {couponsFeedback.personalCreated ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                      <Check className="h-4 w-4" /> Cupom criado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">
                      <XCircle className="h-4 w-4" /> Não criado
                    </span>
                  )}
                </div>

                {/* Check Cupom Paciente */}
                <div className="flex items-center justify-between rounded bg-white/80 p-2.5 border border-border/50">
                  <div className="space-y-0.5">
                    <span className="text-xs text-muted-foreground block">
                      Cupom Paciente (10%)
                    </span>
                    <span className="font-mono font-bold text-sm text-slate-900">
                      {couponsFeedback.patientCode}
                    </span>
                  </div>
                  {couponsFeedback.patientCreated ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                      <Check className="h-4 w-4" /> Cupom criado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">
                      <XCircle className="h-4 w-4" /> Não criado
                    </span>
                  )}
                </div>
              </div>

              {/* Informação sobre o envio (WhatsApp ou e-mail) */}
              {couponsFeedback.message && (
                <p className="text-xs text-emerald-800 flex items-center gap-1.5 pt-1">
                  <Send className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  {couponsFeedback.message}
                </p>
              )}
              {couponsFeedback.errorMessage && (
                <p className="text-xs text-red-700 flex items-center gap-1.5 pt-1">
                  <AlertCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                  {couponsFeedback.errorMessage}
                </p>
              )}
            </div>
          )}

          {/* BOTÕES DE AÇÃO: SOLICITAR KIT (DISPARA TUDO) E ATRIBUIR MANUAL */}
          <div className="flex gap-2.5 flex-wrap pt-2">
            <Button
              onClick={handleSolicitarKit}
              disabled={!kitName || submitting}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Processando na Yampi...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Solicitar Kit
                </>
              )}
            </Button>

            {selectedLeadId && (nutriCoupon || patientCoupon) && (
              <Button
                variant="outline"
                onClick={handleAssignCoupons}
                disabled={submitting}
                className="gap-1.5"
              >
                Salvar Cupons no Cadastro
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* LISTA DE KITS EXISTENTES */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Kits Existentes</CardTitle>
            <Badge variant="secondary">{kits.length} kit(s) padrão</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Apenas kits padrão são exibidos nesta lista de referência. Kits personalizados gerados
            em solicitações ficam vinculados aos leads e envios de logística.
          </p>
        </CardHeader>
        <CardContent>
          {kits.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum kit criado ainda.</p>
          ) : (
            <div className="space-y-2">
              {kits.map((kit) => (
                <div
                  key={kit.id}
                  className="flex items-center justify-between border rounded-lg p-3 hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-slate-900">{kit.name}</p>
                    {kit.prescriber_email && (
                      <p className="text-xs text-muted-foreground">{kit.prescriber_email}</p>
                    )}
                    {kit.kit_items?.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {kit.kit_items
                          .map((i: any) => `${i.product_name} (${i.quantity})`)
                          .join(', ')}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteKit(kit.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
