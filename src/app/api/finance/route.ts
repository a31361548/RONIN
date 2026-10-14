import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { prisma } from '@/lib/prisma'
import { recordDataSchema, validateLinks } from '@/lib/finance/schema'
import { batchInfo, jsonValue, serializeEntry } from '@/lib/finance/store'
import { nextReminder, readPreferences } from '@/lib/finance/preferences'
import { recordDate } from '@/lib/finance/schema'
import { taipeiDate } from '@/lib/finance/money'
import { historySummaries, isHistoryRecord } from '@/lib/finance/history'

const saveSchema = z.object({ records: z.array(z.object({ clientId: z.string().uuid(), expectedRevision: z.number().int().min(0), record: recordDataSchema, localCategoryId: z.string().max(80).nullable().optional() }).strict()).min(1).max(2), templateId: z.string().max(80).optional(), expectedPreferencesRevision: z.number().int().min(0).optional() }).strict()
export async function GET(): Promise<NextResponse> {
  const user = await getAuthenticatedUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  const [entries, ledger, batches] = await Promise.all([
    prisma.financeEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
    prisma.financeLedger.findUnique({ where: { userId: user.id } }),
    prisma.financeBatch.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, payload: true, receipts: true } }),
  ])
  return NextResponse.json({ records: entries.map(serializeEntry), datasetId: ledger?.id ?? null, batches: batches.flatMap((batch) => { const info = batchInfo(batch); return info ? [info] : [] }), historySummaries: historySummaries(batches.map((batch) => batch.payload)), preferences: readPreferences(ledger?.preferences), preferencesRevision: ledger?.preferencesRevision ?? 0 })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getAuthenticatedUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  const parsed = saveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '資料不正確' }, { status: 400 })
  if (new Set(parsed.data.records.map((record) => record.clientId)).size !== parsed.data.records.length) return new NextResponse('重複紀錄 ID', { status: 400 })
  try {
    const records = await prisma.$transaction(async (tx) => {
      const ledger = await tx.financeLedger.findUnique({ where: { userId: user.id } })
      const preferences = readPreferences(ledger?.preferences)
      const all = await tx.financeEntry.findMany({ where: { userId: user.id } })
      const candidates = new Map(all.map((entry) => [entry.id, serializeEntry(entry)]))
      for (const input of parsed.data.records) {
        const old = candidates.get(input.clientId)
        if (old && isHistoryRecord(old)) throw new Error('Excel 歷史副本請在正式帳本修改後重新匯入；網站可複製新增另一筆')
        if (input.record.entityType === 'expense' && input.record.payload.paymentMethod === 'credit_card' && !input.record.payload.creditCardTransactionClientId) throw new Error('新增刷卡支出必須連結信用卡交易')
        if (input.record.entityType !== 'credit_card_transaction' && input.record.payload.accountId) {
          const inputAccountId = input.record.payload.accountId
          const account = preferences.accounts.find((item) => item.id === inputAccountId)
          if (!account?.active && (!old || old.entityType === 'credit_card_transaction' || old.payload.accountId !== account?.id)) throw new Error('帳戶已停用，請改用啟用的帳戶')
        }
        if (input.localCategoryId) {
          const category = preferences.categories.find((item) => item.id === input.localCategoryId)
          if (input.record.entityType !== 'expense' || !category || category.code !== input.record.payload.categoryCode || !category.active && old?.localCategoryId !== category.id) throw new Error('分類已停用或正式對應不一致，請重新載入')
        }
        if (old ? old.revision !== input.expectedRevision || old.deleted || old.serverShadow !== null || old.entityType !== input.record.entityType : input.expectedRevision !== 0) throw new Error('紀錄版本已改變、已刪除或有待解決衝突，請重新載入')
        if (old?.entityType === 'credit_card_transaction' && old.payload.status === 'settled' && input.record.entityType === 'credit_card_transaction' && input.record.payload.status !== 'settled') throw new Error('已結算交易不能改回待結算或取消；退款與沖銷留待後續版本')
        candidates.set(input.clientId, { ...old, ...input.record, id: input.clientId, deleted: false } as ReturnType<typeof serializeEntry>)
      }
      validateLinks(Array.from(candidates.values()))
      const saved = []
      for (const input of parsed.data.records) {
        const old = all.find((entry) => entry.id === input.clientId)
        if (old) {
          const updated = await tx.financeEntry.updateMany({ where: { id: old.id, userId: user.id, revision: input.expectedRevision }, data: { data: jsonValue(input.record.payload), localCategoryId: input.record.entityType === 'expense' ? input.localCategoryId === undefined ? old.localCategoryId : input.localCategoryId : null, revision: { increment: 1 }, changeId: randomUUID(), syncError: null } })
          if (updated.count !== 1) throw new Error('紀錄已被其他操作修改，請重新載入')
          const result = await tx.financeEntry.findUniqueOrThrow({ where: { id: old.id } })
          saved.push(serializeEntry(result))
        } else {
          const result = await tx.financeEntry.create({ data: { id: input.clientId, userId: user.id, kind: input.record.entityType, data: jsonValue(input.record.payload), localCategoryId: input.localCategoryId ?? null } })
          saved.push(serializeEntry(result))
        }
      }
      if (parsed.data.templateId) {
        const template = preferences.templates.find((item) => item.id === parsed.data.templateId && item.active)
        if (!ledger || !template || parsed.data.records.some((item) => item.expectedRevision !== 0) || parsed.data.records[0].record.entityType !== template.record.entityType || parsed.data.expectedPreferencesRevision !== (ledger.preferencesRevision ?? 0)) throw new Error('模板已改變，請重新載入後再入帳')
        if (template.repeat !== 'none') {
          const after = [taipeiDate(), recordDate(parsed.data.records[0].record)].sort()[1]
          template.nextDate = nextReminder(template, after)
          const updated = await tx.financeLedger.updateMany({ where: { id: ledger.id, userId: user.id, preferencesRevision: ledger.preferencesRevision }, data: { preferences: jsonValue(preferences), preferencesRevision: { increment: 1 } } })
          if (updated.count !== 1) throw new Error('模板已被其他分頁使用，請重新載入')
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
