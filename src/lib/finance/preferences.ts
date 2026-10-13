import { z } from 'zod'
import { accounts, categories, recordDataSchema, recordDate, type FinanceRecord, type RecordData } from './schema'
import { moneyToCents, normalizeMoney, taipeiDate } from './money'

const categoryCode = z.enum(['food', 'transport', 'gifts', 'entertainment', 'family_support', 'daily_goods', 'telecom', 'sports_leisure', 'healthcare'])
const accountId = z.enum(['cathay', 'ctbc'])
const name = z.string().trim().min(1).max(40)
const identifier = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => { const parsed = new Date(`${value}T00:00:00Z`); return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value }, '日期不正確')
const budgetAmount = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, '預算最多兩位小數').transform(normalizeMoney)
const templateSchema = z.object({ id: identifier, name, record: recordDataSchema, localCategoryId: identifier.nullable(), repeat: z.enum(['none', 'weekly', 'monthly']), nextDate: date.nullable(), reminderDay: z.number().int().min(1).max(31).nullable().optional(), active: z.boolean() }).strict()
const rawPreferencesSchema = z.object({
  version: z.literal(1),
  categories: z.array(z.object({ id: identifier, name, code: categoryCode, parentId: identifier.nullable(), color: z.string().regex(/^#[a-fA-F0-9]{6}$/), icon: z.string().trim().min(1).max(8), active: z.boolean() }).strict()).min(1).max(100),
  accounts: z.array(z.object({ id: z.enum(['cathay', 'ctbc', 'cash']), name, active: z.boolean() }).strict()).length(3),
  cardName: name,
  defaults: z.object({ accountId, categoryId: identifier, paymentMethod: z.enum(['cash', 'bank_transfer']) }).strict(),
  templates: z.array(templateSchema).max(50),
  budgets: z.array(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), total: budgetAmount, categories: z.record(identifier, budgetAmount) }).strict()).max(120),
}).strict()

export const preferencesSchema = rawPreferencesSchema.superRefine((settings, context) => {
  const invalid = (message: string): void => context.addIssue({ code: z.ZodIssueCode.custom, message })
  const items = new Map(settings.categories.map((category) => [category.id, category]))
  if (items.size !== settings.categories.length || new Set(settings.templates.map((template) => template.id)).size !== settings.templates.length || new Set(settings.budgets.map((budget) => budget.month)).size !== settings.budgets.length) invalid('分類、模板或月份不可重複')
  if (new Set(settings.accounts.map((account) => account.id)).size !== 3) invalid('國泰、中信與現金錢包均需保留且不可重複')
  for (const code of Object.keys(categories)) if (items.get(code)?.code !== code || items.get(code)?.parentId !== null) invalid('正式分類需保留原有對應，可以改名或停用')
  for (const item of settings.categories) {
    const parent = item.parentId ? items.get(item.parentId) : null
    if (item.parentId && (!parent || parent.parentId || parent.code !== item.code || parent.id === item.id)) invalid('子分類需對應相同正式分類的主分類，最多兩層')
    if (item.active && parent && !parent.active) invalid('主分類停用時，請一併停用子分類')
  }
  if (!items.get(settings.defaults.categoryId)?.active || !settings.accounts.find((account) => account.id === settings.defaults.accountId)?.active) invalid('預設帳戶與分類必須啟用')
  for (const template of settings.templates) {
    if (template.repeat !== 'none' && !template.nextDate) invalid('重複模板需指定下次提醒日')
    const data = template.record
    if (data.entityType === 'expense' && data.payload.paymentMethod === 'credit_card' || data.entityType === 'credit_card_transaction' && data.payload.status !== 'pending') invalid('模板不可保留已結算信用卡連結')
    if (template.localCategoryId) {
      const item = items.get(template.localCategoryId)
      if (!item || data.entityType !== 'expense' || item.code !== data.payload.categoryCode) invalid('模板分類與正式分類不一致')
    }
  }
  for (const budget of settings.budgets) if (Object.keys(budget.categories).some((id) => !items.has(id))) invalid('預算分類不存在')
})

export type FinancePreferences = z.infer<typeof preferencesSchema>
export type FinanceTemplate = FinancePreferences['templates'][number]
export type LocalCategory = FinancePreferences['categories'][number]
export type PreferencesState = { preferences: FinancePreferences; preferencesRevision: number }

export function defaultPreferences(): FinancePreferences {
  return { version: 1, categories: Object.entries(categories).map(([code, label], index) => ({ id: code, code: code as keyof typeof categories, name: label, parentId: null, color: ['#df9587', '#7b9fa9', '#b58ead', '#c7a967', '#7eaa8a'][index % 5], icon: ['🍚', '🚆', '🎁', '🎬', '🏠', '🛍️', '📱', '🏃', '🩺'][index], active: true })), accounts: Object.entries(accounts).map(([id, label]) => ({ id: id as keyof typeof accounts, name: label, active: true })), cardName: '國泰 CUBE', defaults: { accountId: 'cathay', categoryId: 'food', paymentMethod: 'cash' }, templates: [], budgets: [] }
}

export function readPreferences(value: unknown): FinancePreferences {
  if (value === null || value === undefined) return defaultPreferences()
  if (typeof value === 'object' && !Array.isArray(value) && 'accounts' in value && Array.isArray(value.accounts) && value.accounts.length === 2) {
    const ids = value.accounts.map((item: unknown) => typeof item === 'object' && item !== null && 'id' in item ? item.id : null)
    if (ids.includes('cathay') && ids.includes('ctbc')) return preferencesSchema.parse({ ...value, accounts: [...value.accounts, { id: 'cash', name: '現金錢包', active: true }] })
  }
  return preferencesSchema.parse(value)
}

// A master correction may change the official code. Never keep a misleading local label.
export function categoryForRecord(record: FinanceRecord, settings: FinancePreferences): LocalCategory | undefined {
  if (record.entityType !== 'expense') return undefined
  const local = settings.categories.find((item) => item.id === record.localCategoryId && item.code === record.payload.categoryCode)
  return local ?? settings.categories.find((item) => item.id === record.payload.categoryCode && item.parentId === null)
}

export function templateRecord(record: RecordData): RecordData {
  if (record.entityType === 'credit_card_transaction') return { ...record, payload: { ...record.payload, status: 'pending', personalAmount: null, expenseClientId: null, reimbursementReceivedAmount: '0.00', postingDate: null, statementMonth: null, usageDate: null, usageHours: null } }
  if (record.entityType === 'expense') return { ...record, payload: { ...record.payload, paymentMethod: record.payload.paymentMethod === 'credit_card' ? 'cash' : record.payload.paymentMethod, creditCardTransactionClientId: null, accountId: record.payload.paymentMethod === 'bank_transfer' ? record.payload.accountId ?? 'cathay' : 'cash' } }
  if (record.entityType === 'cash_movement') return { ...record, payload: { ...record.payload, balanceAfter: null, statementMonth: null } }
  return record
}

export function nextReminder(template: FinanceTemplate, after: string): string | null {
  if (template.repeat === 'none' || !template.nextDate) return null
  const anchor = new Date(`${template.nextDate}T00:00:00Z`)
  if (template.repeat === 'weekly') {
    const gap = Math.max(1, Math.floor((new Date(`${after}T00:00:00Z`).getTime() - anchor.getTime()) / 604800000) + 1)
    return new Date(anchor.getTime() + gap * 604800000).toISOString().slice(0, 10)
  }
  const current = new Date(`${after}T00:00:00Z`)
  let offset = Math.max(1, (current.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + current.getUTCMonth() - anchor.getUTCMonth())
  const candidate = (months: number): string => {
    const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + months, 1))
    const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()
    start.setUTCDate(Math.min(template.reminderDay ?? anchor.getUTCDate(), last))
    return start.toISOString().slice(0, 10)
  }
  if (candidate(offset) <= after) offset++
  return candidate(offset)
}

export function reportTotals(records: FinanceRecord[], settings: FinancePreferences, from: string, to: string): { income: number; expense: number; categories: Record<string, number> } {
  const totals = { income: 0, expense: 0, categories: {} as Record<string, number> }
  for (const record of records) {
    if (record.deleted || recordDate(record) < from || recordDate(record) > to) continue
    if (record.entityType === 'income') totals.income += moneyToCents(record.payload.amount)
    if (record.entityType === 'expense') {
      const amount = moneyToCents(record.payload.personalAmount)
      totals.expense += amount
      const category = categoryForRecord(record, settings)
      const id = category?.id ?? record.payload.categoryCode
      totals.categories[id] = (totals.categories[id] ?? 0) + amount
      if (category?.parentId) totals.categories[category.parentId] = (totals.categories[category.parentId] ?? 0) + amount
    }
  }
  return totals
}

export function dueTemplates(settings: FinancePreferences, today = taipeiDate()): FinanceTemplate[] {
  return settings.templates.filter((template) => template.active && template.repeat !== 'none' && template.nextDate && template.nextDate <= today)
}
