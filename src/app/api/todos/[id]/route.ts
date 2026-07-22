import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { RecurrenceType, TodoPriority, TodoStatus } from '@prisma/client'
import { z } from 'zod'
import { clampToFuture, ensureMinimumDuration, resolveAutoStatus, toDate } from '@/lib/todoTime'

const TodoUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
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

type RouteContext = { params: Promise<{ id: string }> }

const buildUpdatedTimeRange = (existingStart: Date, existingEnd: Date, start?: string, end?: string): { startAt: Date; endAt: Date } | null => {
  const now = new Date()
  const startAt = start ? toDate(start) : existingStart
  const endAt = end ? toDate(end) : existingEnd
  if (!startAt || !endAt) return null
  const nextStart = start ? clampToFuture(startAt, now) : startAt
  const nextEnd = ensureMinimumDuration(nextStart, endAt)
  return { startAt: nextStart, endAt: nextEnd }
}

const getTodoOrThrow = async (userId: string, id: string) => {
  const todo = await prisma.todo.findFirst({ where: { id, userId } })
  if (!todo) throw new Response('找不到待辦', { status: 404 })
  return todo
}

export async function GET(_: Request, context: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return new Response('未授權', { status: 401 })
  const { id } = await context.params
  try {
    const todo = await getTodoOrThrow(user.id, id)
    return new Response(JSON.stringify({ todo }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    if (error instanceof Response) return error
    return new Response('系統錯誤', { status: 500 })
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return new Response('未授權', { status: 401 })
  const { id } = await context.params
  const parsed = TodoUpdateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return new Response('資料格式錯誤', { status: 400 })
  try {
    const existing = await getTodoOrThrow(user.id, id)
    const timeRange = buildUpdatedTimeRange(existing.startAt, existing.endAt, parsed.data.startAt, parsed.data.endAt)
    if (!timeRange) return new Response('時間設定不正確', { status: 400 })
    const recurrenceEndAt = parsed.data.recurrenceEndAt !== undefined
      ? parsed.data.recurrenceEndAt ? new Date(parsed.data.recurrenceEndAt) : null
      : existing.recurrenceEndAt
    const todo = await prisma.todo.update({
      where: { id: existing.id },
      data: {
        title: parsed.data.title ?? existing.title,
        description: parsed.data.description ?? existing.description,
        status: resolveAutoStatus(parsed.data.status ?? existing.status, timeRange.startAt, timeRange.endAt) as TodoStatus,
        priority: parsed.data.priority ?? existing.priority,
        recurrence: parsed.data.recurrence ?? existing.recurrence,
        recurrenceInterval: parsed.data.recurrenceInterval ?? existing.recurrenceInterval,
        recurrenceEndAt,
        tagIds: parsed.data.tagIds ?? existing.tagIds,
        startAt: timeRange.startAt,
        endAt: timeRange.endAt,
      },
    })
    return new Response(JSON.stringify({ todo }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    if (error instanceof Response) return error
    return new Response('系統錯誤', { status: 500 })
  }
}

export async function DELETE(_: Request, context: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return new Response('未授權', { status: 401 })
  const { id } = await context.params
  try {
    const todo = await getTodoOrThrow(user.id, id)
    await prisma.todo.delete({ where: { id: todo.id } })
    return new Response(null, { status: 204 })
  } catch (error) {
    if (error instanceof Response) return error
    return new Response('系統錯誤', { status: 500 })
  }
}
