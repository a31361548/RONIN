import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { prisma } from '@/lib/prisma'
import { recordDataSchema, validateLinks } from '@/lib/finance/schema'
import { jsonValue, serializeEntry } from '@/lib/finance/store'

const saveSchema = z.object({ records: z.array(z.object({ clientId: z.string().uuid(), expectedRevision: z.number().int().min(0), record: recordDataSchema }).strict()).min(1).max(2) }).strict()
export async function GET(): Promise<NextResponse> {
  const user = await getAuthenticatedUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  const [entries, ledger, batches] = await Promise.all([
    prisma.financeEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
    prisma.financeLedger.findUnique({ where: { userId: user.id } }),
    prisma.financeBatch.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, createdAt: true } }),
  ])
  return NextResponse.json({ records: entries.map(serializeEntry), datasetId: ledger?.id ?? null, batches })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getAuthenticatedUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  const parsed = saveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '資料不正確' }, { status: 400 })
  if (new Set(parsed.data.records.map((record) => record.clientId)).size !== parsed.data.records.length) return new NextResponse('重複紀錄 ID', { status: 400 })
  try {
    const records = await prisma.$transaction(async (tx) => {
      const all = await tx.financeEntry.findMany({ where: { userId: user.id } })
      const candidates = new Map(all.map((entry) => [entry.id, serializeEntry(entry)]))
      for (const input of parsed.data.records) {
        const old = candidates.get(input.clientId)
        if (old ? old.revision !== input.expectedRevision || old.deleted || old.serverShadow !== null || old.entityType !== input.record.entityType : input.expectedRevision !== 0) throw new Error('紀錄版本已改變、已刪除或有待解決衝突，請重新載入')
        if (old?.entityType === 'credit_card_transaction' && old.payload.status === 'settled' && input.record.entityType === 'credit_card_transaction' && input.record.payload.status !== 'settled') throw new Error('已結算交易不能改回待結算或取消；退款與沖銷留待後續版本')
        candidates.set(input.clientId, { ...old, ...input.record, id: input.clientId, deleted: false } as ReturnType<typeof serializeEntry>)
      }
      validateLinks(Array.from(candidates.values()))
      const saved = []
      for (const input of parsed.data.records) {
        const old = all.find((entry) => entry.id === input.clientId)
        if (old) {
          const updated = await tx.financeEntry.updateMany({ where: { id: old.id, userId: user.id, revision: input.expectedRevision }, data: { data: jsonValue(input.record.payload), revision: { increment: 1 }, changeId: randomUUID(), syncError: null } })
          if (updated.count !== 1) throw new Error('紀錄已被其他操作修改，請重新載入')
          const result = await tx.financeEntry.findUniqueOrThrow({ where: { id: old.id } })
          saved.push(serializeEntry(result))
        } else {
          const result = await tx.financeEntry.create({ data: { id: input.clientId, userId: user.id, kind: input.record.entityType, data: jsonValue(input.record.payload) } })
          saved.push(serializeEntry(result))
        }
      }
      return saved
    })
    return NextResponse.json({ records }, { status: 201 })
  } catch (error) {
    const message = error instanceof Prisma.PrismaClientKnownRequestError ? '資料發生競爭或 ID 已存在，請重新載入再試' : error instanceof Error ? error.message : '儲存失敗'
    return NextResponse.json({ error: message }, { status: 409 })
  }
}
