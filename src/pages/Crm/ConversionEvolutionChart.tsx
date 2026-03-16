import { useState, useMemo } from 'react'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConversionHistory } from '@/lib/types'

interface Props {
  data: ConversionHistory[]
}

const ALL_MONTHS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

export function ConversionEvolutionChart({ data }: Props) {
  const currentYear = new Date().getFullYear().toString()
  const [selectedYear, setSelectedYear] = useState<string>(currentYear)

  const availableYears = useMemo(() => {
    const years = Array.from(new Set(data.map((d) => d.year)))
    if (years.length === 0) return [currentYear]
    return years.sort((a, b) => b - a).map(String)
  }, [data, currentYear])

  const chartData = useMemo(() => {
    const yearData = data.filter((d) => String(d.year) === selectedYear)
    return ALL_MONTHS.map((month) => {
      const found = yearData.find((d) => d.month === month)
      return {
        month,
        conversões: found ? found.count : 0,
      }
    })
  }, [data, selectedYear])

  if (data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground border rounded-md border-dashed">
        Nenhum histórico de conversões disponível para exibição.
      </div>
    )
  }

  const chartConfig = {
    conversões: { label: 'Conversões', color: 'hsl(var(--primary))' },
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {availableYears.map((year) => (
              <SelectItem key={year} value={year}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="h-[300px] w-full">
        <ChartContainer config={chartConfig} className="h-full w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              <Line
                type="monotone"
                dataKey="conversões"
                stroke="var(--color-conversões)"
                strokeWidth={3}
                dot={{ r: 4, fill: 'var(--color-conversões)' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    </div>
  )
}
