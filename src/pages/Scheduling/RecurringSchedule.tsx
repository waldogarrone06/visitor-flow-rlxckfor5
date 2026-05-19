import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2, Plus, Save } from 'lucide-react'
import { getSchedule, saveSchedule } from '@/services/settings'
import { toast } from '@/hooks/use-toast'

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export function RecurringSchedule() {
  const [slots, setSlots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSchedule().then((data) => {
      setSlots(data)
      setLoading(false)
    })
  }, [])

  const addSlot = (day: number) => {
    setSlots([
      ...slots,
      {
        day_of_week: day,
        start_time: '08:00',
        end_time: '09:00',
        slot_type: 'Prescritor Exclusivo',
      },
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
    await saveSchedule(slots)
    toast({ title: 'Sucesso', description: 'Grade recorrente semanal salva com sucesso.' })
  }

  if (loading)
    return <div className="p-8 text-center text-muted-foreground">Carregando horários...</div>

  return (
    <Card className="shadow-subtle border-border/50 animate-fade-in-up">
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <CardTitle className="text-xl">Grade Recorrente Semanal</CardTitle>
          <CardDescription>
            Configure sua disponibilidade padrão para cada dia da semana.
          </CardDescription>
        </div>
        <Button onClick={handleSave} className="gap-2 w-full sm:w-auto">
          <Save className="w-4 h-4" /> Salvar Grade Semanal
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {DAYS.map((dayName, dayIndex) => {
          const daySlots = slots
            .map((s, i) => ({ ...s, originalIndex: i }))
            .filter((s) => s.day_of_week === dayIndex)

          return (
            <div key={dayIndex} className="space-y-4 border-b pb-6 last:border-0">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">{dayName}</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addSlot(dayIndex)}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" /> Adicionar Horário
                </Button>
              </div>
              {daySlots.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  Nenhum horário configurado. O dia ficará fechado.
                </p>
              ) : (
                <div className="space-y-3 mt-2">
                  {daySlots.map((slot) => (
                    <div key={slot.originalIndex} className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={slot.start_time}
                          onChange={(e) =>
                            updateSlot(slot.originalIndex, 'start_time', e.target.value)
                          }
                          className="w-28 sm:w-32"
                        />
                        <span className="text-sm text-muted-foreground">até</span>
                        <Input
                          type="time"
                          value={slot.end_time}
                          onChange={(e) =>
                            updateSlot(slot.originalIndex, 'end_time', e.target.value)
                          }
                          className="w-28 sm:w-32"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSlot(slot.originalIndex)}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
