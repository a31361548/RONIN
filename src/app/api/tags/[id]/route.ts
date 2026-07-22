import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/currentUser'

type RouteContext = { params: Promise<{ id: string }> }

const TagSchema = z.object({
  name: z.string().trim().min(1).max(24).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
})

const getTag = async (userId: string, id: string) => prisma.tag.findFirst({ where: { id, userId } })

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return new NextResponse('未授權', { status: 401 })
  const { id } = await context.params
  const parsed = TagSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return new NextResponse('標籤格式錯誤', { status: 400 })
  const tag = await getTag(user.id, id)
  if (!tag) return new NextResponse('找不到標籤', { status: 404 })
  if (parsed.data.name && parsed.data.name !== tag.name) {
    const duplicate = await prisma.tag.findFirst({ where: { userId: user.id, name: parsed.data.name, id: { not: id } } })
    if (duplicate) return new NextResponse('這個標籤已經存在', { status: 409 })
  }
  const nextTag = await prisma.tag.update({ where: { id }, data: parsed.data })
  return NextResponse.json({ tag: nextTag })
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return new NextResponse('未授權', { status: 401 })
  const { id } = await context.params
  const tag = await getTag(user.id, id)
  if (!tag) return new NextResponse('找不到標籤', { status: 404 })

  const [notes, todos] = await Promise.all([
    prisma.note.findMany({ where: { userId: user.id, tagIds: { has: id } }, select: { id: true, tagIds: true } }),
    prisma.todo.findMany({ where: { userId: user.id, tagIds: { has: id } }, select: { id: true, tagIds: true } }),
  ])
  const url = new URL(request.url)
  const force = url.searchParams.get('force') === 'true'
  if (!force && (notes.length > 0 || todos.length > 0)) {
    return NextResponse.json({ noteCount: notes.length, todoCount: todos.length }, { status: 409 })
  }

  await prisma.$transaction([
    ...notes.map((note) => prisma.note.update({ where: { id: note.id }, data: { tagIds: note.tagIds.filter((tagId) => tagId !== id) } })),
    ...todos.map((todo) => prisma.todo.update({ where: { id: todo.id }, data: { tagIds: todo.tagIds.filter((tagId) => tagId !== id) } })),
    prisma.tag.delete({ where: { id } }),
  ])
  return new Response(null, { status: 204 })
}
