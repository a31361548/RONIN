import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { createHash } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'
import { z } from 'zod'
import { categories, recordAmount, recordDataSchema, recordDate, recordTitle, type FinanceRecord, type RecordData } from './schema'
import { historySourceSchema, type HistoryMapping, type HistoryPreviewRow, type HistorySummary } from './history'
import { payloadHash } from './sync'
import type { FinancePreferences } from './preferences'

type Cell = string | number | boolean | null
type SourceRow = { sheet: string; row: number; values: Record<string, Cell> }
export type HistoryWorkbook = { fileName: string; fileHash: string; rows: SourceRow[]; warnings: string[] }
export type HistoryItem = { id: string; masterId: string; record: RecordData; localCategoryId: string | null; source: SourceRow; sourceHash: string; recordedDate: string | null }
export type HistoryGroup = HistoryPreviewRow & { items: HistoryItem[]; summary?: HistorySummary }
class MappingRequired extends Error {
  constructor(message: string, readonly kind: 'category' | 'account' | 'card', readonly mappingName: string) { super(message) }
}
export const mappingSchema = z.object({ categories: z.record(z.string().max(80)), accounts: z.record(z.enum(['cathay', 'ctbc', 'cash', ''])), cards: z.record(z.enum(['CUBE-9539', ''])).optional() }).strict()
const sheets: Record<string, string[]> = {
  支出明細: ['日期', '月份', '類別', '項目', '金額', '支付方式', '是否固定支出', '備註', '資料ID', 'gross_amount', 'reimbursement_amount', 'points_offset_amount', 'credit_card_id', 'statement_month', 'structured_credit_card', '寫入日期'],
  信用卡交易: ['信用卡交易ID', 'card_id', '卡名', '末四碼', '刷卡日期', '入帳日期', '實際刷卡金額', 'statement_month', '消費月份', '預訂用途', '預約使用日', '使用時數', '個人負擔', '他人分攤/實際回補', '狀態', '對應支出ID', '備註', '寫入日期'],
  資金異動: ['資金異動ID', '異動日期', '帳戶', '異動類型', '金額', '異動後餘額', '所屬月份', '備註', '寫入日期'],
  月收支: ['月份', '薪水收入', '其他收入', '總收入', '固定支出', '變動支出', '備註', '寫入日期'],
}
// Check central-directory sizes before ExcelJS inflates an untrusted ZIP file.
export function checkWorkbookZip(buffer: Buffer): void {
  if (buffer.length > 3_000_000) throw new Error('Excel 檔案需小於 3 MB')
  let end = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) { end = i; break }
  if (end < 0) throw new Error('請選擇有效的 .xlsx 檔案')
  const count = buffer.readUInt16LE(end + 10)
  let offset = buffer.readUInt32LE(end + 16)
  const size = buffer.readUInt32LE(end + 12)
  if (count > 500 || offset + size !== end || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6)) throw new Error('Excel 壓縮檔結構或大小不支援')
  let total = 0
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Excel 壓縮檔已損壞')
    const bytes = buffer.readUInt32LE(offset + 24)
    const compressed = buffer.readUInt32LE(offset + 20)
    const local = buffer.readUInt32LE(offset + 42)
    total += bytes
    if (bytes > 16_000_000 || total > 40_000_000 || buffer.readUInt16LE(offset + 8) & 1 || ![0, 8].includes(buffer.readUInt16LE(offset + 10))) throw new Error('Excel 解壓大小超過限制或使用不支援的加密格式')
    if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) throw new Error('Excel 壓縮檔內容已損壞')
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
    if (start + compressed > buffer.readUInt32LE(end + 16)) throw new Error('Excel 壓縮資料越界')
    const data = buffer.subarray(start, start + compressed)
    const inflated = buffer.readUInt16LE(offset + 10) === 8 ? inflateRawSync(data, { maxOutputLength: Math.max(1, bytes) }) : data
    if (inflated.length !== bytes) throw new Error('Excel 解壓大小與目錄不一致')
    offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32)
  }
  if (offset !== end) throw new Error('Excel 壓縮檔目錄不完整')
}
function cellValue(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('數值不正確'); return value }
  if ('formula' in value || 'sharedFormula' in value) { if (value.result === undefined) throw new Error('公式沒有快取結果，請先用 Excel 計算並儲存'); return cellValue(value.result) }
  if ('richText' in value) return value.richText.map((part) => part.text).join('')
  if ('text' in value) return value.text
  throw new Error('儲存格含有 Excel 錯誤或不支援的內容')
}
const dateFields = new Set(['日期', '刷卡日期', '入帳日期', '預約使用日', '異動日期', '寫入日期'])
export function excelSerialDate(value: number, date1904: boolean): string {
  if (!Number.isFinite(value) || value < (date1904 ? 0 : 1) || !date1904 && Math.floor(value) === 60) throw new Error('Excel 日期序號不正確')
  const days = Math.floor(value) + (date1904 ? 1462 : value < 60 ? 1 : 0) - 25569
  const d = new Date(days * 86400000)
  if (!Number.isFinite(d.getTime()) || d.getUTCFullYear() < 1 || d.getUTCFullYear() > 9999) throw new Error('Excel 日期超出範圍')
  return d.toISOString().slice(0, 10)
}
export async function readHistoryWorkbook(buffer: Buffer, fileName: string): Promise<HistoryWorkbook> {
  checkWorkbookZip(buffer)
  // Some valid writers prefix the main SpreadsheetML namespace (e.g. x:sheet).
  // ExcelJS matches bare tag names. Normalize only that namespace, in memory.
  const zip = await JSZip.loadAsync(buffer)
  let normalized = false
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !/^xl\/(workbook|styles|sharedStrings|worksheets\/sheet\d+)\.xml$/.test(name)) continue
    let xml = await entry.async('string')
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Excel XML 不支援自訂外部實體')
    const ns = /xmlns:([A-Za-z_][\w.-]*)=["']http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main["']/.exec(xml)
    const original = xml
    if (ns) {
      const prefix = ns[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const declarations = Array.from(xml.matchAll(new RegExp(`xmlns:${prefix}=["']([^"']+)["']`, 'g')))
      if (declarations.some((declaration) => declaration[1] !== 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')) throw new Error('Excel XML 的命名空間前綴有衝突')
      xml = xml.replace(new RegExp(`<(/?)${prefix}:`, 'g'), '<$1').replace(new RegExp(`xmlns:${prefix}=`, 'g'), 'xmlns=')
    }
    // ExcelJS also treats ISO date cells (t="d") as numeric serials. Retain
    // their exact calendar date as text instead of letting it parse 2026 as 2026 days.
    xml = xml.replace(/<c\b([^>]*?)\bt=["']d["']([^>]*)>([\s\S]*?)<\/c>/g, (whole: string, before: string, after: string, body: string) => {
      const value = /<v>([^<]+)<\/v>/.exec(body)?.[1]
      if (!value || !/^\d{4}-\d{2}-\d{2}(T[\d:.+-]+Z?)?$/.test(value)) return whole
      const d = new Date(value)
      if (!Number.isFinite(d.getTime())) throw new Error('Excel ISO 日期不正確')
      return `<c${before}t="str"${after}>${body.replace(/<v>[^<]+<\/v>/, `<v>${value.slice(0, 10)}</v>`)}</c>`
    })
    if (xml !== original) { zip.file(name, xml); normalized = true }
  }
  const workbook = new ExcelJS.Workbook()
  const readable = normalized ? await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }) : buffer
  await workbook.xlsx.load(readable as unknown as Parameters<typeof workbook.xlsx.load>[0])
  const rows: SourceRow[] = []; const warnings: string[] = []
  for (const sheet of workbook.worksheets) {
    const fields = sheets[sheet.name]
    if (!fields) { warnings.push(`略過「${sheet.name}」：不在本次日常記帳範圍。`); continue }
    if (sheet.rowCount > 5001 || sheet.columnCount > 100) throw new Error(`「${sheet.name}」超過 5000 列或 100 欄限制`)
    const columns = new Map<string, number>()
    sheet.getRow(1).eachCell((cell, index) => {
      const header = String(cellValue(cell.value) ?? '').trim()
      if (!fields.includes(header)) return
      if (columns.has(header)) throw new Error(`「${sheet.name}」重複欄位：${header}`)
      columns.set(header, index)
    })
    const required = sheet.name === '月收支' ? ['月份', '總收入', '固定支出', '變動支出'] : sheet.name === '支出明細' ? fields.slice(0, 9) : sheet.name === '信用卡交易' ? ['信用卡交易ID', '刷卡日期', '實際刷卡金額', '狀態', '對應支出ID'] : fields.slice(0, 5)
    if (required.some((field) => !columns.has(field))) throw new Error(`「${sheet.name}」缺少必要表頭：${required.filter((field) => !columns.has(field)).join('、')}`)
    sheet.eachRow((row, index) => {
      if (index === 1) return
      const values: Record<string, Cell> = {}
      for (const [field, column] of columns) {
        try { const value = cellValue(row.getCell(column).value); values[field] = dateFields.has(field) && typeof value === 'number' ? excelSerialDate(value, Boolean(workbook.properties.date1904)) : value }
        catch (error) { values[field] = `#IMPORT_ERROR: ${error instanceof Error ? error.message : '儲存格錯誤'}` }
      }
      if (Object.values(values).every((value) => value === null || value === '')) return
      rows.push({ sheet: sheet.name, row: index, values })
    })
  }
  if (!rows.length) throw new Error('檔案沒有可辨識的日常記帳資料')
  if (rows.length > 5000) throw new Error('單次最多預覽 5000 列帳目')
  return { fileName, fileHash: createHash('sha256').update(buffer).digest('hex'), rows, warnings }
}
function text(row: SourceRow, field: string, optional = false): string {
  const value = row.values[field]
  if (value === null || value === undefined || value === '') { if (optional) return ''; throw new Error(`${field}未填寫`) }
  if (typeof value !== 'string' || value.startsWith('#IMPORT_ERROR:')) throw new Error(`${field}不是有效文字${typeof value === 'string' ? `：${value}` : ''}`)
  if (!optional && !value.trim()) throw new Error(`${field}未填寫`)
  return value.trim()
}
function date(row: SourceRow, field: string, optional = false): string | null {
  const value = text(row, field, optional)
  if (!value && optional) return null
  const d = new Date(`${value}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new Error(`${field === '日期' ? '日期' : field}不正確，請使用有效的 YYYY-MM-DD 日期`)
  return value
}
function month(row: SourceRow, field: string, optional = false): string | null {
  const value = text(row, field, optional)
  if (!value && optional) return null
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error(`${field}月份不正確`)
  return value
}
function money(row: SourceRow, field: string, optional = false, signed = false): string | null {
  const value = row.values[field]
  if ((value === null || value === undefined || value === '') && optional) return null
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+(\.\d{1,2})?$/.test(value) ? Number(value) : NaN
  if (!Number.isFinite(n) || (!signed && n < 0) || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001 || Math.abs(n) >= 1e10) throw new Error(`${field}需為有效金額（最多兩位小數）`)
  return n.toFixed(2)
}
export function historyId(userId: string, kind: string, masterId: string): string {
  const hash = createHash('sha256').update(`${userId}\0excel-history-v1\0${kind}\0${masterId}`).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}
const accountName = (row: SourceRow): string => row.sheet === '支出明細' ? `未提供帳戶（${String(row.values['支付方式'])}）` : String(row.values['帳戶'] ?? '')
export function workbookMappings(workbook: HistoryWorkbook, preferences: FinancePreferences): { categoryNames: string[]; accountNames: string[]; cardNames: string[]; defaults: HistoryMapping } {
  const categoryNames = Array.from(new Set(workbook.rows.filter((row) => row.sheet === '支出明細').map((row) => String(row.values['類別'] ?? ''))))
  const accountNames = Array.from(new Set(workbook.rows.filter((row) => row.sheet === '資金異動' || row.sheet === '支出明細' && row.values['支付方式'] !== '信用卡').map(accountName)))
  return { categoryNames, accountNames, cardNames: workbook.rows.some((row) => row.sheet === '資金異動' && row.values['異動類型'] === 'credit_card_payment') ? ['未提供卡片（卡費繳款）'] : [], defaults: { cards: {}, categories: Object.fromEntries(categoryNames.map((name) => [name, preferences.categories.find((item) => item.active && !item.parentId && (item.name === name || categories[item.code] === name))?.id ?? ''])), accounts: Object.fromEntries(accountNames.map((name) => [name, preferences.accounts.find((item) => item.active && (item.name === name || item.id === 'cash' && name === '未提供帳戶（現金）' || item.id === 'cathay' && name === '國泰' || item.id === 'ctbc' && ['中信', '中國信託'].includes(name)))?.id ?? ''])) } }
}
export function prepareHistory(workbook: HistoryWorkbook, userId: string, preferences: FinancePreferences, mapping: HistoryMapping, entries: FinanceRecord[], summaries: HistorySummary[]): HistoryGroup[] {
  const groups: HistoryGroup[] = []
  const expenses = new Map<string, SourceRow>()
  const idCounts = new Map<string, number>()
  const keyFor = (row: SourceRow): string => `${row.sheet}:${String(row.values[row.sheet === '支出明細' ? '資料ID' : row.sheet === '信用卡交易' ? '信用卡交易ID' : row.sheet === '資金異動' ? '資金異動ID' : '月份'] ?? '').trim()}`
  for (const row of workbook.rows) { const key = keyFor(row); idCounts.set(key, (idCounts.get(key) ?? 0) + 1); if (row.sheet === '支出明細') expenses.set(String(row.values['資料ID']).trim(), row) }
  const linkedExpenseIds = new Set(workbook.rows.filter((row) => row.sheet === '信用卡交易').map((row) => String(row.values['對應支出ID'] ?? '').trim()).filter(Boolean))
  const item = (source: SourceRow, masterId: string, record: RecordData, localCategoryId: string | null = null): HistoryItem => {
    const parsed = recordDataSchema.parse(record)
    return { id: historyId(userId, record.entityType, masterId), masterId, record: parsed, localCategoryId, source, sourceHash: payloadHash({ original: source.values, record: parsed, localCategoryId }), recordedDate: date(source, '寫入日期', true) }
  }
  const expenseItem = (source: SourceRow, cardId: string | null): HistoryItem => {
    const id = text(source, '資料ID'); const name = text(source, '類別')
    const category = preferences.categories.find((c) => c.id === mapping.categories[name] && c.active)
    if (!category) throw new MappingRequired(`請指定「${name}」對應的支出分類`, 'category', name)
    const payment = text(source, '支付方式'); const paymentMethod = ({ 現金: 'cash', 轉帳: 'bank_transfer', 信用卡: 'credit_card' } as const)[payment as '現金' | '轉帳' | '信用卡']
    if (!paymentMethod) throw new Error(`不支援支付方式「${payment}」`)
    const account = preferences.accounts.find((a) => a.id === mapping.accounts[accountName(source)] && a.active)
    if (paymentMethod !== 'credit_card' && !account) throw new MappingRequired('尚未指定付款帳戶，請補上帳戶對照後更新預覽', 'account', accountName(source))
    if (paymentMethod === 'cash' && account?.id !== 'cash') throw new MappingRequired('現金付款請對照現金錢包，銀行來源不由支出推算', 'account', accountName(source))
    if (paymentMethod === 'bank_transfer' && account?.id === 'cash') throw new MappingRequired('轉帳付款請指定銀行帳戶，不能對照現金錢包', 'account', accountName(source))
    const expenseDate = date(source, '日期') as string
    if (month(source, '月份') !== expenseDate.slice(0, 7)) throw new Error('支出日期與月份不一致')
    const fixed = text(source, '是否固定支出')
    if (!['是', '否'].includes(fixed)) throw new Error('是否固定支出只能為是／否')
    if (cardId && paymentMethod !== 'credit_card') throw new Error('信用卡對應的支出支付方式不是信用卡')
    return item(source, id, { entityType: 'expense', payload: { expenseDate, categoryCode: category.code, item: text(source, '項目'), personalAmount: money(source, '金額') as string, paymentMethod, accountId: paymentMethod === 'credit_card' ? null : account?.id ?? null, isFixed: fixed === '是', notes: text(source, '備註', true) || null, creditCardTransactionClientId: cardId } }, category.id)
  }
  for (const row of workbook.rows) {
    if (row.sheet === '支出明細' && linkedExpenseIds.has(String(row.values['資料ID']).trim())) continue
    const detail = row.sheet === '信用卡交易' ? expenses.get(String(row.values['對應支出ID'] ?? '').trim()) : row.sheet === '支出明細' ? row : undefined
    const rawAmount = detail?.values['金額'] ?? row.values['實際刷卡金額'] ?? row.values['金額'] ?? row.values['總收入']
    const displayAmount = typeof rawAmount === 'number' && Number.isFinite(rawAmount) ? rawAmount.toFixed(2) : typeof rawAmount === 'string' && /^\d+(\.\d{1,2})?$/.test(rawAmount) ? Number(rawAmount).toFixed(2) : ''
    const categoryName = detail ? String(detail.values['類別'] ?? '') : undefined
    const paymentMethod = detail ? String(detail.values['支付方式'] ?? '') : undefined
    const mappedAccount = detail ? mapping.accounts[accountName(detail)] : mapping.accounts[accountName(row)]
    const group: HistoryGroup = { key: keyFor(row), title: String(detail?.values['項目'] ?? row.values['預訂用途'] ?? row.values['月份'] ?? row.values['資金異動ID'] ?? ''), sheet: row.sheet, row: row.row, date: String(detail?.values['日期'] ?? row.values['異動日期'] ?? row.values['刷卡日期'] ?? row.values['月份'] ?? ''), amount: displayAmount, status: 'new', message: '', sourceIds: [keyFor(row).slice(row.sheet.length + 1)].filter(Boolean), items: [], categoryName, paymentMethod, accountName: paymentMethod === '信用卡' ? preferences.cardName : preferences.accounts.find((a) => a.id === mappedAccount)?.name }
    try {
      if (Object.values(row.values).some((value) => typeof value === 'string' && value.startsWith('#IMPORT_ERROR:'))) throw new Error('儲存格含公式錯誤或缺少快取結果，請先用 Excel 計算並儲存')
      if (group.key.length > 300) throw new Error('來源 ID 過長，請先修正原檔')
      if ((idCounts.get(group.key) ?? 0) > 1) throw new Error('檔案內來源 ID 重複，請先修正原檔')
      if (row.sheet === '月收支') {
        const m = month(row, '月份') as string
        const summary: HistorySummary = { month: m, salary: money(row, '薪水收入', true), otherIncome: money(row, '其他收入', true), income: money(row, '總收入') as string, fixedExpense: money(row, '固定支出') as string, variableExpense: money(row, '變動支出') as string, recordedDate: date(row, '寫入日期', true), notes: text(row, '備註', true) || null, sourceHash: payloadHash(row.values), fileName: workbook.fileName }
        if (summary.salary !== null && summary.otherIncome !== null && Math.round((Number(summary.salary) + Number(summary.otherIncome)) * 100) !== Math.round(Number(summary.income) * 100)) throw new Error('總收入與薪水／其他收入不一致')
        group.summary = summary; group.title = `${m} 月收支彙總`; group.date = m; group.amount = summary.income; group.sourceIds = [m]
        const old = summaries.find((s) => s.month === m)
        group.status = old?.sourceHash === summary.sourceHash ? 'duplicate' : old ? 'update' : 'new'
        group.message = '收入保留月彙總，與逐筆收入分開顯示；不推算入帳日期、不重複加總。'
      } else {
        if (row.sheet === '支出明細') { group.items = [expenseItem(row, null)]; if (row.values['支付方式'] === '信用卡') group.message = '舊刷卡支出沒有對應刷卡明細；保留個人負擔，不補出交易日期或實刷金額。' }
        if (row.sheet === '信用卡交易') {
          const id = text(row, '信用卡交易ID'); const cardId = text(row, 'card_id')
          if (!['CUBE-9539', '國泰CUBE-9539'].includes(cardId)) throw new Error('第一版只支援 CUBE-9539')
          const status = ({ 已結算: 'settled', 待結算: 'pending', 已取消: 'cancelled', settled: 'settled', pending: 'pending', cancelled: 'cancelled' } as const)[text(row, '狀態') as '已結算']
          if (!status) throw new Error('信用卡狀態不支援')
          const linked = text(row, '對應支出ID', true); const sourceExpense = expenses.get(linked)
          if (status === 'settled' ? !sourceExpense || (idCounts.get(`支出明細:${linked}`) ?? 0) !== 1 : Boolean(linked)) throw new Error('結算連結缺少唯一支出，或待結算／取消仍有支出連結')
          const cardClientId = historyId(userId, 'credit_card_transaction', id)
          const expense = sourceExpense ? expenseItem(sourceExpense, cardClientId) : null
          if (sourceExpense && sourceExpense.values['points_offset_amount'] !== null && sourceExpense.values['points_offset_amount'] !== undefined && money(sourceExpense, 'points_offset_amount') !== '0.00') throw new Error('非零點數折抵尚未支援，請先核對信用卡來源')
          const consumptionDate = expense?.record.entityType === 'expense' ? expense.record.payload.expenseDate : date(row, '預約使用日', true)
          if (!consumptionDate) throw new Error('缺少實際消費／使用日期，不能以月份或刷卡日推算')
          if (month(row, '消費月份') !== consumptionDate.slice(0, 7)) throw new Error('信用卡消費月份與支出日期不一致')
          const card = item(row, id, { entityType: 'credit_card_transaction', payload: { cardId: 'CUBE-9539', purchaseDate: date(row, '刷卡日期') as string, postingDate: date(row, '入帳日期', true), consumptionDate, statementMonth: month(row, 'statement_month', true), purpose: text(row, '預訂用途'), usageDate: date(row, '預約使用日', true), usageHours: money(row, '使用時數', true), grossAmount: money(row, '實際刷卡金額') as string, reimbursementReceivedAmount: money(row, '他人分攤/實際回補') as string, pointsOffsetAmount: '0.00', personalAmount: money(row, '個人負擔', true), status, expenseClientId: expense?.id ?? null, notes: text(row, '備註', true) || null } })
          if (expense?.record.entityType === 'expense' && card.record.entityType === 'credit_card_transaction' && expense.record.payload.personalAmount !== card.record.payload.personalAmount) throw new Error('信用卡與支出個人負擔不一致')
          group.items = expense ? [card, expense] : [card]
          group.message = expense ? '信用卡與支出成組匯入；消費只計個人負擔一次。' : '未結算信用卡不建立支出。'
        }
        if (row.sheet === '資金異動') {
          const account = preferences.accounts.find((a) => a.id === mapping.accounts[accountName(row)] && a.active)
          if (!account || account.id === 'cash') throw new MappingRequired('資金異動請指定銀行帳戶，現金提款與錢包移轉尚未支援', 'account', accountName(row))
          const movementDate = date(row, '異動日期') as string
          if (month(row, '所屬月份') !== movementDate.slice(0, 7)) throw new Error('異動日期與所屬月份不一致')
          const type = z.enum(['credit_card_payment', 'family_advance_repayment']).parse(text(row, '異動類型'))
          const notes = text(row, '備註', true) || null
          if (type === 'credit_card_payment' && mapping.cards?.['未提供卡片（卡費繳款）'] !== 'CUBE-9539') throw new MappingRequired('請指定卡費繳款的卡片；來源沒有帳單月份，保留未知', 'card', '未提供卡片（卡費繳款）')
          group.items = [item(row, text(row, '資金異動ID'), { entityType: 'cash_movement', payload: { movementDate, accountId: account.id, movementType: type, amount: money(row, '金額') as string, balanceAfter: money(row, '異動後餘額', true, true), notes, cardId: type === 'credit_card_payment' ? 'CUBE-9539' : null, statementMonth: null } })]
        }
        const first = group.items[0]
        group.title = recordTitle(first.record); group.date = recordDate(first.record); group.amount = recordAmount(first.record); group.sourceIds = group.items.map((i) => i.masterId)
        const previous = group.items.map((i) => entries.find((e) => e.id === i.id || e.entityType === i.record.entityType && typeof e.sourceRefs === 'object' && e.sourceRefs !== null && 'masterId' in e.sourceRefs && e.sourceRefs.masterId === i.masterId))
        if (previous.some((e) => e && !historySourceSchema.safeParse(e.sourceRefs).success)) { group.status = 'blocked'; group.message = '相同正式 ID 已由同步回匯保存，請走既有同步流程處理。' }
        else if (previous.some((e) => e && (e.deleted || e.serverShadow !== null))) { group.status = 'blocked'; group.message = '既有資料有刪除標記或衝突，請先核對。' }
        else if (previous.some(Boolean)) {
          const unchanged = previous.every((e, index) => e && historySourceSchema.parse(e.sourceRefs).sourceHash === group.items[index].sourceHash)
          group.status = unchanged ? 'duplicate' : 'update'
          group.message = unchanged ? '相同來源 ID 與內容已匯入，不會重複新增。' : '同一來源 ID 的 Excel 內容已改變；確認後更新歷史副本。'
          if (previous.some((e) => e && e.recordedDate && e.recordedDate !== group.items.find((i) => i.id === e.id)?.recordedDate)) throw new Error('既有首次正式寫入日期被改變，拒絕更新')
        } else if (group.items.some((i) => entries.some((e) => !e.deleted && e.entityType === i.record.entityType && recordDate(e) === recordDate(i.record) && recordTitle(e) === recordTitle(i.record) && recordAmount(e) === recordAmount(i.record)))) {
          group.status = 'suspected'; group.message = '日期、項目與金額和網站紀錄相同，預設略過；確認是不同筆後才勾選。'
        }
      }
    } catch (error) {
      group.status = error instanceof MappingRequired ? 'needs_mapping' : 'blocked'; group.items = []; group.summary = undefined; group.title ||= String(row.values['項目'] ?? row.values['預訂用途'] ?? row.values['月份'] ?? row.values['資金異動ID'] ?? '無法辨識資料')
      if (error instanceof MappingRequired) group.requiredMapping = { kind: error.kind, name: error.mappingName }
      group.message = error instanceof z.ZodError ? error.issues[0]?.message ?? '欄位不正確' : error instanceof Error ? error.message : '資料不正確'
    }
    groups.push(group)
  }
  // One expense may not be claimed by two separate card rows.
  const claims = new Map<string, number>()
  for (const group of groups) for (const i of group.items) claims.set(i.id, (claims.get(i.id) ?? 0) + 1)
  for (const group of groups) if (group.items.some((i) => (claims.get(i.id) ?? 0) > 1)) { group.status = 'blocked'; group.message = '同一支出被多筆信用卡連結，請先修正原檔'; group.items = [] }
  for (const group of groups) if (group.status === 'new' && group.items.some((i) => groups.some((other) => other !== group && other.items.some((j) => j.record.entityType === i.record.entityType && recordDate(j.record) === recordDate(i.record) && recordTitle(j.record) === recordTitle(i.record) && recordAmount(j.record) === recordAmount(i.record))))) { group.status = 'suspected'; group.message = '檔案內不同來源 ID 有相同日期、項目與金額，預設略過；確認是不同筆後才勾選。' }
  return groups
}
