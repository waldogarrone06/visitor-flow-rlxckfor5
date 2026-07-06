import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Trash2, Plus, Package, Check, ChevronsUpDown } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { getKits, createKit, deleteKit, assignKitToPrescriber } from '@/services/kits'
import { getAllLeadsForKits, LeadOption } from '@/services/leads'
import { updateContactCoupons } from '@/services/contacts'
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
import { cn } from '@/lib/utils'

export function KitBuilder() {
  const { user } = useAuth()
  const [leads, setLeads] = useState<LeadOption[]>([])
  const [kits, setKits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [kitName, setKitName] = useState('')
  const [kitComboOpen, setKitComboOpen] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [nutriCoupon, setNutriCoupon] = useState('')
  const [patientCoupon, setPatientCoupon] = useState('')
  const [items, setItems] = useState<{ product_name: string; quantity: number }[]>([])

  const loadData = useCallback(async () => {
    if (!user) return
    try {
      const [leadsData, kitsData] = await Promise.all([
        getAllLeadsForKits(user.id),
        getKits(user.id),
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

  const handleAddItem = () => setItems([...items, { product_name: '', quantity: 1 }])
  const handleRemoveItem = (i: number) => setItems(items.filter((_, idx) => idx !== i))
  const handleItemChange = (i: number, field: string, value: string | number) =>
    setItems(items.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)))

  const handleCreateKit = async () => {
    if (!user || !kitName) return
    try {
      const lead = leads.find((l) => l.id === selectedLeadId)
      const kitData: any = { name: kitName, is_personalized: true }
      if (lead?.client_email) kitData.prescriber_email = lead.client_email
      await createKit(
        user.id,
        kitData,
        items.filter((i) => i.product_name),
      )
      if (lead?.client_email) await assignKitToPrescriber(user.id, lead.client_email, kitName)
      toast({ title: 'Kit criado!', description: 'O kit foi criado com sucesso.' })
      setKitName('')
      setSelectedLeadId('')
      setItems([])
      loadData()
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível criar o kit.', variant: 'destructive' })
    }
  }

  const handleAssignCoupons = async () => {
    const lead = leads.find((l) => l.id === selectedLeadId)
    if (!lead?.client_email) return
    try {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('email', lead.client_email)
        .single()
      if (contact) {
        await updateContactCoupons(contact.id, nutriCoupon, patientCoupon)
      }
      await supabase
        .from('appointments')
        .update({ nutritionist_coupon: nutriCoupon || null, patient_coupon: patientCoupon || null })
        .eq('id', lead.id)
      toast({ title: 'Cupons atualizados!', description: 'Os cupons foram atribuídos ao lead.' })
      setNutriCoupon('')
      setPatientCoupon('')
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
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5" /> Criar Kit e Atribuir Cupom
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome do Kit</Label>
              <Popover open={kitComboOpen} onOpenChange={setKitComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={kitComboOpen}
                    className="w-full justify-between font-normal"
                  >
                    {kitName || 'Selecione um kit...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar kit..." />
                    <CommandList>
                      <CommandEmpty>Nenhum kit encontrado.</CommandEmpty>
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
            </div>
            <div className="space-y-2">
              <Label>Lead / Prescritor</Label>
              <Select value={selectedLeadId} onValueChange={setSelectedLeadId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um lead..." />
                </SelectTrigger>
                <SelectContent>
                  {leads.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.client_name}
                      {lead.client_email ? ` (${lead.client_email})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Itens do Kit</Label>
              <Button variant="outline" size="sm" onClick={handleAddItem} className="gap-1">
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
            </div>
            {items.map((item, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  placeholder="Produto"
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
                  className="text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cupom do Nutricionista</Label>
              <Input
                value={nutriCoupon}
                onChange={(e) => setNutriCoupon(e.target.value)}
                placeholder="Ex: NUTRI10"
              />
            </div>
            <div className="space-y-2">
              <Label>Cupom do Paciente</Label>
              <Input
                value={patientCoupon}
                onChange={(e) => setPatientCoupon(e.target.value)}
                placeholder="Ex: PACIENTE15"
              />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={handleCreateKit} disabled={!kitName} className="gap-2">
              <Plus className="h-4 w-4" /> Criar Kit
            </Button>
            {selectedLeadId && (nutriCoupon || patientCoupon) && (
              <Button variant="outline" onClick={handleAssignCoupons}>
                Atribuir Cupons
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Kits Existentes</CardTitle>
        </CardHeader>
        <CardContent>
          {kits.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum kit criado ainda.</p>
          ) : (
            <div className="space-y-2">
              {kits.map((kit) => (
                <div
                  key={kit.id}
                  className="flex items-center justify-between border rounded-lg p-3 hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium">{kit.name}</p>
                    {kit.prescriber_email && (
                      <p className="text-sm text-muted-foreground">{kit.prescriber_email}</p>
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
                    className="text-red-500"
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
