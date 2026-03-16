import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { DateRange } from 'react-day-picker'
import { isWithinInterval, startOfDay, endOfDay, isSameDay } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isDateInRange(dateString: string, range?: DateRange) {
  if (!range?.from) return true
  const date = new Date(dateString)
  if (range.to) {
    return isWithinInterval(date, {
      start: startOfDay(range.from),
      end: endOfDay(range.to),
    })
  }
  return isSameDay(date, range.from)
}

export function interpolateColor(color1: string, color2: string, factor: number) {
  const f = Math.max(0, Math.min(1, factor))
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 }
  }

  const c1 = hexToRgb(color1)
  const c2 = hexToRgb(color2)

  const r = Math.round(c1.r + f * (c2.r - c1.r))
  const g = Math.round(c1.g + f * (c2.g - c1.g))
  const b = Math.round(c1.b + f * (c2.b - c1.b))

  return `rgb(${r}, ${g}, ${b})`
}
