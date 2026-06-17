import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { getKits, createKit, deleteKit, updateKitItems } from '@/services/kits'
import { getPrescribers } from '@/services/crm'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { Plus, Trash2, PackageSearch, User, Link as LinkIcon } from 'lucide-react'
import { assignKitToPrescriber } from '@/services/kits'

export function KitBuilder() {
  const { user } = useAuth()
  const [kits, setKits] = useState<any[]>([])
  const [prescribers, setPrescribers] = useState<any[]>([])
  const [inventoryProducts, setInventoryProducts] = useState<any[]>([])

  // Form State
  const [selectedCatalogKit, setSelectedCatalogKit] = useState<string>('new')
  const [name, setName] = useState('')
  const [isPersonalized, setIsPersonalized] = useState(false)
  const [prescriberEmail, setPrescriberEmail] = useState('')
  const [items, setItems] = useState<{ product_name: string; quantity: number }[]>([
    { product_name: '', quantity: 1 },
  ])
  const [loading, setLoading] = useState(false)

  // Link State
  const [linkPrescriber, setLinkPrescriber] = useState('')
  const [linkKit, setLinkKit] = useState('')
  const [linking, setLinking] = useState(false)

  const loadData = async () => {
    if (!user) return
    const [fetchedKits, fetchedPrescribers] = await Promise.all([
      getKits(user.id),
      getPrescribers(user.id),
    ])
    setKits(fetchedKits)
    setPrescribers(fetchedPrescribers)

    // Load inventory products
    const { data: invData } = await supabase
      .from('inventory_items' as any)
      .select('product_name')
      .eq('user_id', user.id)
      .order('product_name')
    if (invData) setInventoryProducts(invData)
  }

  useEffect(() => {
    loadData()
  }, [user])

  const handleCatalogSelect = (kitId: string) => {
    setSelectedCatalogKit(kitId)
    if (kitId === 'new') {
      setName('')
      setIsPersonalized(false)
      setPrescriberEmail('')
      setItems([{ product_name: '', quantity: 1 }])
    } else {
      const kit = kits.find((k) => k.id === kitId)
      if (kit) {
        setName(kit.name)
        setIsPersonalized(kit.is_personalized || false)
        setPrescriberEmail(kit.prescriber_email || '')
        setItems(
          kit.kit_items?.length > 0
            ? kit.kit_items.map((i: any) => ({
                product_name: i.product_name,
                quantity: i.quantity,
              }))
            : [{ product_name: '', quantity: 1 }],
        )
      }
    }
  }

  const handleAddItem = () => {
    setItems([...items, { product_name: '', quantity: 1 }])
  }

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    setItems(newItems)
  }

  const handleSave = async () => {
    if (!user) return
    if (!name || items.some((i) => !i.product_name || i.quantity < 1)) {
      return toast({
        title: 'Erro',
        description: 'Preencha o nome do kit e todos os itens.',
        variant: 'destructive',
      })
    }
    if (isPersonalized && !prescriberEmail) {
      return toast({
        title: 'Erro',
        description: 'Selecione um prescritor para o kit personalizado.',
        variant: 'destructive',
      })
    }

    setLoading(true)
    try {
      if (selectedCatalogKit === 'new') {
        await createKit(
          user.id,
          { name, is_personalized: isPersonalized, prescriber_email: prescriberEmail || null },
          items,
        )
        toast({ title: 'Sucesso', description: 'Kit criado com sucesso!' })
        setName('')
        setSelectedCatalogKit('new')
        setIsPersonalized(false)
        setPrescriberEmail('')
        setItems([{ product_name: '', quantity: 1 }])
      } else {
        // Edit existing kit
        await updateKitItems(
          selectedCatalogKit,
          { name, is_personalized: isPersonalized, prescriber_email: prescriberEmail || null },
          items,
        )
        toast({ title: 'Sucesso', description: 'Kit atualizado com sucesso!' })
      }
      loadData()
    } catch (err) {
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar o kit.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (kitId: string) => {
    try {
      await deleteKit(kitId)
      toast({ title: 'Kit Removido', description: 'O kit foi excluído do sistema.' })
      if (selectedCatalogKit === kitId) {
        setSelectedCatalogKit('new')
        setName('')
        setIsPersonalized(false)
        setPrescriberEmail('')
        setItems([{ product_name: '', quantity: 1 }])
      }
      loadData()
    } catch (err) {
      toast({ title: 'Erro', description: 'Falha ao excluir kit.', variant: 'destructive' })
    }
  }

  const handleLinkKit = async () => {
    if (!user) return
    if (!linkPrescriber || !linkKit) {
      return toast({
        title: 'Erro',
        description: 'Selecione um prescritor e um kit.',
        variant: 'destructive',
      })
    }

    setLinking(true)
    try {
      const kit = kits.find((k) => k.id === linkKit)
      if (!kit) return

      await assignKitToPrescriber(user.id, linkPrescriber, kit.name)
      toast({ title: 'Sucesso', description: 'Kit vinculado ao atendimento com sucesso!' })
      setLinkPrescriber('')
      setLinkKit('')
    } catch (err) {
      toast({
        title: 'Erro',
        description: 'Não foi possível vincular o kit.',
        variant: 'destructive',
      })
    } finally {
      setLinking(false)
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6 animate-fade-in">
      <div className="space-y-6">
        <Card className="shadow-subtle h-fit">
          <CardHeader>
            <CardTitle>
              {selectedCatalogKit === 'new' ? 'Criar Novo Kit' : 'Editar Kit Selecionado'}
            </CardTitle>
            <CardDescription>
              Defina os itens e crie kits padrão ou personalizados para um prescritor específico.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label>Selecione um Kit Existente ou Crie Novo</Label>
              <Select value={selectedCatalogKit} onValueChange={handleCatalogSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um kit..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new" className="font-semibold text-primary">
                    -- Criar Novo Kit --
                  </SelectItem>
                  {kits.map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.name} {k.is_personalized ? '(Personalizado)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="pt-2">
                <Label className="text-xs text-muted-foreground">Nome do Kit</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome do kit (Ex: Kit Introdução 2026)"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 bg-muted/30 p-3 rounded-md border mt-2">
              <Checkbox
                id="personalized"
                checked={isPersonalized}
                onCheckedChange={(c) => setIsPersonalized(!!c)}
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="personalized"
                  className="text-sm font-medium leading-none cursor-pointer"
                >
                  Kit Personalizado (Específico para um Prescritor)
                </label>
              </div>
            </div>

            {isPersonalized && (
              <div className="space-y-3 animate-fade-in">
                <Label>Selecione o Prescritor</Label>
                <Select value={prescriberEmail} onValueChange={setPrescriberEmail}>
                  <SelectTrigger>
                    <SelectValue placeholder="Buscar prescritor na base..." />
                  </SelectTrigger>
                  <SelectContent>
                    {prescribers.map((p) => (
                      <SelectItem key={p.client_email} value={p.client_email}>
                        {p.client_name} ({p.client_email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-4 pt-2 border-t">
              <Label className="flex justify-between items-center">
                Itens do Kit
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddItem}
                  className="h-7 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" /> Adicionar Item
                </Button>
              </Label>
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1">
                    <Input
                      placeholder="Nome do Produto / Amostra"
                      value={item.product_name}
                      onChange={(e) => handleItemChange(idx, 'product_name', e.target.value)}
                      list="inventory-products"
                    />
                    <datalist id="inventory-products">
                      {inventoryProducts.map((prod, i) => (
                        <option key={i} value={prod.product_name} />
                      ))}
                    </datalist>
                  </div>
                  <div className="w-24 space-y-1">
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) =>
                        handleItemChange(idx, 'quantity', parseInt(e.target.value) || 1)
                      }
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive mt-0 shrink-0"
                    onClick={() => handleRemoveItem(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button className="w-full" onClick={handleSave} disabled={loading}>
              {loading
                ? 'Salvando...'
                : selectedCatalogKit === 'new'
                  ? 'Criar Kit'
                  : 'Atualizar Kit'}
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-subtle h-fit">
          <CardHeader>
            <CardTitle>Vincular Kit a Atendimento</CardTitle>
            <CardDescription>
              Associe um kit existente ao atendimento de um prescritor específico.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label>Selecione o Prescritor</Label>
              <Select value={linkPrescriber} onValueChange={setLinkPrescriber}>
                <SelectTrigger>
                  <SelectValue placeholder="Buscar prescritor..." />
                </SelectTrigger>
                <SelectContent>
                  {prescribers.map((p) => (
                    <SelectItem key={p.client_email} value={p.client_email}>
                      {p.client_name} ({p.client_email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Selecione o Kit</Label>
              <Select value={linkKit} onValueChange={setLinkKit}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha um kit..." />
                </SelectTrigger>
                <SelectContent>
                  {kits.map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.name} {k.is_personalized ? '(Personalizado)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full gap-2"
              variant="secondary"
              onClick={handleLinkKit}
              disabled={linking || !linkPrescriber || !linkKit}
            >
              <LinkIcon className="h-4 w-4" />
              {linking ? 'Vinculando...' : 'Vincular Kit'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold tracking-tight">Kits Cadastrados</h3>
        {kits.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground border border-dashed rounded-lg bg-slate-50/50">
            <PackageSearch className="h-10 w-10 mx-auto mb-3 opacity-20" />
            Nenhum kit configurado ainda.
          </div>
        ) : (
          <div className="grid gap-3">
            {kits.map((kit) => (
              <Card
                key={kit.id}
                className={`shadow-sm cursor-pointer transition-colors ${selectedCatalogKit === kit.id ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/50'}`}
                onClick={() => handleCatalogSelect(kit.id)}
              >
                <CardContent className="p-4 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-base">{kit.name}</h4>
                      {kit.is_personalized && (
                        <Badge
                          variant="secondary"
                          className="bg-purple-100 text-purple-700 hover:bg-purple-100 border-none gap-1"
                        >
                          <User className="h-3 w-3" /> Personalizado
                        </Badge>
                      )}
                    </div>
                    {kit.is_personalized && kit.prescriber_email && (
                      <p className="text-xs text-muted-foreground mb-2">
                        Para:{' '}
                        {prescribers.find((p) => p.client_email === kit.prescriber_email)
                          ?.client_name || kit.prescriber_email}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {kit.kit_items?.map((item: any) => (
                        <Badge key={item.id} variant="outline" className="text-xs font-normal">
                          {item.quantity}x {item.product_name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {kit.user_id === user?.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(kit.id)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
