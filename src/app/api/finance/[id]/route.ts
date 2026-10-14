import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { recordDataSchema, resultSchema, validateLinks } from '@/lib/finance/schema'
import { batchInfo, jsonValue, serializeEntry } from '@/lib/finance/store'
import { historySummaries, isHistoryRecord } from '@/lib/finance/history'
import { incomeMatchesSummary, incomeReview, incomeReviewBlockReason, incomeSummary } from '@/lib/finance/income-review'

const actionSchema = z.union([
  z.object({ action: z.enum(['delete', 'restore', 'keep-local', 'use-master', 'clear-income-review']), expectedRevision: z.number().int().min(1) }).strict(),
  z.object({ action: z.enum(['income-included', 'income-separate']), expectedRevision: z.number().int().min(1), summaryHash: z.string().min(1), note: z.string().trim().min(1).max(1000) }).strict(),
])
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
      if (isHistoryRecord(record)) throw new Error('Excel 歷史副本請在正式帳本修改後重新匯入，不能從網站標記正式刪除')
      const { action } = parsed.data
      if (action === 'income-included' || action === 'income-separate' || action === 'clear-income-review') {
        if (record.entityType !== 'income' || record.deleted) throw new Error('只能核對未刪除的網站收入')
        const reviewBatches = await tx.financeBatch.findMany({ where: { userId: user.id } })
        const blocked = incomeReviewBlockReason(record, reviewBatches.flatMap((batch) => { const info = batchInfo(batch); return info ? [info] : [] }))
        if (blocked) throw new Error(blocked)
        const source: Record<string, unknown> = record.sourceRefs && typeof record.sourceRefs === 'object' && !Array.isArray(record.sourceRefs) ? { ...record.sourceRefs } : {}
        if (action === 'clear-income-review') {
          if (!incomeReview(record)) throw new Error('沒有可撤回的收入核對')
          delete source.incomeReview
        } else {
          if (!('summaryHash' in parsed.data)) throw new Error('缺少收入核對資料')
          const summaries = historySummaries(reviewBatches.map((batch) => batch.payload))
          const summary = incomeSummary(record, summaries)
          if (!summary || summary.sourceHash !== parsed.data.summaryHash) throw new Error('Excel 月收入已改變，請重新載入再核對')
          if (action === 'income-included' && !incomeMatchesSummary(record, summary)) throw new Error('收入分類或金額與 Excel 月收入不一致，不能確認為同一筆')
          if (action === 'income-separate' && !incomeMatchesSummary(record, summary) && !incomeReview(record)) throw new Error('沒有需要核對的收入')
          if (action === 'income-included' && all.some((item) => item.id !== record.id && !item.deleted && incomeReview(item)?.decision === 'included' && item.entityType === 'income' && item.payload.incomeType === record.payload.incomeType && item.payload.receivedDate.slice(0, 7) === summary.month)) throw new Error('已有另一筆收入確認包含在這個月的同類收入，請先核對那筆紀錄')
          source.incomeReview = { decision: action === 'income-included' ? 'included' : 'separate', month: summary.month, summaryHash: summary.sourceHash, reviewedRevision: record.revision + 1, note: parsed.data.note, reviewedAt: new Date().toISOString() }
        }
        const updated = await tx.financeEntry.updateMany({ where: { id: record.id, userId: user.id, revision: record.revision, changeId: record.changeId, exportedRevision: record.exportedRevision }, data: { sourceRefs: jsonValue(source), revision: { increment: 1 }, changeId: randomUUID() } })
        if (updated.count !== 1) throw new Error('收入已被修改或匯出，請重新載入')
        return [serializeEntry(await tx.financeEntry.findUniqueOrThrow({ where: { id: record.id } }))]
      }
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
