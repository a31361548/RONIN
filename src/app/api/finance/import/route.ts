import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { returnSchema } from '@/lib/finance/schema'
import { payloadHash, previewReturn, success } from '@/lib/finance/sync'
import { jsonValue, receiptSchema, serializeEntry, serializeExport } from '@/lib/finance/store'

const requestSchema = z.object({ mode: z.enum(['preview', 'apply']), file: returnSchema }).strict()
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getAuthenticatedUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > 5_000_000) return new NextResponse('檔案超過 5 MB', { status: 413 })
  const parsed = requestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '回匯格式不正確' }, { status: 400 })
  const { mode, file } = parsed.data
  try {
    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.financeBatch.findFirst({ where: { id: file.batchId, userId: user.id } })
      if (!batch) throw new Error('找不到屬於你的匯出批次')
      const receipts = receiptSchema.parse(batch.receipts)
      const hash = payloadHash(file)
      if (receipts.files[file.resultId]) {
        if (receipts.files[file.resultId] !== hash) throw new Error('相同回匯 ID 的內容被改變，拒絕套用')
        return { alreadyApplied: true, rows: [], conflict: false }
      }
      if (receipts.recoveryRequired) throw new Error('此批次待人工恢復；恢復回執的替代規則尚未對齊，第一版維持封鎖，請交由帳本管理對話核對')
      if (receipts.committed) throw new Error('此批次已有成功回匯，請使用新的匯出批次')
      const entries = (await tx.financeEntry.findMany({ where: { userId: user.id } })).map(serializeEntry)
      const preview = previewReturn(serializeExport(batch), file, entries)
      if (mode === 'preview') return { alreadyApplied: false, ...preview }
      for (const item of file.results) {
        const local = entries.find((entry) => entry.id === item.clientId)
        if (!local) throw new Error('找不到紀錄')
        const data: Prisma.FinanceEntryUpdateManyMutationInput = item.status === 'conflict' && item.canonicalPayload !== null
          ? { serverShadow: jsonValue(item), syncError: preview.rows.find((row) => row.id === local.id)?.message, updatedAt: new Date(local.updatedAt) }
          : success(item) ? preview.conflict
          ? { serverShadow: jsonValue(item), syncError: '回匯與網站版本有衝突，請選擇保留網站或採用 Excel', updatedAt: new Date(local.updatedAt) }
          : { data: jsonValue(item.canonicalPayload), syncedRevision: item.submittedClientRevision, masterRevision: item.masterRevision, masterHash: item.masterHash, recordedDate: item.recordedDate, sourceRefs: { masterId: item.masterId }, serverShadow: null, changeId: randomUUID(), syncError: null, updatedAt: new Date(local.updatedAt) }
          : { syncError: preview.rows.find((row) => row.id === local.id)?.message ?? '尚未同步', updatedAt: new Date(local.updatedAt) }
        const updated = await tx.financeEntry.updateMany({ where: { id: local.id, userId: user.id, revision: local.revision, changeId: local.changeId }, data })
        if (updated.count !== 1) throw new Error('套用時紀錄又被修改，請重新預覽')
      }
      await tx.financeBatch.update({ where: { id: batch.id }, data: { receipts: jsonValue({ files: { ...receipts.files, [file.resultId]: hash }, committed: file.batchStatus === 'committed', recoveryRequired: file.batchStatus === 'recovery_required' }) } })
      return { alreadyApplied: false, ...preview }
    }, { maxWait: 10_000, timeout: 60_000 })
    return NextResponse.json(result)
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '回匯失敗' }, { status: 409 }) }
}
