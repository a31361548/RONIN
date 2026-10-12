import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { z } from 'zod'
import { noteScheduleFields, validNoteSchedule } from '@/lib/noteScheduleSchema'

const CreateNoteSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().optional(),
  tagIds: z.array(z.string()).default([]),
  ...noteScheduleFields,
})

export async function GET(_req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const notes = await prisma.note.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ notes })
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const parsed = CreateNoteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return new NextResponse('Invalid data', { status: 400 })

  if (!validNoteSchedule(parsed.data)) return new NextResponse('請確認行程日期與開始、結束時間', { status: 400 })

  const note = await prisma.note.create({
    data: {
      title: parsed.data.title,
      content: parsed.data.content || '',
      tagIds: parsed.data.tagIds,
      noteDate: parsed.data.noteDate ?? null,
      startAt: parsed.data.startAt ? new Date(parsed.data.startAt) : null,
      endAt: parsed.data.endAt ? new Date(parsed.data.endAt) : null,
      userId: user.id,
    },
  })

  return NextResponse.json({ id: note.id, note }, { status: 201 })
}
