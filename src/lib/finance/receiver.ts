import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { changeSchema, exchangeSchema, exportSchema, recordDataSchema, recordDate, recordTitle, recordAmount, categories, returnSchema, validateLinks, type Change, type FinanceExport, type RecordData, type ReturnFile, type SyncResult } from './schema'
import { payloadHash, stableJson } from './sync'
import { moneyToCents, centsToMoney, taipeiDate } from './money'
import { FinanceWorkbookXml, type WorkbookRow, type WorkbookValue } from './workbook-xml'

const metaSheet = '日隅同步對照'
const incomeHeaders = ['收入ID', '入帳日期', '月份', '收入分類', '項目', '金額', '帳戶', '固定收入', '備註', '寫入日期']
const baselineHeaders = ['月份', '薪資基線', '其他收入基線', '建立日期']
const mappingSchema = z.object({ masterId: z.string().min(1), masterRevision: z.number().int().min(1), record: recordDataSchema, recordedDate: z.string(), rowHash: z.string(), clientRevision: z.number().int().min(1) }).strict()
const stateSchema = z.object({ version: z.literal(2), datasetId: z.string().uuid(), records: z.record(mappingSchema), batches: z.record(z.object({ hash: z.string(), receipt: returnSchema, confirmedDistinct: z.record(z.string()).default({}) }).strict()), changes: z.record(z.string()) }).strict()
type Mapping = z.infer<typeof mappingSchema>
type State = z.infer<typeof stateSchema>
const sheetNames: Record<RecordData['entityType'], string> = { expense: '支出明細', credit_card_transaction: '信用卡交易', cash_movement: '資金異動', income: '收入明細' }
const idFields: Record<RecordData['entityType'], string> = { expense: '資料ID', credit_card_transaction: '信用卡交易ID', cash_movement: '資金異動ID', income: '收入ID' }
const accountNames = { cathay: '國泰', ctbc: '中信', cash: '現金錢包' }
const accountIds: Record<string, string> = { 國泰: 'cathay', 中信: 'ctbc', 中國信託: 'ctbc', 現金錢包: 'cash' }
const title = (row: WorkbookRow, field: string): string => String(row.values[field] ?? '').trim()
const amount = (row: WorkbookRow, field: string): string => {
  const value = row.values[field]; if (typeof value !== 'number' && typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(String(value))) throw new Error(`「${field}」金額來源不完整`)
  return centsToMoney(Math.round(Number(value) * 100))
}
function nullableAmount(row: WorkbookRow, field: string): string | null { return row.values[field] === null || row.values[field] === undefined || row.values[field] === '' ? null : amount(row, field) }
function yesNo(row: WorkbookRow, field: string): boolean { const value = title(row, field); if (value !== '是' && value !== '否') throw new Error(`「${field}」需明確填寫是／否`); return value === '是' }
function incomeType(row: WorkbookRow): 'salary' | 'other' { const value = title(row, '收入分類'); if (value !== '薪資' && value !== '其他收入') throw new Error('收入分類來源不完整'); return value === '薪資' ? 'salary' : 'other' }
function storedRow(doc: FinanceWorkbookXml, mapping: Mapping): WorkbookRow {
  const rows = doc.rows(sheetNames[mapping.record.entityType]).filter((row) => title(row, idFields[mapping.record.entityType]) === mapping.masterId)
  if (rows.length !== 1) throw new Error('正式來源 ID 缺少或重複，需人工核對')
  if (doc.date(rows[0].values['寫入日期']) !== mapping.recordedDate) throw new Error('首次正式寫入日期被改變')
  return rows[0]
}
function sourceRecord(doc: FinanceWorkbookXml, mapping: Mapping, row: WorkbookRow, state: State): RecordData {
  const original = mapping.record, notes = title(row, '備註') || null
  const date = (field: string): string => { const value = doc.date(row.values[field]); if (!value) throw new Error(`缺少正式 ${field}`); return value }
  const account = (field: string): string => accountIds[title(row, field)] ?? title(row, field)
  let raw: unknown
  if (original.entityType === 'expense') raw = { entityType: original.entityType, payload: { ...original.payload, expenseDate: date('日期'), categoryCode: Object.entries(categories).find(([, value]) => value === title(row, '類別'))?.[0], item: title(row, '項目'), personalAmount: amount(row, '金額'), paymentMethod: ({ 現金: 'cash', 轉帳: 'bank_transfer', 信用卡: 'credit_card' } as Record<string, string>)[title(row, '支付方式')], accountId: title(row, '支付方式') === '信用卡' ? null : account('付款帳戶'), isFixed: yesNo(row, '是否固定支出'), notes } }
  if (original.entityType === 'income') raw = { entityType: original.entityType, payload: { ...original.payload, receivedDate: date('入帳日期'), incomeType: incomeType(row), item: title(row, '項目'), amount: amount(row, '金額'), accountId: account('帳戶'), isRecurring: yesNo(row, '固定收入'), notes } }
  if (original.entityType === 'cash_movement') raw = { entityType: original.entityType, payload: { ...original.payload, movementDate: date('異動日期'), accountId: account('帳戶'), movementType: title(row, '異動類型'), amount: amount(row, '金額'), balanceAfter: row.values['異動後餘額'] === null ? null : String(row.values['異動後餘額']), cardId: title(row, 'card_id') || null, statementMonth: title(row, 'statement_month') || null, notes } }
  if (original.entityType === 'credit_card_transaction') {
    const linked = Object.entries(state.records).find(([, value]) => value.masterId === title(row, '對應支出ID'))
    raw = { entityType: original.entityType, payload: { ...original.payload, cardId: title(row, 'card_id'), purchaseDate: date('刷卡日期'), postingDate: doc.date(row.values['入帳日期']), consumptionDate: date('實際消費日'), statementMonth: title(row, 'statement_month') || null, purpose: title(row, '預訂用途'), usageDate: doc.date(row.values['預約使用日']), usageHours: nullableAmount(row, '使用時數'), grossAmount: amount(row, '實際刷卡金額'), reimbursementReceivedAmount: amount(row, '他人分攤/實際回補'), personalAmount: nullableAmount(row, '個人負擔'), status: ({ 已結算: 'settled', 待結算: 'pending', 取消: 'cancelled' } as Record<string, string>)[title(row, '狀態')], expenseClientId: linked?.[0] ?? null, notes } }
  }
  return recordDataSchema.parse(raw)
}
function physicalValues(change: Change, masterId: string, state: State, writtenDate: string): Record<string, WorkbookValue> {
  const notes = change.payload.notes, date = { date: recordDate(change) }, written = { date: writtenDate }
  if (change.entityType === 'expense') return { 日期: date, 月份: recordDate(change).slice(0, 7), 類別: categories[change.payload.categoryCode], 項目: change.payload.item, 金額: Number(change.payload.personalAmount), 支付方式: { cash: '現金', bank_transfer: '轉帳', credit_card: '信用卡' }[change.payload.paymentMethod], 是否固定支出: change.payload.isFixed ? '是' : '否', 備註: notes, 資料ID: masterId, 寫入日期: written, 付款帳戶: change.payload.accountId ? accountNames[change.payload.accountId] : null, credit_card_id: change.payload.paymentMethod === 'credit_card' ? 'CUBE-9539' : null, points_offset_amount: 0, structured_credit_card: change.payload.paymentMethod === 'credit_card' ? 1 : 0 }
  if (change.entityType === 'income') return { 收入ID: masterId, 入帳日期: date, 月份: recordDate(change).slice(0, 7), 收入分類: change.payload.incomeType === 'salary' ? '薪資' : '其他收入', 項目: change.payload.item, 金額: Number(change.payload.amount), 帳戶: accountNames[change.payload.accountId], 固定收入: change.payload.isRecurring ? '是' : '否', 備註: notes, 寫入日期: written }
  if (change.entityType === 'cash_movement') return { 資金異動ID: masterId, 異動日期: date, 帳戶: accountNames[change.payload.accountId], 異動類型: change.payload.movementType, 金額: Number(change.payload.amount), 異動後餘額: change.payload.balanceAfter === null ? null : Number(change.payload.balanceAfter), 所屬月份: recordDate(change).slice(0, 7), 備註: notes, 寫入日期: written, card_id: change.payload.cardId, statement_month: change.payload.statementMonth }
  return { 信用卡交易ID: masterId, card_id: change.payload.cardId, 卡名: '國泰 CUBE', 末四碼: '9539', 刷卡日期: { date: change.payload.purchaseDate }, 入帳日期: change.payload.postingDate ? { date: change.payload.postingDate } : null, 實際刷卡金額: Number(change.payload.grossAmount), statement_month: change.payload.statementMonth, 消費月份: change.payload.consumptionDate.slice(0, 7), 實際消費日: date, 預訂用途: change.payload.purpose, 預約使用日: change.payload.usageDate ? { date: change.payload.usageDate } : null, 使用時數: change.payload.usageHours === null ? null : Number(change.payload.usageHours), 個人負擔: change.payload.personalAmount === null ? null : Number(change.payload.personalAmount), '他人分攤/實際回補': Number(change.payload.reimbursementReceivedAmount), 狀態: { pending: '待結算', settled: '已結算', cancelled: '取消' }[change.payload.status], 對應支出ID: change.payload.expenseClientId ? state.records[change.payload.expenseClientId]?.masterId ?? null : null, 備註: notes, 寫入日期: written }
}
function parseFile(raw: unknown): FinanceExport {
  const file = exportSchema.parse(raw)
  if (file.records.length > 100) throw new Error('正式接收工具單批最多 100 筆')
  const records = file.records.map((input) => {
    const combined = z.object({ entityType: z.unknown(), payload: z.unknown() }).passthrough().parse(input)
    const { entityType, payload, ...fields } = combined
    const change = changeSchema.parse(fields), record = exchangeSchema(file.schemaVersion).parse({ entityType, payload })
    if (stableJson(record.payload) !== stableJson(payload)) throw new Error('交換金額、空值與文字必須已正規化；禁止接收時默默轉換')
    if ((change.baseMasterRevision === null) !== (change.baseMasterHash === null) || (change.operation === 'delete') !== (change.deletedAt !== null)) throw new Error('版本、雜湊或刪除欄位不一致')
    return { ...change, ...record }
  })
  if (new Set(records.map((row) => row.clientId)).size !== records.length || new Set(records.map((row) => row.changeId)).size !== records.length) throw new Error('同批 clientId 或 changeId 重複')
  validateLinks(records.map((record) => ({ ...record, id: record.clientId })))
  return { ...file, records }
}
function readState(doc: FinanceWorkbookXml, datasetId: string): State {
  if (!doc.hasSheet(metaSheet)) return { version: 2, datasetId, records: {}, batches: {}, changes: {} }
  const rows = doc.rows(metaSheet).sort((a, b) => Number(a.values['分段']) - Number(b.values['分段']))
  if (rows.length > 200 || rows.some((row, index) => row.values['分段'] !== index)) throw new Error('正式同步對照分段不完整')
  const state = stateSchema.parse(JSON.parse(rows.map((row) => String(row.values['內容'] ?? '')).join('')) as unknown)
  if (state.datasetId !== datasetId) throw new Error('此 Excel 已綁定其他 datasetId')
  return state
}
async function saveState(doc: FinanceWorkbookXml, state: State): Promise<void> {
  await doc.ensureSheet(metaSheet, ['分段', '內容'], true)
  const json = JSON.stringify(state)
  if (json.length > 2_000_000) throw new Error('同步對照超過容量，請先整理歷史批次')
  const count = Math.ceil(json.length / 20000)
  for (let index = 0; index < Math.max(count, doc.rows(metaSheet).length); index++) doc.setRow(metaSheet, index + 2, { 分段: index < count ? index : null, 內容: index < count ? json.slice(index * 20000, (index + 1) * 20000) : null })
}
function failure(change: Change, code: string, message: string, mapping?: Mapping): SyncResult {
  return { changeId: change.changeId, clientId: change.clientId, entityType: change.entityType, submittedClientRevision: change.clientRevision, status: mapping ? 'conflict' : 'rejected', masterId: mapping?.masterId ?? null, masterRevision: mapping?.masterRevision ?? null, masterHash: mapping ? payloadHash(mapping.record.payload) : null, canonicalPayload: mapping?.record.payload ?? null, recordedDate: mapping?.recordedDate ?? null, errors: [{ code, field: null, message }], warnings: [] }
}
function applied(change: Change, mapping: Mapping, unchanged = false): SyncResult { return { ...failure(change, '', '', mapping), status: unchanged ? 'unchanged' : 'applied', errors: [] } }
const requiredHeaders: Record<Exclude<RecordData['entityType'], 'income'>, string[]> = { expense: ['日期', '月份', '類別', '項目', '金額', '支付方式', '是否固定支出', '備註', '資料ID', '寫入日期'], credit_card_transaction: ['信用卡交易ID', 'card_id', '刷卡日期', '入帳日期', '實際刷卡金額', '消費月份', '預訂用途', '預約使用日', '使用時數', '個人負擔', '他人分攤/實際回補', '狀態', '對應支出ID', '備註', '寫入日期'], cash_movement: ['資金異動ID', '異動日期', '帳戶', '異動類型', '金額', '異動後餘額', '所屬月份', '備註', '寫入日期'] }

export type ReceiverOptions = { datasetId: string; confirmedDistinct?: Record<string, string>; now?: string }
export type PreparedExchange = { workbook: Buffer; receipt: ReturnFile; sourceHash: string; previewHash: string; replayed: boolean }
export async function prepareWorkbookExchange(buffer: Buffer, raw: unknown, options: ReceiverOptions): Promise<PreparedExchange> {
  const file = parseFile(raw)
  if (file.datasetId !== options.datasetId) throw new Error('交換檔不屬於指定 datasetId')
  const doc = await FinanceWorkbookXml.open(buffer), state = readState(doc, file.datasetId)
  const sourceHash = `sha256:${createHash('sha256').update(buffer).digest('hex')}`, hash = payloadHash(file)
  const previewHash = payloadHash({ sourceHash, hash, confirmedDistinct: options.confirmedDistinct ?? {} })
  const oldBatch = state.batches[file.batchId]
  if (oldBatch) { if (oldBatch.hash !== hash) throw new Error('IMMUTABLE_SNAPSHOT_MISMATCH：同 batchId 內容改變'); return { workbook: buffer, receipt: oldBatch.receipt, sourceHash, previewHash, replayed: true } }
  const now = options.now ?? new Date().toISOString(), writtenDate = taipeiDate(new Date(now))
  const next = structuredClone(state), results: SyncResult[] = [], changes: Change[] = []
  const affectedMonths = new Set<string>()
  for (const change of file.records) {
    try {
      const knownChange = state.changes[change.changeId]
      if (knownChange && knownChange !== payloadHash(change)) throw new Error('IMMUTABLE_SNAPSHOT_MISMATCH：同 changeId 內容改變')
      if (change.operation === 'delete') { results.push(failure(change, 'UNSUPPORTED_OPERATION', '正式刪除需要人工核對')); continue }
      if (file.schemaVersion === 1 && change.entityType === 'income') { results.push(failure(change, 'UNSUPPORTED_ENTITY', '逐筆收入需使用交換版本 2')); continue }
      const kind = change.entityType, sheet = sheetNames[kind]
      if (kind !== 'income') for (const header of requiredHeaders[kind]) if (!doc.hasSheet(sheet) || !doc.columns(sheet).has(header)) throw new Error(`SOURCE_NOT_READY：「${sheet}」缺少 ${header}`)
      const current = state.records[change.clientId]
      if (current && current.record.entityType !== kind) throw new Error('同一 clientId 不可跨類型使用')
      if (current) {
        const physical = storedRow(doc, current)
        if (payloadHash(physical.values) !== current.rowHash) {
          const record = sourceRecord(doc, current, physical, state)
          const updated = { ...current, record, rowHash: payloadHash(physical.values), masterRevision: current.masterRevision + 1 }
          state.records[change.clientId] = updated; results.push(failure(change, 'REVISION_CONFLICT', '正式 Excel 已被人工或其他入口修改，請核對版本', updated)); continue
        }
        if (knownChange) { results.push(applied(change, current, true)); continue }
        if (change.baseMasterRevision !== current.masterRevision || change.baseMasterHash !== payloadHash(current.record.payload) || change.clientRevision <= current.clientRevision) { results.push(failure(change, 'REVISION_CONFLICT', '正式版本或雜湊不一致', current)); continue }
        if (current.record.entityType === 'credit_card_transaction' && current.record.payload.status === 'settled' && change.entityType === 'credit_card_transaction' && change.payload.status !== 'settled') throw new Error('已結算交易不得改回待結算或取消')
        affectedMonths.add(recordDate(current.record).slice(0, 7))
      } else {
        if (change.baseMasterRevision !== null || change.baseMasterHash !== null) throw new Error('找不到所指定的正式版本')
        const duplicate = doc.rows(sheet).some((row) => kind === 'expense' ? doc.date(row.values['日期']) === recordDate(change) && title(row, '項目') === recordTitle(change) && nullableAmount(row, '金額') === recordAmount(change) : kind === 'credit_card_transaction' ? doc.date(row.values['刷卡日期']) === (change.entityType === kind ? change.payload.purchaseDate : '') && title(row, '預訂用途') === recordTitle(change) && nullableAmount(row, '實際刷卡金額') === recordAmount(change) : kind === 'income' ? doc.date(row.values['入帳日期']) === recordDate(change) && nullableAmount(row, '金額') === recordAmount(change) : doc.date(row.values['異動日期']) === recordDate(change) && nullableAmount(row, '金額') === recordAmount(change))
        const baseline = kind === 'income' && change.entityType === kind ? doc.rows('月收支').find((row) => title(row, '月份') === recordDate(change).slice(0, 7)) : undefined
        const legacyIncome = baseline && change.entityType === 'income' ? nullableAmount(baseline, change.payload.incomeType === 'salary' ? '薪水收入' : '其他收入') : null
        const withinBatch = file.records.some((other) => other.clientId !== change.clientId && !state.records[other.clientId] && other.operation === 'upsert' && other.entityType === kind && recordDate(other) === recordDate(change) && recordAmount(other) === recordAmount(change) && (kind !== 'expense' || recordTitle(other) === recordTitle(change)))
        if ((duplicate || withinBatch || legacyIncome !== null && moneyToCents(legacyIncome) > 0) && !options.confirmedDistinct?.[change.clientId]?.trim()) { results.push(failure(change, 'DUPLICATE_CANDIDATE', '可能已由其他入口或同批資料入帳；請先人工確認是不同筆並附註解')); continue }
      }
      const prefix = { expense: 'EXP', credit_card_transaction: 'CC', cash_movement: 'MOV', income: 'INC' }[kind]
      const mapping: Mapping = { masterId: current?.masterId ?? `${prefix}-${randomUUID()}`, masterRevision: (current?.masterRevision ?? 0) + 1, record: { entityType: kind, payload: change.payload } as RecordData, recordedDate: current?.recordedDate ?? writtenDate, rowHash: '', clientRevision: change.clientRevision }
      next.records[change.clientId] = mapping; next.changes[change.changeId] = payloadHash(change); changes.push(change)
      affectedMonths.add(recordDate(change).slice(0, 7)); results.push(applied(change, mapping))
    } catch (reason: unknown) { const message = reason instanceof Error ? reason.message : '正式來源不完整'; results.push(failure(change, message.startsWith('IMMUTABLE') ? 'IMMUTABLE_SNAPSHOT_MISMATCH' : 'SOURCE_NOT_READY', message)) }
  }
  const rejected = results.some((result) => result.errors.length > 0)
  if (!rejected) {
    checkMonthlySources(doc, affectedMonths)
    validateLinks(Object.entries(next.records).map(([id, mapping]) => ({ ...mapping.record, id })))
    for (const change of changes) {
      const sheet = sheetNames[change.entityType], mapping = next.records[change.clientId]
      if (change.entityType === 'income') await doc.ensureSheet(sheet, incomeHeaders)
      if (change.entityType === 'expense') for (const header of ['付款帳戶', 'gross_amount', 'reimbursement_amount', 'points_offset_amount', 'credit_card_id', 'statement_month', 'structured_credit_card']) doc.addColumn(sheet, header)
      if (change.entityType === 'credit_card_transaction') for (const header of ['卡名', '末四碼', 'statement_month', '實際消費日']) doc.addColumn(sheet, header)
      if (change.entityType === 'cash_movement') for (const header of ['card_id', 'statement_month']) doc.addColumn(sheet, header)
      const old = state.records[change.clientId], values = physicalValues(change, mapping.masterId, next, mapping.recordedDate)
      if (change.entityType === 'expense' && change.payload.creditCardTransactionClientId) {
        const linked = next.records[change.payload.creditCardTransactionClientId]?.record
        if (!linked || linked.entityType !== 'credit_card_transaction') throw new Error('信用卡來源缺少配對')
        values.gross_amount = Number(linked.payload.grossAmount); values.reimbursement_amount = Number(linked.payload.reimbursementReceivedAmount); values.statement_month = linked.payload.statementMonth
      }
      if (old) doc.setRow(sheet, storedRow(doc, old).row, values)
      else doc.appendRow(sheet, values)
    }
    // Income baselines retain legacy month totals without inventing transaction dates.
    if (changes.some((change) => change.entityType === 'income')) {
      const initialize = !doc.hasSheet('收入基線'); if (initialize && doc.rows('收入明細').length) throw new Error('既有收入明細缺少歷史基線，需先人工核對'); await doc.ensureSheet('收入基線', baselineHeaders)
      if (initialize) for (const row of doc.rows('月收支')) { const month = title(row, '月份'); if (!/^\d{4}-\d{2}$/.test(month)) continue; const salary = nullableAmount(row, '薪水收入') ?? '0.00', other = nullableAmount(row, '其他收入') ?? '0.00'; if (moneyToCents(amount(row, '總收入')) !== moneyToCents(salary) + moneyToCents(other)) throw new Error('歷史月收入分類與總額不一致，不能建立收入基線'); doc.appendRow('收入基線', { 月份: month, 薪資基線: Number(salary), 其他收入基線: Number(other), 建立日期: { date: writtenDate } }) }
    }
    const staged = await FinanceWorkbookXml.open(await doc.save())
    await updateMonths(staged, affectedMonths, writtenDate)
    const readable = await FinanceWorkbookXml.open(await staged.save())
    for (const mapping of Object.values(next.records)) mapping.rowHash = payloadHash(storedRow(readable, mapping).values)
    const receipt = makeReceipt(file, now, results, false)
    next.batches[file.batchId] = { hash, receipt, confirmedDistinct: options.confirmedDistinct ?? {} }; await saveState(readable, next)
    const workbook = await readable.save(); const verified = await FinanceWorkbookXml.open(workbook)
    const reopened = readState(verified, file.datasetId)
    for (const mapping of Object.values(reopened.records)) { const row = storedRow(verified, mapping); if (payloadHash(row.values) !== mapping.rowHash || payloadHash(sourceRecord(verified, mapping, row, reopened).payload) !== payloadHash(mapping.record.payload)) throw new Error('正式來源回讀與 canonicalPayload 不一致') }
    return { workbook, receipt, sourceHash, previewHash, replayed: false }
  }
  const receipt = makeReceipt(file, now, results, true)
  state.batches[file.batchId] = { hash, receipt, confirmedDistinct: options.confirmedDistinct ?? {} }; await saveState(doc, state)
  return { workbook: await doc.save(), receipt, sourceHash, previewHash, replayed: false }
}
function makeReceipt(file: FinanceExport, now: string, rows: SyncResult[], rejected: boolean): ReturnFile {
  const results = rows.map((row): SyncResult => rejected && !row.errors.length ? { ...row, status: 'not_applied', masterId: null, masterRevision: null, masterHash: null, canonicalPayload: null, recordedDate: null, errors: [{ code: 'BATCH_NOT_APPLIED', field: null, message: '同批預驗證失敗，這筆沒有提交' }] } : row)
  return returnSchema.parse({ schemaVersion: file.schemaVersion, fileType: 'finance-results', appId: 'riyue', timezone: 'Asia/Taipei', datasetId: file.datasetId, batchId: file.batchId, resultId: randomUUID(), processedAt: now, batchStatus: rejected ? 'rejected' : 'committed', results, masterChanges: [], monthlySummaries: [] })
}
function checkMonthlySources(doc: FinanceWorkbookXml, months: Set<string>): void {
  const columns = doc.columns('月收支')
  for (const [header, column] of Object.entries({ 月份: 1, 薪水收入: 3, 其他收入: 4, 總收入: 5, 固定支出: 6, 變動支出: 7, 投資轉出: 8, 總支出: 10, 本月淨存款: 12, 是否超支: 13 })) {
    if (columns.has(header) && columns.get(header) !== column || !columns.has(header) && column <= 8) throw new Error('月收支欄位位置已改變，請先核對公式')
  }
  for (const month of months) {
    const rows = doc.rows('月收支').filter((row) => title(row, '月份') === month)
    if (rows.length > 1) throw new Error('月收支月份重複')
    const row = rows[0], expenses = doc.rows('支出明細').filter((item) => title(item, '月份') === month)
    for (const [field, fixed] of [['固定支出', true], ['變動支出', false]] as const) {
      const actual = expenses.filter((item) => yesNo(item, '是否固定支出') === fixed).reduce((sum, item) => sum + moneyToCents(amount(item, '金額')), 0)
      if (actual !== (row ? moneyToCents(amount(row, field)) : 0)) throw new Error('月收支與既有支出明細不一致，請先人工核對；不會自動改寫差額')
    }
    if (!row) continue
    const salary = moneyToCents(nullableAmount(row, '薪水收入') ?? '0.00'), other = moneyToCents(nullableAmount(row, '其他收入') ?? '0.00')
    if (moneyToCents(amount(row, '總收入')) !== salary + other) throw new Error('月收支收入分類與總額不一致')
    if (doc.hasSheet('收入基線')) {
      const bases = doc.rows('收入基線').filter((item) => title(item, '月份') === month)
      if (bases.length > 1) throw new Error('收入歷史基線月份重複')
      const incomes = doc.rows('收入明細').filter((item) => title(item, '月份') === month)
      for (const [kind, baseField, actual] of [['salary', '薪資基線', salary], ['other', '其他收入基線', other]] as const) {
        const total = (bases[0] ? moneyToCents(amount(bases[0], baseField)) : 0) + incomes.filter((item) => incomeType(item) === kind).reduce((sum, item) => sum + moneyToCents(amount(item, '金額')), 0)
        if (total !== actual) throw new Error('月收入與收入基線／明細不一致，需先人工核對')
      }
    }
  }
}
async function updateMonths(doc: FinanceWorkbookXml, months: Set<string>, writtenDate: string): Promise<void> {
  if (doc.rows('收入基線').some((row) => row.row > 5001) || doc.rows('收入明細').some((row) => row.row > 5001)) throw new Error('收入來源超過目前公式範圍，需先擴充帳本')
  for (const month of months) {
    const old = doc.rows('月收支').filter((row) => title(row, '月份') === month)
    if (old.length > 1) throw new Error('月收支月份重複')
    const expense = doc.rows('支出明細').filter((row) => title(row, '月份') === month)
    const fixed = expense.filter((row) => yesNo(row, '是否固定支出')).reduce((sum, row) => sum + moneyToCents(amount(row, '金額')), 0)
    const variable = expense.filter((row) => !yesNo(row, '是否固定支出')).reduce((sum, row) => sum + moneyToCents(amount(row, '金額')), 0)
    const row = old[0]?.row ?? doc.appendRow('月收支', { 月份: month, 薪水收入: 0, 其他收入: 0, 投資轉出: 0, 投資轉入: 0, 寫入日期: { date: writtenDate } })
    const values: Record<string, WorkbookValue> = { 固定支出: fixed / 100, 變動支出: variable / 100 }
    let salary = old[0] ? Number(nullableAmount(old[0], '薪水收入') ?? '0.00') : 0, other = old[0] ? Number(nullableAmount(old[0], '其他收入') ?? '0.00') : 0
    if (doc.hasSheet('收入基線')) {
      const base = doc.rows('收入基線').filter((item) => title(item, '月份') === month)
      if (base.length > 1) throw new Error('收入歷史基線月份重複')
      salary = base[0] ? Number(amount(base[0], '薪資基線')) : 0; other = base[0] ? Number(amount(base[0], '其他收入基線')) : 0
      for (const income of doc.rows('收入明細').filter((item) => title(item, '月份') === month)) { if (incomeType(income) === 'salary') salary += Number(amount(income, '金額')); else other += Number(amount(income, '金額')) }
      for (const [field, baseColumn, classification, result] of [['薪水收入', 'B', '薪資', salary], ['其他收入', 'C', '其他收入', other]] as const) values[field] = { formula: `SUMIF('收入基線'!$A$2:$A$5001,A${row},'收入基線'!$${baseColumn}$2:$${baseColumn}$5001)+SUMIFS('收入明細'!$F$2:$F$5001,'收入明細'!$C$2:$C$5001,A${row},'收入明細'!$D$2:$D$5001,"${classification}")`, result }
    }
    const income = Math.round((salary + other) * 100) / 100, investment = old[0] ? Number(nullableAmount(old[0], '投資轉出') ?? '0.00') : 0, outflow = (fixed + variable) / 100 + investment
    values['總收入'] = { formula: `C${row}+D${row}`, result: income }
    if (doc.columns('月收支').has('總支出')) values['總支出'] = { formula: `F${row}+G${row}+H${row}`, result: outflow }
    if (doc.columns('月收支').has('本月淨存款')) values['本月淨存款'] = { formula: `E${row}-J${row}`, result: income - outflow }
    if (doc.columns('月收支').has('是否超支')) values['是否超支'] = { formula: `IF(L${row}<0,"是","否")`, result: income < outflow ? '是' : '否' }
    doc.setRow('月收支', row, values)
  }
}
