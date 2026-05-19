import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar } from '@/components/ui/calendar'
import { Trash2, Plus, Save, Calendar as CalendarIcon } from 'lucide-react'
import {
  getSpecificSchedule,
  saveSpecificSchedule,
  getAllSpecificSchedules,
} from '@/services/settings'
import { toast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function SpecificSchedule() {
  const [date, setDate] = useState<Date | undefined>(new Date())
  const [slots, setSlots] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [overriddenDates, setOverriddenDates] = useState<Date[]>([])

  useEffect(() => {
    getAllSpecificSchedules().then((data) => {
      const dates = data.map((d) => {
        const [y, m, day] = d.specific_date.split('-')
        return new Date(Number(y), Number(m) - 1, Number(day))
      })
      setOverriddenDates(dates)
    })
  }, [])

  useEffect(() => {
    if (!date) return
    setLoading(true)
    getSpecificSchedule(format(date, 'yyyy-MM-dd')).then((data) => {
      setSlots(data)
      setLoading(false)
    })
  }, [date])

  const addSlot = () => {
    setSlots([
      ...slots,
      { start_time: '08:00', end_time: '09:00', slot_type: 'Prescritor Exclusivo' },
    ])
  }

  const updateSlot = (index: number, field: string, value: string) => {
    const newSlots = [...slots]
    newSlots[index][field] = value
    setSlots(newSlots)
  }

  const removeSlot = (index: number) => {
    setSlots(slots.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (!date) return
    const dateStr = format(date, 'yyyy-MM-dd')
    await saveSpecificSchedule(dateStr, slots)
    toast({
      title: 'Exceção Salva',
      description: 'A disponibilidade para esta data foi atualizada.',
    })

    const isAlreadyMarked = overriddenDates.some((d) => format(d, 'yyyy-MM-dd') === dateStr)
    if (slots.length > 0 && !isAlreadyMarked) {
      setOverriddenDates([...overriddenDates, date])
    } else if (slots.length === 0 && isAlreadyMarked) {
      setOverriddenDates(overriddenDates.filter((d) => format(d, 'yyyy-MM-dd') !== dateStr))
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in-up">
      <Card className="shadow-subtle border-border/50">
        <CardHeader>
          <CardTitle className="text-xl">Selecione a Data</CardTitle>
          <CardDescription>
            Escolha um dia específico para sobrescrever a disponibilidade recorrente.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center pb-6">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            locale={ptBR}
            modifiers={{ overridden: overriddenDates }}
            modifiersClassNames={{
              overridden: 'bg-amber-100 text-amber-900 font-bold border-amber-300',
            }}
            className="rounded-md border p-4 bg-white shadow-sm w-full max-w-[350px] flex justify-center"
          />
        </CardContent>
      </Card>

      <Card className="shadow-subtle border-border/50">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-primary" /> Exceções da Data
            </CardTitle>
            <CardDescription>
              {date
                ? format(date, "EEEE, dd 'de' MMMM", { locale: ptBR })
                : 'Nenhuma data selecionada.'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {!date ? (
            <p className="text-muted-foreground text-center py-8">
              Selecione uma data no calendário ao lado.
            </p>
          ) : loading ? (
            <p className="text-center py-8">Carregando exceções...</p>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b pb-4">
                <p className="text-sm text-muted-foreground max-w-[70%]">
                  Ao adicionar horários aqui, a grade semanal normal será ignorada para este dia.
                </p>
                <Button variant="outline" size="sm" onClick={addSlot} className="gap-2">
                  <Plus className="w-4 h-4" /> Adicionar
                </Button>
              </div>

              {slots.length === 0 ? (
                <div className="bg-slate-50 p-6 rounded-md border border-dashed text-center">
                  <p className="text-sm text-muted-foreground">
                    Sem exceções definidas. A disponibilidade seguirá a grade semanal padrão.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {slots.map((slot, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={slot.start_time}
                          onChange={(e) => updateSlot(i, 'start_time', e.target.value)}
                          className="w-28 sm:w-32"
                        />
                        <span className="text-sm text-muted-foreground">até</span>
                        <Input
                          type="time"
                          value={slot.end_time}
                          onChange={(e) => updateSlot(i, 'end_time', e.target.value)}
                          className="w-28 sm:w-32"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSlot(i)}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <Button onClick={handleSave} className="w-full gap-2 mt-6 h-12">
                <Save className="w-4 h-4" /> Salvar Exceções para {format(date, 'dd/MM')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
