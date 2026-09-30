import { useState, useEffect } from 'react'
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
import { Button } from '@/components/ui/button'
import { Check, ChevronsUpDown, Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

interface KitSelectProps {
  appointmentId: string
  value: string | null
  onUpdated: () => void
}

export function KitSelect({ appointmentId, value, onUpdated }: KitSelectProps) {
  const [open, setOpen] = useState(false)
  const [kits, setKits] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchKits()
  }, [])

  const fetchKits = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()

    const isLogisticsOrManager = profile?.role === 'logistics' || profile?.role === 'kit_manager'

    let query = supabase.from('kits').select('id, name').order('name', { ascending: true })

    if (!isLogisticsOrManager) {
      query = query.eq('user_id', session.user.id)
    }

    const { data } = await query

    if (data) {
      // Deduplicar kits por nome caso haja kits com o mesmo nome entre usuários
      const uniqueByName = data.filter(
        (kit, index, self) => index === self.findIndex((k) => k.name === kit.name),
      )
      setKits(uniqueByName)
    }
  }

  const handleSelect = async (kitName: string) => {
    setSaving(true)
    const { error } = await supabase
      .from('appointments')
      .update({ kit_name: kitName })
      .eq('id', appointmentId)

    setSaving(false)
    setOpen(false)

    if (error) {
      toast({ title: 'Erro', description: 'Falha ao atualizar kit.', variant: 'destructive' })
    } else {
      toast({ title: 'Sucesso', description: 'Kit atualizado com sucesso.' })
      onUpdated()
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-start gap-2 px-2 font-normal hover:bg-muted"
        >
          <Package className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate max-w-[120px]" title={value || 'Kit Padrão'}>
            {value || 'Kit Padrão'}
          </span>
          <ChevronsUpDown className="h-3 w-3 ml-auto shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar kit..." />
          <CommandList>
            <CommandEmpty>Nenhum kit encontrado.</CommandEmpty>
            <CommandGroup>
              {kits.map((kit) => (
                <CommandItem
                  key={kit.id}
                  value={kit.name}
                  onSelect={() => handleSelect(kit.name)}
                  disabled={saving}
                >
                  <Check
                    className={cn('mr-2 h-4 w-4', value === kit.name ? 'opacity-100' : 'opacity-0')}
                  />
                  {kit.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
