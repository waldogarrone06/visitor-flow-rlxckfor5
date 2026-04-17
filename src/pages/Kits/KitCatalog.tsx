import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PackageOpen, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

export function KitCatalog() {
  const [kits, setKits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function loadKits() {
      const { data, error } = await supabase
        .from('kits')
        .select('*, kit_items(*)')
        .order('created_at', { ascending: false })

      if (!error && data) {
        setKits(data)
      }
      setLoading(false)
    }
    loadKits()
  }, [])

  const filteredKits = kits.filter(
    (k) =>
      k.name.toLowerCase().includes(search.toLowerCase()) ||
      (k.prescriber_email && k.prescriber_email.toLowerCase().includes(search.toLowerCase())) ||
      (k.kit_items &&
        k.kit_items.some((i: any) => i.product_name.toLowerCase().includes(search.toLowerCase()))),
  )

  if (loading) {
    return (
      <div className="p-12 text-center text-muted-foreground animate-pulse">
        Carregando catálogo de kits...
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Catálogo Geral de Kits</h2>
          <p className="text-sm text-muted-foreground">
            Visualize todos os kits cadastrados no sistema.
          </p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar kits, itens ou prescritor..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filteredKits.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <PackageOpen className="h-12 w-12 mb-4 opacity-20" />
            <p>Nenhum kit encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredKits.map((kit) => (
            <Card
              key={kit.id}
              className="flex flex-col h-full hover:border-primary/50 transition-colors overflow-hidden"
            >
              <CardHeader className="pb-3 bg-muted/20">
                <div className="flex justify-between items-start gap-4">
                  <CardTitle className="text-lg leading-tight">{kit.name}</CardTitle>
                  {kit.is_personalized && (
                    <Badge
                      variant="secondary"
                      className="shrink-0 text-[10px] uppercase tracking-wider"
                    >
                      Personalizado
                    </Badge>
                  )}
                </div>
                {kit.prescriber_email && (
                  <CardDescription className="text-xs break-all mt-1.5">
                    Prescritor: <span className="font-medium">{kit.prescriber_email}</span>
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex-1 flex flex-col pt-4">
                <div className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <PackageOpen className="h-3.5 w-3.5" />
                  Composição do Kit
                </div>
                <ul className="space-y-2 flex-1">
                  {kit.kit_items && kit.kit_items.length > 0 ? (
                    kit.kit_items.map((item: any) => (
                      <li
                        key={item.id}
                        className="flex justify-between items-center text-sm bg-muted/40 border border-muted/60 p-2.5 rounded-md"
                      >
                        <span className="truncate pr-3 font-medium text-foreground/90">
                          {item.product_name}
                        </span>
                        <Badge variant="outline" className="shrink-0 font-mono bg-background">
                          x{item.quantity}
                        </Badge>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-muted-foreground italic bg-muted/20 p-3 rounded-md text-center border border-dashed">
                      Nenhum item cadastrado
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
