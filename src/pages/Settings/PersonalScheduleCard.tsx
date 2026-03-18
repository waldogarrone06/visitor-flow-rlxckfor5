import { useState, useEffect } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Clock, Plus, Trash2, Save, Trash } from 'lucide-react'
import { getSchedule, saveSchedule, clearSchedule } from '@/services/settings'
import { toast } from '@/hooks/use-toast'

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const SLOT_TYPES = ['Prescritor Exclusivo', 'Grupo']

export function PersonalScheduleCard() {
  const [slots, setSlots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [newDay, setNewDay] = useState('1')
  const [newStart, setNewStart] = useState('08:00')
  const [newEnd, setNewEnd] = useState('09:00')
  const [newType, setNewType] = useState('Prescritor Exclusivo')

  useEffect(() => {
    getSchedule().then((data) => {
      setSlots(data)
      setLoading(false)
    })
  }, [])

  const handleAdd = () => {
    if (!newStart || !newEnd) return
    const nextSlots = [
      ...slots,
      {
        day_of_week: parseInt(newDay, 10),
        start_time: newStart,
        end_time: newEnd,
        slot_type: newType,
      },
    ]
    nextSlots.sort(
      (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
    )
    setSlots(nextSlots)
  }

  const handleRemove = (index: number) => {
    const nextSlots = [...slots]
    nextSlots.splice(index, 1)
    setSlots(nextSlots)
  }

  const handleSave = async () => {
    setSaving(true)
    await saveSchedule(slots)
    setSaving(false)
    toast({
      title: 'Agenda Atualizada',
      description: 'Seus horários de disponibilidade foram salvos com sucesso no banco de dados.',
    })
  }

  const handleClear = async () => {
    setSlots([])
    await clearSchedule()
    toast({ title: 'Agenda Limpa', description: 'Todos os seus horários foram removidos.' })
  }

  return (
    <Card className="flex flex-col shadow-subtle border-border/50 lg:col-span-3">
      <CardHeader className="pb-4 border-b">
        <div className="flex justify-between items-start">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg mb-2">
            <Clock className="h-6 w-6" />
          </div>
          <Badge variant="secondary">{slots.length} Horários</Badge>
        </div>
        <CardTitle>Agenda Pessoal & Disponibilidade</CardTitle>
        <CardDescription>
          Gerencie seus horários de atendimento exclusivos ou em grupo para sincronização com o
          agendador.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end bg-muted/30 p-4 rounded-md border">
          <div className="space-y-2">
            <Label>Dia da Semana</Label>
            <Select value={newDay} onValueChange={setNewDay}>
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((day, idx) => (
                  <SelectItem key={idx} value={idx.toString()}>
                    {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Início</Label>
            <Input
              type="time"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              className="bg-white"
            />
          </div>
          <div className="space-y-2">
            <Label>Fim</Label>
            <Input
              type="time"
              value={newEnd}
              onChange={(e) => setNewEnd(e.target.value)}
              className="bg-white"
            />
          </div>
          <div className="space-y-2">
            <Label>Tipo de Atendimento</Label>
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SLOT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} className="gap-2" variant="secondary">
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Horários Cadastrados
          </h4>
          {loading ? (
            <div className="h-20 flex items-center justify-center text-muted-foreground">
              Carregando horários...
            </div>
          ) : slots.length === 0 ? (
            <div className="p-8 border border-dashed rounded-md text-center text-muted-foreground text-sm bg-slate-50/50">
              Nenhum horário cadastrado. Adicione seus horários acima.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {slots.map((slot, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center p-3 border rounded-md bg-white shadow-sm hover:border-primary/30 transition-colors"
                >
                  <div>
                    <div className="font-medium text-sm text-foreground">
                      {DAYS[slot.day_of_week]}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                      {slot.start_time} - {slot.end_time}
                    </div>
                    <Badge
                      variant="outline"
                      className={`mt-2 text-[10px] ${slot.slot_type === 'Grupo' ? 'bg-teal-50 text-teal-700' : 'bg-orange-50 text-orange-700'}`}
                    >
                      {slot.slot_type}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive h-8 w-8 shrink-0 hover:bg-destructive/10"
                    onClick={() => handleRemove(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex justify-between border-t p-6 bg-slate-50/50">
        <Button
          variant="ghost"
          onClick={handleClear}
          className="text-muted-foreground gap-2"
          disabled={slots.length === 0}
        >
          <Trash className="h-4 w-4" /> Limpar Todos
        </Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
      </CardFooter>
    </Card>
  )
}
