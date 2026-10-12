import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { type FinanceExport, recordDataSchema, validateLinks } from '@/lib/finance/schema'
import { jsonValue, receiptSchema, serializeEntry, serializeExport } from '@/lib/finance/store'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getAuthenticatedUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  const batchId = req.nextUrl.searchParams.get('batchId')
  if (!z.string().uuid().safeParse(batchId).success) return new NextResponse('Invalid batch', { status: 400 })
  const batch = await prisma.financeBatch.findFirst({ where: { id: batchId as string, userId: user.id } })
  if (!batch) return new NextResponse('Not Found', { status: 404 })
  return NextResponse.json(serializeExport(batch))
}

export async function POST(): Promise<NextResponse> {
  const user = await getAuthenticatedUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  try {
    const file = await prisma.$transaction(async (tx) => {
      const ledger = await tx.financeLedger.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} })
      const all = (await tx.financeEntry.findMany({ where: { userId: user.id } })).map(serializeEntry)
      const batches = await tx.financeBatch.findMany({ where: { userId: user.id }, select: { receipts: true } })
      if (batches.some((batch) => receiptSchema.parse(batch.receipts).recoveryRequired)) throw new Error('Excel 端仍有待人工恢復批次；第一版維持封鎖，請交由帳本管理對話核對，勿建立新批次')
      if (all.some((record) => record.serverShadow !== null)) throw new Error('請先解決回匯衝突，再匯出新批次')
      if (all.some((record) => record.syncError?.includes('RECOVERY_REQUIRED'))) throw new Error('Excel 端需要人工恢復，請先交由帳本管理對話核對，勿重送新批次')
      validateLinks(all)
      const pending = all.filter((record) => record.revision > record.syncedRevision).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      // Include both halves of a settled card even when one side is unchanged.
      const ids = new Set<string>()
      for (const record of pending) {
        const linkedId = record.entityType === 'credit_card_transaction' ? record.payload.expenseClientId : record.entityType === 'expense' ? record.payload.creditCardTransactionClientId : null
        const groupIds = linkedId ? [record.id, linkedId] : [record.id]
        if (ids.size + groupIds.filter((id) => !ids.has(id)).length > 100) continue
        groupIds.forEach((id) => ids.add(id))
      }
      const selected = all.filter((record) => ids.has(record.id))
      if (!selected.length) throw new Error('沒有待同步紀錄')
      const result: FinanceExport = { schemaVersion: 1, fileType: 'finance-changes', appId: 'riyue', datasetId: ledger.id, batchId: randomUUID(), exportedAt: new Date().toISOString(), timezone: 'Asia/Taipei', records: selected.map((record) => ({ ...recordDataSchema.parse({ entityType: record.entityType, payload: record.payload }), changeId: record.changeId, clientId: record.id, clientRevision: record.revision, baseMasterRevision: record.masterRevision, baseMasterHash: record.masterHash, operation: record.deleted ? 'delete' : 'upsert', clientCreatedAt: record.createdAt, clientUpdatedAt: record.updatedAt, deletedAt: record.deleted ? record.updatedAt : null })) }
      await tx.financeBatch.create({ data: { id: result.batchId, userId: user.id, payload: jsonValue(result), receipts: { files: {}, committed: false } } })
      for (const record of selected) {
        const updated = await tx.financeEntry.updateMany({ where: { id: record.id, userId: user.id, revision: record.revision }, data: { exportedRevision: record.revision, updatedAt: new Date(record.updatedAt) } })
        if (updated.count !== 1) throw new Error('匯出期間紀錄已修改，請再試一次')
      }
      return result
    }, { maxWait: 10_000, timeout: 60_000 })
    return NextResponse.json(file)
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '匯出失敗' }, { status: 409 }) }
}
