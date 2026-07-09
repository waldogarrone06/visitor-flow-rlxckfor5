import { DateRange } from 'react-day-picker'
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths } from 'date-fns'

export type DateFilterType = 'current_month' | 'last_month' | 'current_year' | 'all'

export const dateFilterLabels: Record<DateFilterType, string> = {
  current_month: 'Mês Atual',
  last_month: 'Mês Passado',
  current_year: 'Este Ano',
  all: 'Tudo',
}

export function getDateRangeFromFilter(filter: DateFilterType): DateRange | undefined {
  const now = new Date()

  switch (filter) {
    case 'current_month':
      return { from: startOfMonth(now), to: endOfMonth(now) }
    case 'last_month': {
      const lastMonth = subMonths(now, 1)
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) }
    }
    case 'current_year':
      return { from: startOfYear(now), to: endOfYear(now) }
    case 'all':
      return undefined
    default:
      return undefined
  }
}
