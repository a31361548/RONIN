export type DatePickerMode = 'date' | 'month'

export function utcDate(year: number, month: number, day = 1): Date {
  const date = new Date(0)
  date.setUTCFullYear(year, month, day)
  date.setUTCHours(0, 0, 0, 0)
  return date
}

export function parsePickerValue(value: string, mode: DatePickerMode): Date | null {
  if (!(mode === 'month' ? /^\d{4}-(0[1-9]|1[0-2])$/ : /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/).test(value)) return null
  const [year, month, day = 1] = value.split('-').map(Number)
  const date = utcDate(year, month - 1, day)
  return date.toISOString().slice(0, mode === 'month' ? 7 : 10) === value ? date : null
}

export function pickerValue(date: Date, mode: DatePickerMode): string { return date.toISOString().slice(0, mode === 'month' ? 7 : 10) }

export function pickerLabel(value: string, mode: DatePickerMode): string {
  const date = parsePickerValue(value, mode)
  return date ? `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${mode === 'date' ? `${date.getUTCDate()}日` : ''}` : ''
}

export function calendarDays(year: number, month: number): Date[] {
  const first = utcDate(year, month)
  return Array.from({ length: 42 }, (_, index) => utcDate(year, month, 1 - first.getUTCDay() + index))
}

export function shiftPickerMonth(date: Date, offset: number): Date {
  const first = utcDate(date.getUTCFullYear(), date.getUTCMonth() + offset)
  const lastDay = utcDate(first.getUTCFullYear(), first.getUTCMonth() + 1, 0).getUTCDate()
  return utcDate(first.getUTCFullYear(), first.getUTCMonth(), Math.min(date.getUTCDate(), lastDay))
}
