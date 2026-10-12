import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { z } from 'zod'
import { noteScheduleFields, validNoteSchedule } from '@/lib/noteScheduleSchema'

const UpdateNoteSchema = z.object({
  title: z.string().trim().min(1).optional(),
  content: z.string().optional(),
  tagIds: z.array(z.string()).optional(),
  ...noteScheduleFields,
})

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const user = await getAuthenticatedUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  const { id } = await params
  const note = await prisma.note.findUnique({ where: { id } })
  if (!note || note.userId !== user.id) return new NextResponse('Not Found', { status: 404 })
  return NextResponse.json({ note })
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const user = await getAuthenticatedUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  const { id } = await params
  const parsed = UpdateNoteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return new NextResponse('Invalid data', { status: 400 })
  const note = await prisma.note.findUnique({ where: { id } })
  if (!note || note.userId !== user.id) return new NextResponse('Not Found', { status: 404 })
  if (!validNoteSchedule({ ...note, ...parsed.data })) return new NextResponse('請確認行程日期與開始、結束時間', { status: 400 })
  const updatedNote = await prisma.note.update({ where: { id }, data: parsed.data })
  return NextResponse.json({ note: updatedNote })
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const user = await getAuthenticatedUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  const { id } = await params
  const note = await prisma.note.findUnique({ where: { id } })
  if (!note || note.userId !== user.id) return new NextResponse('Not Found', { status: 404 })
  await prisma.note.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
