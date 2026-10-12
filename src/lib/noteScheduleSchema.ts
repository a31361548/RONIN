import { z } from 'zod'

export const noteScheduleFields = {
  noteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  }, '日期不正確').nullable().optional(),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
}

export function validNoteSchedule(value: { noteDate?: string | null; startAt?: string | Date | null; endAt?: string | Date | null }): boolean {
  if (!value.startAt && !value.endAt) return true
  if (!value.noteDate || !value.startAt || !value.endAt) return false
  return new Date(value.endAt) > new Date(value.startAt)
}
