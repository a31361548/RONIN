import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { RecurrenceType, TodoPriority, TodoStatus } from '@prisma/client'
import { z } from 'zod'
import { clampToFuture, ensureMinimumDuration, resolveAutoStatus, toDate, DEFAULT_DURATION_MS } from '@/lib/todoTime'

const TodoPayloadSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  status: z.nativeEnum(TodoStatus).optional(),
  priority: z.nativeEnum(TodoPriority).optional(),
  recurrence: z.nativeEnum(RecurrenceType).optional(),
  recurrenceInterval: z.number().int().min(1).max(365).optional(),
  recurrenceEndAt: z.string().datetime().nullable().optional(),
  tagIds: z.array(z.string()).optional(),
})

const buildTimeRange = (start?: string, end?: string): { startAt: Date; endAt: Date } | null => {
  const now = new Date()
  const parsedStart = start ? toDate(start) : null
  if (start && !parsedStart) return null
  const startAt = clampToFuture(parsedStart ?? now, now)
  const parsedEnd = end ? toDate(end) : null
  if (end && !parsedEnd) return null
  const suggestedEnd = parsedEnd ?? new Date(startAt.getTime() + DEFAULT_DURATION_MS)
  const endAt = ensureMinimumDuration(startAt, suggestedEnd)
  return { startAt, endAt }
}

export async function GET(): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return new Response('未授權', { status: 401 })
  const todos = await prisma.todo.findMany({
    where: { userId: user.id },
    orderBy: [{ startAt: 'asc' }, { createdAt: 'desc' }],
  })
  return new Response(JSON.stringify({ todos }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

export async function POST(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return new Response('未授權', { status: 401 })
  const parsed = TodoPayloadSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return new Response('資料格式錯誤', { status: 400 })
  const timeRange = buildTimeRange(parsed.data.startAt, parsed.data.endAt)
  if (!timeRange) return new Response('時間設定不正確', { status: 400 })
  const recurrenceEndAt = parsed.data.recurrenceEndAt ? new Date(parsed.data.recurrenceEndAt) : null
  const resolvedStatus = resolveAutoStatus(parsed.data.status, timeRange.startAt, timeRange.endAt)
  const todo = await prisma.todo.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      status: resolvedStatus as TodoStatus,
      priority: parsed.data.priority ?? TodoPriority.MEDIUM,
      recurrence: parsed.data.recurrence ?? RecurrenceType.NONE,
      recurrenceInterval: parsed.data.recurrenceInterval ?? 1,
      recurrenceEndAt,
      tagIds: parsed.data.tagIds ?? [],
      startAt: timeRange.startAt,
      endAt: timeRange.endAt,
      userId: user.id,
    },
  })
  return new Response(JSON.stringify({ todo }), { status: 201, headers: { 'Content-Type': 'application/json' } })
}
