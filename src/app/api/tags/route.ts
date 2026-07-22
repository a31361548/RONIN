import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/currentUser'

const TagSchema = z.object({
  name: z.string().trim().min(1).max(24),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
})

export async function GET(): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return new NextResponse('未授權', { status: 401 })
  const tags = await prisma.tag.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } })
  return NextResponse.json({ tags })
}

export async function POST(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return new NextResponse('未授權', { status: 401 })
  const parsed = TagSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return new NextResponse('標籤名稱格式錯誤', { status: 400 })

  const existing = await prisma.tag.findFirst({ where: { userId: user.id, name: parsed.data.name } })
  if (existing) return new NextResponse('這個標籤已經存在', { status: 409 })

  const tag = await prisma.tag.create({
    data: { name: parsed.data.name, color: parsed.data.color ?? '#E98A7A', userId: user.id },
  })
  return NextResponse.json({ tag }, { status: 201 })
}
