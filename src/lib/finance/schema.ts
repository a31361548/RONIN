import { z } from 'zod'
import { normalizeMoney, moneyToCents } from './money'
import { isHistoryRecord } from './history'

export const categories = { food: '餐飲', transport: '交通', gifts: '人情禮金', entertainment: '娛樂', family_support: '孝親費', daily_goods: '日用品', telecom: '通訊費', sports_leisure: '運動休閒', healthcare: '醫療保健' } as const
export const accounts = { cathay: '國泰', ctbc: '中國信託', cash: '現金錢包' } as const
export const entityLabels = { income: '收入', expense: '支出', credit_card_transaction: '信用卡', cash_movement: '資金異動' } as const
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => { const d = new Date(`${value}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value }, '日期不正確')
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, '金額最多兩位小數').transform(normalizeMoney)
const positiveMoney = money.refine((value) => moneyToCents(value) > 0, '金額必須大於零')
const signedMoney = z.string().regex(/^-?\d{1,10}(\.\d{1,2})?$/).transform(normalizeMoney)
const account = z.enum(['cathay', 'ctbc'])
const category = z.enum(['food', 'transport', 'gifts', 'entertainment', 'family_support', 'daily_goods', 'telecom', 'sports_leisure', 'healthcare'])
const text = z.string().trim().min(1).max(200)
const notes = z.string().max(4000).nullable()
const uuid = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })

const income = z.object({ receivedDate: date, incomeType: z.enum(['salary', 'other']), item: text, amount: positiveMoney, accountId: account, isRecurring: z.boolean(), notes }).strict()
const expense = z.object({ expenseDate: date, categoryCode: category, item: text, personalAmount: money, paymentMethod: z.enum(['cash', 'bank_transfer', 'credit_card']), accountId: z.enum(['cathay', 'ctbc', 'cash']).nullable(), isFixed: z.boolean(), notes, creditCardTransactionClientId: uuid.nullable() }).strict()
const card = z.object({ cardId: z.literal('CUBE-9539'), purchaseDate: date, postingDate: date.nullable(), consumptionDate: date, statementMonth: month.nullable(), purpose: text, usageDate: date.nullable(), usageHours: money.nullable(), grossAmount: positiveMoney, reimbursementReceivedAmount: money, pointsOffsetAmount: z.literal('0.00'), personalAmount: money.nullable(), status: z.enum(['pending', 'settled', 'cancelled']), expenseClientId: uuid.nullable(), notes }).strict()
const movement = z.object({ movementDate: date, accountId: account, movementType: z.enum(['credit_card_payment', 'family_advance_repayment']), amount: positiveMoney, balanceAfter: signedMoney.nullable(), notes, cardId: z.literal('CUBE-9539').nullable(), statementMonth: month.nullable() }).strict()

export const recordDataSchema = z.discriminatedUnion('entityType', [
  z.object({ entityType: z.literal('income'), payload: income }).strict(),
  z.object({ entityType: z.literal('expense'), payload: expense }).strict(),
  z.object({ entityType: z.literal('credit_card_transaction'), payload: card }).strict(),
  z.object({ entityType: z.literal('cash_movement'), payload: movement }).strict(),
]).superRefine((record, context) => {
  const invalid = (message: string): void => context.addIssue({ code: z.ZodIssueCode.custom, message })
  if (record.entityType === 'expense') {
    const p = record.payload
    if (p.paymentMethod !== 'credit_card' && (!p.accountId || p.creditCardTransactionClientId !== null)) invalid('請確認支付帳戶與信用卡連結')
    if (p.accountId === 'cash' && p.paymentMethod !== 'cash') invalid('現金錢包只能搭配現金付款')
    if (p.paymentMethod !== 'credit_card' && moneyToCents(p.personalAmount) === 0) invalid('現金或轉帳支出必須大於零')
  }
  if (record.entityType === 'credit_card_transaction') {
    const p = record.payload
    const personal = moneyToCents(p.grossAmount) - moneyToCents(p.reimbursementReceivedAmount)
    if (personal < 0) invalid('實收回補不能大於實刷金額')
    if (p.status === 'settled' ? !p.expenseClientId || p.personalAmount === null || moneyToCents(p.personalAmount) !== personal : p.expenseClientId !== null || p.personalAmount !== null) invalid('結算的個人負擔與關聯支出不一致')
  }
  if (record.entityType === 'cash_movement' && record.payload.movementType === 'credit_card_payment' && !record.payload.cardId) invalid('卡費繳款需要指定卡片')
})

export type RecordData = z.infer<typeof recordDataSchema>
export function usesCashWallet(record: RecordData): boolean { return record.entityType === 'expense' && record.payload.accountId === 'cash' }
// Keep legacy v1 immutable; wallet support is explicit in v2.
export const exchangeRecordSchema = recordDataSchema.refine((record) => !usesCashWallet(record), 'Excel 交換第一版尚未支援現金錢包，紀錄保留待同步')
export function exchangeSchema(version: 1 | 2): typeof recordDataSchema | typeof exchangeRecordSchema { return version === 1 ? exchangeRecordSchema : recordDataSchema }
export const changeSchema = z.object({ changeId: uuid, clientId: uuid, clientRevision: z.number().int().min(1), baseMasterRevision: z.number().int().min(1).nullable(), baseMasterHash: z.string().regex(/^sha256:[a-f0-9]{64}$/).nullable(), operation: z.enum(['upsert', 'delete']), clientCreatedAt: timestamp, clientUpdatedAt: timestamp, deletedAt: timestamp.nullable() }).strict()
export type Change = z.infer<typeof changeSchema> & RecordData
export const exportSchema = z.object({ schemaVersion: z.union([z.literal(1), z.literal(2)]), fileType: z.literal('finance-changes'), appId: z.literal('riyue'), datasetId: uuid, batchId: uuid, exportedAt: timestamp, timezone: z.literal('Asia/Taipei'), records: z.array(z.unknown()).min(1).max(1000) }).strict()

const issue = z.object({ code: z.string().min(1), field: z.string().nullable(), message: z.string().min(1) }).strict()
export const resultSchema = z.object({
  changeId: uuid, clientId: uuid, entityType: z.enum(['income', 'expense', 'credit_card_transaction', 'cash_movement']), submittedClientRevision: z.number().int().min(1),
  status: z.enum(['applied', 'unchanged', 'rejected', 'conflict', 'not_applied']),
  masterId: z.string().min(1).nullable(), masterRevision: z.number().int().min(1).nullable(), masterHash: z.string().regex(/^sha256:[a-f0-9]{64}$/).nullable(), recordedDate: date.nullable(), canonicalPayload: z.unknown().refine((value) => value !== undefined, '需明確提供 canonicalPayload 或 null'),
  errors: z.array(issue).max(50), warnings: z.array(issue).max(50),
}).strict()
export const returnSchema = z.object({ schemaVersion: z.union([z.literal(1), z.literal(2)]), fileType: z.literal('finance-results'), appId: z.literal('riyue'), timezone: z.literal('Asia/Taipei'), datasetId: uuid, batchId: uuid, resultId: uuid, processedAt: timestamp, batchStatus: z.enum(['committed', 'rejected', 'recovery_required']), results: z.array(resultSchema).min(1).max(1000), masterChanges: z.array(z.unknown()).max(0), monthlySummaries: z.array(z.unknown()).max(0) }).strict()
export type ReturnFile = z.infer<typeof returnSchema>
export type SyncResult = z.infer<typeof resultSchema>

export type FinanceRecord = RecordData & { id: string; localCategoryId?: string | null; revision: number; exportedRevision: number; syncedRevision: number; syncError: string | null; deleted: boolean; createdAt: string; updatedAt: string; changeId: string; masterRevision: number | null; masterHash: string | null; recordedDate: string | null; serverShadow: unknown; sourceRefs: unknown }
export type FinanceExport = Omit<z.infer<typeof exportSchema>, 'records'> & { records: Change[] }

export function recordDate(record: RecordData): string {
  switch (record.entityType) {
    case 'income': return record.payload.receivedDate
    case 'expense': return record.payload.expenseDate
    case 'credit_card_transaction': return record.payload.consumptionDate
    case 'cash_movement': return record.payload.movementDate
  }
}
export function recordTitle(record: RecordData): string {
  if (record.entityType === 'credit_card_transaction') return record.payload.purpose
  if (record.entityType === 'cash_movement') return record.payload.movementType === 'credit_card_payment' ? '信用卡繳款' : '家人代墊償還'
  return record.payload.item
}
export function recordAmount(record: RecordData): string {
  if (record.entityType === 'credit_card_transaction') return record.payload.grossAmount
  if (record.entityType === 'expense') return record.payload.personalAmount
  return record.payload.amount
}

export function validateLinks(records: Array<RecordData & { id: string; deleted?: boolean; sourceRefs?: unknown }>): void {
  const active = records.filter((record) => !record.deleted)
  for (const record of active) {
    if (record.entityType === 'credit_card_transaction' && record.payload.status === 'settled') {
      const expenseRecord = active.find((entry) => entry.id === record.payload.expenseClientId)
      if (!expenseRecord || expenseRecord.entityType !== 'expense' || expenseRecord.payload.creditCardTransactionClientId !== record.id || expenseRecord.payload.personalAmount !== record.payload.personalAmount || expenseRecord.payload.expenseDate !== record.payload.consumptionDate || expenseRecord.payload.paymentMethod !== 'credit_card') throw new Error('信用卡結算與支出必須雙向連結、金額及消費日一致')
    }
    if (record.entityType === 'expense' && record.payload.paymentMethod === 'credit_card') {
      if (!record.payload.creditCardTransactionClientId && isHistoryRecord(record)) continue
      const cardRecord = active.find((entry) => entry.id === record.payload.creditCardTransactionClientId)
      if (!cardRecord || cardRecord.entityType !== 'credit_card_transaction' || cardRecord.payload.status !== 'settled' || cardRecord.payload.expenseClientId !== record.id) throw new Error('刷卡支出必須連結唯一的已結算交易')
    }
  }
}

export function monthlyTotals(records: FinanceRecord[], monthKey: string): { income: number; expense: number; fixed: number; movement: number; pendingCard: number; categories: Record<string, number> } {
  const totals = { income: 0, expense: 0, fixed: 0, movement: 0, pendingCard: 0, categories: {} as Record<string, number> }
  for (const record of records.filter((entry) => !entry.deleted && recordDate(entry).startsWith(monthKey))) {
    const amount = moneyToCents(recordAmount(record))
    if (record.entityType === 'income') totals.income += amount
    if (record.entityType === 'expense') { totals.expense += amount; if (record.payload.isFixed) totals.fixed += amount; totals.categories[record.payload.categoryCode] = (totals.categories[record.payload.categoryCode] ?? 0) + amount }
    if (record.entityType === 'cash_movement') totals.movement += amount
    if (record.entityType === 'credit_card_transaction' && record.payload.status === 'pending') totals.pendingCard += amount
  }
  return totals
}
