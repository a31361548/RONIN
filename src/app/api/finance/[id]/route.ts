import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { recordDataSchema, resultSchema, validateLinks } from '@/lib/finance/schema'
import { jsonValue, serializeEntry } from '@/lib/finance/store'

const actionSchema = z.object({ action: z.enum(['delete', 'restore', 'keep-local', 'use-master']), expectedRevision: z.number().int().min(1) }).strict()
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getAuthenticatedUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return new NextResponse('Invalid ID', { status: 400 })
  const parsed = actionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return new NextResponse('Invalid data', { status: 400 })
  try {
    const result = await prisma.$transaction(async (tx) => {
      const all = (await tx.financeEntry.findMany({ where: { userId: user.id } })).map(serializeEntry)
      const record = all.find((entry) => entry.id === id)
      if (!record || record.revision !== parsed.data.expectedRevision) throw new Error('找不到紀錄或版本已改變')
      const linkedId = record.entityType === 'credit_card_transaction' ? record.payload.expenseClientId : record.entityType === 'expense' ? record.payload.creditCardTransactionClientId : null
      const group = all.filter((entry) => entry.id === id || entry.id === linkedId)
      const candidates = new Map(all.map((entry) => [entry.id, entry]))
      for (const item of group) {
        const { action } = parsed.data
        let update: Prisma.FinanceEntryUpdateManyMutationInput
        if (action === 'delete' || action === 'restore') {
          if (item.serverShadow !== null) throw new Error('請先解決回匯衝突')
          update = { deleted: action === 'delete', revision: { increment: 1 }, changeId: randomUUID(), syncError: null }
          candidates.set(item.id, { ...item, deleted: action === 'delete' })
        } else {
          if (item.serverShadow === null) {
            if (!group.some((entry) => entry.serverShadow !== null)) throw new Error('沒有待解決的回匯衝突')
            const updated = await tx.financeEntry.updateMany({ where: { id: item.id, userId: user.id, revision: item.revision }, data: { revision: { increment: 1 }, changeId: randomUUID(), syncError: null } })
            if (updated.count !== 1) throw new Error('紀錄已被修改')
            continue
          }
          const shadow = resultSchema.parse(item.serverShadow)
          if (!shadow.masterRevision || !shadow.masterHash || !shadow.masterId) throw new Error('正式回匯內容不完整')
          const canonical = recordDataSchema.parse({ entityType: item.entityType, payload: shadow.canonicalPayload })
          if (shadow.masterRevision < (item.masterRevision ?? 0)) throw new Error('回匯版本已過期')
          update = { masterRevision: shadow.masterRevision, masterHash: shadow.masterHash, recordedDate: shadow.recordedDate, sourceRefs: { masterId: shadow.masterId }, serverShadow: null, syncError: null, changeId: randomUUID(), revision: { increment: 1 }, syncedRevision: action === 'use-master' ? item.revision + 1 : shadow.submittedClientRevision }
          if (action === 'use-master') { update.data = jsonValue(canonical.payload); update.deleted = false; candidates.set(item.id, { ...item, ...canonical, deleted: false }) }
        }
        const updated = await tx.financeEntry.updateMany({ where: { id: item.id, userId: user.id, revision: item.revision }, data: update })
        if (updated.count !== 1) throw new Error('紀錄已被修改，請重新載入')
      }
      validateLinks(Array.from(candidates.values()))
      return (await tx.financeEntry.findMany({ where: { userId: user.id, id: { in: group.map((entry) => entry.id) } } })).map(serializeEntry)
    })
    return NextResponse.json({ records: result })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '操作失敗' }, { status: 409 }) }
}
