// node scripts/finance-api-check.cjs — real routes with transactional in-memory Prisma.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { randomUUID } = require('node:crypto')
const root = path.resolve(__dirname, '..')
const userId = '111111111111111111111111'
let authenticated = true
let database = { entries: [], batches: [], ledgers: [] }
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => key === 'OR' ? value.some((condition) => matches(row, condition)) : value && typeof value === 'object' ? 'isSet' in value ? (row[key] !== undefined) === value.isSet : value.in.includes(row[key]) : row[key] === value)
}
function model(key) {
  return {
    findMany: async ({ where, orderBy, take } = {}) => {
      let rows = database[key].filter((row) => matches(row, where))
      if (orderBy) { const field = Object.keys(orderBy)[0]; rows = rows.slice().sort((a, b) => orderBy[field] === 'desc' ? b[field] - a[field] : a[field] - b[field]) }
      return rows.slice(0, take ?? rows.length)
    },
    findFirst: async ({ where }) => database[key].find((row) => matches(row, where)) ?? null,
    findUnique: async ({ where }) => database[key].find((row) => matches(row, where)) ?? null,
    findUniqueOrThrow: async ({ where }) => { const row = database[key].find((row) => matches(row, where)); if (!row) throw new Error('Not found'); return row },
    create: async ({ data }) => {
      if (database[key].some((row) => row.id === data.id)) throw new Error('duplicate ID')
      if (key === 'ledgers' && database.ledgers.some((row) => row.userId === data.userId)) throw new Error('duplicate ledger')
      const row = { id: randomUUID(), localCategoryId: null, preferences: null, preferencesRevision: 0, revision: 1, exportedRevision: 0, syncedRevision: 0, changeId: randomUUID(), deleted: false, syncError: null, sourceRefs: null, masterRevision: null, masterHash: null, recordedDate: null, serverShadow: null, createdAt: new Date(), updatedAt: new Date(), ...data }
      database[key].push(row); return row
    },
    updateMany: async ({ where, data }) => {
      const rows = database[key].filter((row) => matches(row, where))
      rows.forEach((row) => { Object.entries(data).forEach(([key, value]) => { row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : value }); if (!data.updatedAt) row.updatedAt = new Date() })
      return { count: rows.length }
    },
    update: async ({ where, data }) => { const row = database[key].find((row) => matches(row, where)); if (!row) throw new Error('Not found'); Object.assign(row, data); return row },
    upsert: async ({ where, create }) => database[key].find((row) => matches(row, where)) ?? (await model(key).create({ data: create })),
  }
}
const prisma = { financeEntry: model('entries'), financeLedger: model('ledgers'), financeBatch: model('batches'), $transaction: async (work) => { const before = structuredClone(database); try { return await work(prisma) } catch (error) { database = before; throw error } } }
const cache = new Map()
function load(relativePath) {
  const filename = path.resolve(root, relativePath)
  if (cache.has(filename)) return cache.get(filename)
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const module = { exports: {} }
  const mockedRequire = (name) => {
    if (name === '@/lib/prisma') return { prisma }
    if (name === '@/lib/currentUser') return { getAuthenticatedUser: async () => authenticated ? { id: userId } : null }
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`)
    if (name.startsWith('./')) return load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`)))
    return require(name)
  }
  new Function('require', 'module', 'exports', compiled)(mockedRequire, module, module.exports)
  cache.set(filename, module.exports); return module.exports
}
const route = load('src/app/api/finance/route.ts')
const exporter = load('src/app/api/finance/export/route.ts')
const importer = load('src/app/api/finance/import/route.ts')
const actions = load('src/app/api/finance/[id]/route.ts')
const preferencesRoute = load('src/app/api/finance/preferences/route.ts')
const { defaultPreferences, readPreferences, preferencesSchema, nextReminder, reportTotals, categoryForRecord, templateRecord } = load('src/lib/finance/preferences.ts')
const { payloadHash } = load('src/lib/finance/sync.ts')
const { monthlyTotals, returnSchema, recordDataSchema, exchangeRecordSchema } = load('src/lib/finance/schema.ts')
const { moneyToCents, normalizeMoney, taipeiDate } = load('src/lib/finance/money.ts')
const { NextRequest } = require('next/server')
const request = (body, url = 'http://localhost/api/finance') => new NextRequest(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const expense = (amount = '85.00') => ({ entityType: 'expense', payload: { expenseDate: '2026-10-12', categoryCode: 'food', item: '早餐', personalAmount: amount, paymentMethod: 'cash', accountId: 'cathay', isFixed: false, notes: null, creditCardTransactionClientId: null } })
const create = async (record = expense(), id = randomUUID(), revision = 0) => { const response = await route.POST(request({ records: [{ clientId: id, expectedRevision: revision, record }] })); assert.equal(response.status, 201, await response.clone().text()); return (await response.json()).records[0] }
const exportFile = async () => { const response = await exporter.POST(); assert.equal(response.status, 200, await response.clone().text()); return response.json() }
function receipt(batch, options = {}) {
  return { schemaVersion: 1, fileType: 'finance-results', appId: 'riyue', timezone: 'Asia/Taipei', datasetId: batch.datasetId, batchId: batch.batchId, resultId: randomUUID(), processedAt: new Date().toISOString(), batchStatus: 'committed', results: batch.records.map((row) => ({ changeId: row.changeId, clientId: row.clientId, entityType: row.entityType, submittedClientRevision: row.clientRevision, status: 'applied', masterId: `master-${row.clientId}`, masterRevision: (row.baseMasterRevision ?? 0) + 1, masterHash: payloadHash(row.payload), recordedDate: '2026-10-12', canonicalPayload: row.payload, errors: [], warnings: [] })), masterChanges: [], monthlySummaries: [], ...options }
}
const apply = (file, mode = 'apply') => importer.POST(request({ mode, file }))
const action = (entry, type) => actions.PATCH(request({ action: type, expectedRevision: entry.revision }), { params: Promise.resolve({ id: entry.id }) })
function reset() { authenticated = true; database = { entries: [], batches: [], ledgers: [] } }

const historyRoute = load('src/app/api/finance/history/route.ts')
const { readHistoryWorkbook, prepareHistory, workbookMappings, checkWorkbookZip, excelSerialDate } = load('src/lib/finance/history-workbook.ts')
const { historySummaries, isHistoryRecord } = load('src/lib/finance/history.ts')
const ExcelJS = require('exceljs')
async function historyFixture({ amount = 85, card = false, badFormula = false, duplicate = false, movement = true, points = 0 } = {}) {
  const book = new ExcelJS.Workbook()
  const exp = book.addWorksheet('支出明細')
  exp.addRow(['日期', '月份', '類別', '項目', '金額', '支付方式', '是否固定支出', '備註', '資料ID', 'gross_amount', 'reimbursement_amount', 'points_offset_amount', 'credit_card_id', 'statement_month', 'structured_credit_card', '寫入日期'])
  exp.addRow([new Date('2026-10-12T00:00:00Z'), '2026-10', '餐飲', '早餐', badFormula ? { formula: 'SUM(1,2)' } : amount, card ? '信用卡' : '現金', '否', null, 'EXP-history-1', card ? amount + 20 : null, card ? 20 : null, points, card ? 'CUBE-9539' : null, null, card ? 1 : 0, new Date('2026-10-13T00:00:00Z')])
  exp.getCell('A2').numFmt = 'yyyy-mm-dd'; exp.getCell('P2').numFmt = 'yyyy-mm-dd'
  if (duplicate) exp.addRow(exp.getRow(2).values)
  if (card) {
    const cc = book.addWorksheet('信用卡交易')
    cc.addRow(['信用卡交易ID', 'card_id', '刷卡日期', '入帳日期', '實際刷卡金額', 'statement_month', '消費月份', '預訂用途', '預約使用日', '使用時數', '個人負擔', '他人分攤/實際回補', '狀態', '對應支出ID', '備註', '寫入日期'])
    cc.addRow(['CC-history-1', 'CUBE-9539', '2026-10-11', null, amount + 20, null, '2026-10', '早餐', null, null, amount, 20, '已結算', 'EXP-history-1', null, '2026-10-13'])
  }
  if (movement) {
    const cash = book.addWorksheet('資金異動')
    cash.addRow(['資金異動ID', '異動日期', '帳戶', '異動類型', '金額', '異動後餘額', '所屬月份', '備註', '寫入日期'])
    cash.addRow(['MOV-history-1', '2026-10-10', '國泰', 'family_advance_repayment', 15000, null, '2026-10', '代墊', '2026-10-13'])
  }
  const month = book.addWorksheet('月收支')
  month.addRow(['月份', '薪水收入', '其他收入', '總收入', '固定支出', '變動支出', '備註', '寫入日期'])
  month.addRow(['2026-10', 48070, null, { formula: 'C2', result: 48070 }, 0, amount, null, null])
  book.addWorksheet('持股總覽').addRow(['略過投資'])
  return Buffer.from(await book.xlsx.writeBuffer())
}
const historyRequest = (buffer, mode = 'preview', preview, selected, mapping) => {
  const form = new FormData(); form.set('file', new Blob([buffer]), '測試帳本.xlsx'); form.set('mode', mode)
  if (mapping || preview) form.set('mapping', JSON.stringify(mapping ?? preview.defaults))
  if (mode === 'apply') { form.set('selected', JSON.stringify(selected ?? preview.rows.filter((r) => ['new', 'update'].includes(r.status)).map((r) => r.key))); form.set('previewHash', preview.previewHash) }
  return new NextRequest('http://localhost/api/finance/history', { method: 'POST', body: form })
}
const historyPreview = async (buffer, mapping = { categories: { 餐飲: 'food' }, accounts: { '未提供帳戶（現金）': 'cash', 國泰: 'cathay' } }) => {
  const response = await historyRoute.POST(historyRequest(buffer, 'preview', undefined, undefined, mapping))
  assert.equal(response.status, 200, await response.clone().text()); return response.json()
}
const { incomeNeedsReview, incomeIncluded, incomeReviewCurrent } = load('src/lib/finance/income-review.ts')
const salaryRecord = (amount = '48070.00', receivedDate = '2026-10-10') => ({ entityType: 'income', payload: { incomeType: 'salary', item: '薪資', amount, receivedDate, accountId: 'cathay', isRecurring: true, notes: null } })
async function incomeReviewFixture() {
  reset(); const buffer = await historyFixture({ movement: false }); const preview = await historyPreview(buffer)
  assert.equal((await historyRoute.POST(historyRequest(buffer, 'apply', preview))).status, 200)
  const entry = await create(salaryRecord())
  const state = await (await route.GET()).json()
  return { entry, summary: state.historySummaries[0], state }
}
const reviewIncome = (entry, summary, decision = 'income-included', note = '已人工確認包含在本月薪資') => actions.PATCH(request({ action: decision, expectedRevision: entry.revision, summaryHash: summary.sourceHash, note }), { params: Promise.resolve({ id: entry.id }) })
test('income review keeps monthly totals separate and prevents repeated Excel income', async (suite) => {
  await suite.test('same month, classification and amount trigger review without inventing an income date', async () => {
    const { entry, summary, state } = await incomeReviewFixture()
    assert.equal(incomeNeedsReview(entry, state.historySummaries), true)
    assert.equal(incomeNeedsReview({ ...entry, payload: { ...entry.payload, receivedDate: '2026-11-10' } }, state.historySummaries), false)
    assert.equal(incomeNeedsReview({ ...entry, payload: { ...entry.payload, incomeType: 'other' } }, state.historySummaries), false)
    assert.equal(incomeNeedsReview({ ...entry, payload: { ...entry.payload, amount: '48000.00' } }, state.historySummaries), false)
    assert.equal(summary.recordedDate, null); assert.equal(state.records.filter((row) => row.entityType === 'income').length, 1)
    assert.equal((await exporter.POST()).status, 409); assert.equal(database.batches.some((row) => row.payload.fileType === 'finance-changes'), false)
  })
  await suite.test('confirmed inclusion saves a note, preserves income once and excludes only repeated export', async () => {
    const { entry, summary } = await incomeReviewFixture(); const response = await reviewIncome(entry, summary)
    assert.equal(response.status, 200, await response.clone().text()); const current = (await response.json()).records[0]
    assert.equal(incomeIncluded(current), true); assert.equal(incomeReviewCurrent(current, summary), true)
    assert.equal(current.sourceRefs.incomeReview.note, '已人工確認包含在本月薪資'); assert.equal(current.syncedRevision, 0); assert.equal(current.masterRevision, null)
    assert.equal(current.payload.receivedDate, '2026-10-10'); assert.equal(monthlyTotals((await (await route.GET()).json()).records, '2026-10').income, 4807000)
    assert.equal((await exporter.POST()).status, 409)
    const extra = await create(salaryRecord('100.00')); const batch = await exportFile(); assert.deepEqual(batch.records.map((row) => row.clientId), [extra.id])
  })
  await suite.test('separate income remains exportable and exported snapshots cannot be silently withdrawn', async () => {
    const { entry, summary } = await incomeReviewFixture(); const response = await reviewIncome(entry, summary, 'income-separate', '另一份工作的收入')
    assert.equal(response.status, 200); const current = (await response.json()).records[0]
    assert.equal(incomeNeedsReview(current, [summary]), false); assert.equal(incomeIncluded(current), false)
    assert.equal((await exportFile()).records[0].clientId, entry.id)
    const exported = (await (await route.GET()).json()).records.find((row) => row.id === entry.id)
    assert.equal((await reviewIncome(exported, summary)).status, 409); assert.equal((await action(exported, 'clear-income-review')).status, 409)
  })
  await suite.test('review is reversible; editing income or reimporting changed summary requires fresh confirmation', async () => {
    const { entry, summary } = await incomeReviewFixture(); let current = (await (await reviewIncome(entry, summary)).json()).records[0]
    assert.equal((await action(current, 'clear-income-review')).status, 200)
    current = (await (await route.GET()).json()).records.find((row) => row.id === entry.id)
    assert.equal(incomeIncluded(current), false); assert.equal(incomeNeedsReview(current, [summary]), true)
    current = (await (await reviewIncome(current, summary)).json()).records[0]
    current = await create({ ...salaryRecord(), payload: { ...salaryRecord().payload, item: '薪資修正註記' } }, current.id, current.revision)
    assert.equal(incomeNeedsReview(current, [summary]), true); assert.equal((await exporter.POST()).status, 409)
    current = (await (await reviewIncome(current, summary)).json()).records[0]
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await historyFixture({ movement: false })); book.getWorksheet('月收支').getCell('G2').value = '彙總有更新'
    const bytes = Buffer.from(await book.xlsx.writeBuffer()); const preview = await historyPreview(bytes)
    assert.equal((await historyRoute.POST(historyRequest(bytes, 'apply', preview))).status, 200)
    const state = await (await route.GET()).json(); assert.equal(incomeNeedsReview(current, state.historySummaries), true)
    assert.equal((await reviewIncome(current, summary)).status, 409); assert.equal((await exporter.POST()).status, 409)
  })
  await suite.test('authorization, stale revision, mismatched amounts and competing confirmations are rejected atomically', async () => {
    const { entry, summary } = await incomeReviewFixture()
    authenticated = false; assert.equal((await reviewIncome(entry, summary)).status, 401); authenticated = true
    assert.equal((await actions.PATCH(request({ action: 'income-included', expectedRevision: entry.revision, summaryHash: summary.sourceHash, note: '確認' }), { params: Promise.resolve({ id: randomUUID() }) })).status, 409)
    assert.equal((await reviewIncome({ ...entry, revision: 99 }, summary)).status, 409)
    assert.equal((await reviewIncome(entry, summary, 'income-included', ' ')).status, 400)
    const different = await create(salaryRecord('100.00')); assert.equal((await reviewIncome(different, summary)).status, 409)
    const first = await reviewIncome(entry, summary); assert.equal(first.status, 200)
    const duplicate = await create(salaryRecord()); assert.equal((await reviewIncome(duplicate, summary)).status, 409)
    assert.equal(database.entries.find((row) => row.id === duplicate.id).sourceRefs, null)
  })
})
test('Excel history import uses preview, stable IDs and atomic confirmation', async (suite) => {
  await suite.test('prefixed SpreadsheetML, ISO date cells and unformatted serial dates keep exact calendar days', async () => {
    reset()
    assert.equal(excelSerialDate(1, false), '1900-01-01'); assert.equal(excelSerialDate(61, false), '1900-03-01'); assert.throws(() => excelSerialDate(60, false)); assert.equal(excelSerialDate(0, true), '1904-01-01')
    const JSZip = require('jszip'); const zip = await JSZip.loadAsync(await historyFixture())
    for (const [name, entry] of Object.entries(zip.files)) {
      if (!/^xl\/(workbook|styles|sharedStrings|worksheets\/sheet\d+)\.xml$/.test(name)) continue
      let xml = await entry.async('string')
      if (name === 'xl/worksheets/sheet1.xml') xml = xml.replace(/<c\b[^>]*r="A2"[^>]*>[\s\S]*?<\/c>/, '<c r="A2" t="d"><v>2026-10-12T00:00:00.000Z</v></c>').replace(/<c\b[^>]*r="P2"[^>]*>[\s\S]*?<\/c>/, '<c r="P2"><v>46308</v></c>')
      xml = xml.replace(/xmlns="http:\/\/schemas.openxmlformats.org\/spreadsheetml\/2006\/main"/, 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"').replace(/<(\/?)([A-Za-z][\w]*)(?=[\s/>])/g, '<$1x:$2')
      zip.file(name, xml)
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer' }); const preview = await historyPreview(buffer)
    const row = preview.rows.find((r) => r.sheet === '支出明細'); assert.equal(row.date, '2026-10-12'); assert.equal(row.status, 'new')
    const book = await readHistoryWorkbook(buffer, '日期測試.xlsx'); assert.equal(book.rows.find((r) => r.sheet === '支出明細').values['寫入日期'], '2026-10-13')
  })
  await suite.test('authentication, ZIP bounds, formulas, source IDs and explicit account mapping', async () => {
    reset(); const buffer = await historyFixture()
    if (process.env.FINANCE_BROWSER_FIXTURE) {
      const demo = new ExcelJS.Workbook(); await demo.xlsx.load(buffer); const sheet = demo.getWorksheet('支出明細')
      sheet.addRow(['2026-10-12', '2026-10', '餐飲', '轉帳午餐', 180, '轉帳', '否', null, 'EXP-demo-bank'])
      sheet.addRow(['2026-02-30', '2026-02', '餐飲', '日期待修正', 50, '現金', '否', null, 'EXP-demo-error'])
      sheet.addRow(['2026-10-12', '2026-10', '餐飲', '茶飲', 35, '現金', '否', null, 'EXP-demo-tea-1'])
      sheet.addRow(['2026-10-12', '2026-10', '餐飲', '茶飲', 35, '現金', '否', null, 'EXP-demo-tea-2'])
      fs.writeFileSync(process.env.FINANCE_BROWSER_FIXTURE, Buffer.from(await demo.xlsx.writeBuffer()))
    }
    authenticated = false; assert.equal((await historyRoute.POST(historyRequest(buffer))).status, 401); authenticated = true
    assert.throws(() => checkWorkbookZip(Buffer.from('not xlsx')))
    const bomb = Buffer.from(buffer); const central = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); bomb.writeUInt32LE(20_000_000, central + 24); assert.throws(() => checkWorkbookZip(bomb))
    const lying = Buffer.from(buffer); lying.writeUInt32LE(1, central + 24); assert.throws(() => checkWorkbookZip(lying))
    const first = await (await historyRoute.POST(historyRequest(buffer))).json()
    assert.equal(first.defaults.accounts['未提供帳戶（現金）'], 'cash')
    assert.equal(first.rows.find((r) => r.sheet === '支出明細').status, 'new', 'cash uses a wallet, not a guessed bank')
    const bankBook = new ExcelJS.Workbook(); await bankBook.xlsx.load(buffer); bankBook.getWorksheet('支出明細').getCell('F2').value = '轉帳'
    const bankBuffer = Buffer.from(await bankBook.xlsx.writeBuffer()); const missingBank = await (await historyRoute.POST(historyRequest(bankBuffer))).json()
    const bankRow = missingBank.rows.find((r) => r.sheet === '支出明細')
    assert.equal(bankRow.status, 'needs_mapping'); assert.equal(bankRow.paymentMethod, '轉帳'); assert.equal(bankRow.categoryName, '餐飲'); assert.equal(bankRow.date, '2026-10-12'); assert.equal(bankRow.amount, '85.00')
    assert.deepEqual(bankRow.requiredMapping, { kind: 'account', name: '未提供帳戶（轉帳）' })
    assert.equal((await historyRoute.POST(historyRequest(bankBuffer, 'apply', missingBank, [bankRow.key]))).status, 409)
    const mapped = await historyPreview(buffer); assert.equal(mapped.rows.filter((r) => r.status === 'new').length, 3)
    assert.equal(database.entries.length, 0); assert.equal(database.batches.length, 0)
    const bad = await historyPreview(await historyFixture({ badFormula: true })); assert.match(bad.rows.find((r) => r.sheet === '支出明細').message, /公式/)
    const dup = await historyPreview(await historyFixture({ duplicate: true })); assert.equal(dup.rows.filter((r) => r.sheet === '支出明細' && r.status === 'blocked').length, 2)
    const spacedBook = new ExcelJS.Workbook(); await spacedBook.xlsx.load(await historyFixture({ duplicate: true })); spacedBook.getWorksheet('支出明細').getCell('I3').value = ' EXP-history-1 '
    const spaced = await historyPreview(Buffer.from(await spacedBook.xlsx.writeBuffer())); assert.equal(spaced.rows.filter((r) => r.sheet === '支出明細' && r.status === 'blocked').length, 2)
    spacedBook.getWorksheet('支出明細').getCell('I3').value = '   '
    const blank = await historyPreview(Buffer.from(await spacedBook.xlsx.writeBuffer())); assert.match(blank.rows.find((r) => r.sheet === '支出明細' && r.row === 3).message, /資料ID未填寫/)
  })
  await suite.test('confirmed history is read-only, not re-exported, and keeps monthly income separate', async () => {
    reset(); const local = await create(expense('100'))
    const buffer = await historyFixture(); const preview = await historyPreview(buffer)
    const applied = await historyRoute.POST(historyRequest(buffer, 'apply', preview)); assert.equal(applied.status, 200, await applied.clone().text())
    const result = await applied.json(); assert.equal(result.imported, 2); assert.equal(result.summaries, 1)
    const data = await (await route.GET()).json(); const imported = data.records.filter(isHistoryRecord)
    assert.equal(imported.length, 2); assert.equal(imported.find((r) => r.entityType === 'expense').recordedDate, '2026-10-13')
    assert.equal(data.batches.length, 0); assert.equal(data.historySummaries[0].income, '48070.00'); assert.equal(data.records.filter((r) => r.entityType === 'income').length, 0)
    assert.equal(monthlyTotals(data.records, '2026-10').expense, 18500)
    const sent = await exportFile(); assert.deepEqual(sent.records.map((r) => r.clientId), [local.id])
    assert.equal((await route.POST(request({ records: [{ clientId: imported[0].id, expectedRevision: 1, record: expense() }] }))).status, 409)
    assert.equal((await action(imported[0], 'delete')).status, 409)
    const oldIds = imported.map((r) => r.id).sort()
    const again = await historyPreview(buffer); assert.equal(again.rows.every((r) => r.status === 'duplicate'), true)
    const replay = await historyRoute.POST(historyRequest(buffer, 'apply', preview)); assert.equal((await replay.json()).alreadyApplied, true)
    assert.deepEqual((await (await route.GET()).json()).records.filter(isHistoryRecord).map((r) => r.id).sort(), oldIds)
    assert.equal((await exporter.GET(new NextRequest(`http://localhost/api/finance/export?batchId=${database.batches.find((b) => b.payload.fileType === 'finance-history').id}`))).status, 400)
  })
  await suite.test('source updates preserve identity, missing rows do not delete, and stale preview rejects all writes', async () => {
    reset(); const first = await historyFixture(); let preview = await historyPreview(first)
    assert.equal((await historyRoute.POST(historyRequest(first, 'apply', preview))).status, 200)
    const original = database.entries.find((r) => r.kind === 'expense'); const originalId = original.id
    const changed = await historyFixture({ amount: 90, movement: false }); preview = await historyPreview(changed)
    assert.equal(preview.rows.find((r) => r.sheet === '支出明細').status, 'update')
    await create(expense('200'))
    assert.equal((await historyRoute.POST(historyRequest(changed, 'apply', preview))).status, 409)
    assert.equal(database.entries.find((r) => r.id === originalId).data.personalAmount, '85.00')
    preview = await historyPreview(changed); assert.equal((await historyRoute.POST(historyRequest(changed, 'apply', preview))).status, 200)
    const updated = database.entries.find((r) => r.id === originalId)
    assert.equal(updated.data.personalAmount, '90.00'); assert.equal(updated.recordedDate, original.recordedDate); assert.equal(updated.revision, 2)
    assert.equal(database.entries.some((r) => r.kind === 'cash_movement'), true, 'absence is not deletion')
    assert.equal(historySummaries(database.batches.map((b) => b.payload)).length, 1)
  })
  await suite.test('card/expense pairs count once; legacy unlinked card expenses remain historical only', async () => {
    reset(); const buffer = await historyFixture({ card: true }); const preview = await historyPreview(buffer)
    assert.equal(preview.rows.find((r) => r.sheet === '信用卡交易').status, 'new')
    assert.equal(preview.rows.some((r) => r.sheet === '支出明細'), false)
    assert.equal((await historyRoute.POST(historyRequest(buffer, 'apply', preview))).status, 200)
    const data = await (await route.GET()).json(); assert.equal(data.records.filter(isHistoryRecord).length, 3)
    assert.equal(monthlyTotals(data.records, '2026-10').expense, 8500); assert.equal(monthlyTotals(data.records, '2026-10').income, 0)
    const points = await historyPreview(await historyFixture({ card: true, points: 5 })); assert.equal(points.rows.find((r) => r.sheet === '信用卡交易').status, 'blocked')
    reset(); const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer); book.removeWorksheet(book.getWorksheet('信用卡交易').id)
    const legacy = Buffer.from(await book.xlsx.writeBuffer()); const legacyPreview = await historyPreview(legacy)
    assert.equal((await historyRoute.POST(historyRequest(legacy, 'apply', legacyPreview))).status, 200)
    const old = (await (await route.GET()).json()).records.find((r) => r.entityType === 'expense')
    assert.equal(old.payload.paymentMethod, 'credit_card'); assert.equal(old.payload.creditCardTransactionClientId, null)
    assert.equal((await route.POST(request({ records: [{ clientId: randomUUID(), expectedRevision: 0, record: { entityType: old.entityType, payload: old.payload } }] }))).status, 409)
  })
  await suite.test('suspected duplicates default to skipped, member isolation, and failed writes roll back', async () => {
    reset(); await create()
    const buffer = await historyFixture(); let preview = await historyPreview(buffer)
    assert.equal(preview.rows.find((r) => r.sheet === '支出明細').status, 'suspected')
    const selected = preview.rows.filter((r) => r.status === 'new').map((r) => r.key)
    assert.equal((await historyRoute.POST(historyRequest(buffer, 'apply', preview, selected))).status, 200)
    assert.equal(database.entries.filter((e) => e.kind === 'expense').length, 1)
    database.entries.forEach((e) => { e.userId = 'other' }); database.batches.forEach((b) => { b.userId = 'other' })
    preview = await historyPreview(buffer); assert.equal(preview.rows.every((r) => r.status === 'new'), true)
    const originalCreate = prisma.financeBatch.create
    prisma.financeBatch.create = async () => { throw new Error('forced transaction failure') }
    assert.equal((await historyRoute.POST(historyRequest(buffer, 'apply', preview))).status, 409)
    prisma.financeBatch.create = originalCreate
    assert.equal(database.entries.some((e) => e.userId === userId), false)
  })
  await suite.test('card repayments require explicit card mapping and never increase consumption', async () => {
    reset(); const book = new ExcelJS.Workbook(); await book.xlsx.load(await historyFixture())
    book.getWorksheet('資金異動').getCell('D2').value = 'credit_card_payment'
    const buffer = Buffer.from(await book.xlsx.writeBuffer()); const missing = await historyPreview(buffer)
    assert.equal(missing.rows.find((r) => r.sheet === '資金異動').status, 'needs_mapping')
    assert.deepEqual(missing.cardNames, ['未提供卡片（卡費繳款）'])
    const mapping = { ...missing.defaults, cards: { '未提供卡片（卡費繳款）': 'CUBE-9539' } }
    const preview = await historyPreview(buffer, mapping)
    assert.equal(preview.rows.find((r) => r.sheet === '資金異動').status, 'new')
    assert.equal((await historyRoute.POST(historyRequest(buffer, 'apply', preview))).status, 200)
    const records = (await (await route.GET()).json()).records
    assert.equal(monthlyTotals(records, '2026-10').expense, 8500)
    const payment = records.find((r) => r.entityType === 'cash_movement'); assert.equal(payment.payload.cardId, 'CUBE-9539'); assert.equal(payment.payload.statementMonth, null)
  })
})
test('real master workbook read-only mapping preview', { skip: !process.env.FINANCE_READ_ONLY_WORKBOOK }, async () => {
  const bytes = fs.readFileSync(process.env.FINANCE_READ_ONLY_WORKBOOK)
  const workbook = await readHistoryWorkbook(bytes, path.basename(process.env.FINANCE_READ_ONLY_WORKBOOK))
  const preferences = defaultPreferences(); const available = workbookMappings(workbook, preferences)
  for (const key of available.accountNames) if (key === '未提供帳戶（轉帳）') available.defaults.accounts[key] = 'cathay' // Test-only explicit bank mapping, never saved.
  const groups = prepareHistory(workbook, userId, preferences, available.defaults, [], [])
  console.log(JSON.stringify({ readOnlyWorkbook: workbook.fileName, rows: workbook.rows.length, groups: groups.length, statuses: Object.fromEntries(['new', 'update', 'duplicate', 'suspected', 'needs_mapping', 'blocked'].map((status) => [status, groups.filter((r) => r.status === status).length])), blocked: groups.filter((g) => g.status === 'blocked').map((g) => ({ sheet: g.sheet, row: g.row, message: g.message })) }))
  assert.equal(groups.filter((g) => g.status === 'blocked').length, 0)
  assert.equal(groups.filter((g) => g.status === 'needs_mapping').length, 0)
  assert.deepEqual(fs.readFileSync(process.env.FINANCE_READ_ONLY_WORKBOOK), bytes, 'formal workbook unchanged')
})

test('cash wallet preserves old preferences and does not change the exchange v1 contract', async () => {
  reset()
  const legacy = defaultPreferences(); legacy.accounts = legacy.accounts.filter((a) => a.id !== 'cash'); legacy.accounts[0].name = '主要銀行'
  const upgraded = readPreferences(legacy)
  assert.equal(upgraded.accounts.length, 3); assert.equal(upgraded.accounts[0].name, '主要銀行'); assert.equal(legacy.accounts.length, 2)
  const wallet = { ...expense('100'), payload: { ...expense('100').payload, accountId: 'cash' } }
  assert.equal(recordDataSchema.safeParse(wallet).success, true); assert.equal(exchangeRecordSchema.safeParse(wallet).success, false)
  assert.equal(recordDataSchema.safeParse({ ...wallet, payload: { ...wallet.payload, paymentMethod: 'bank_transfer' } }).success, false)
  assert.equal(templateRecord(expense()).payload.accountId, 'cash')
  const saved = await create(wallet)
  const empty = await exporter.POST(); assert.equal(empty.status, 409); assert.match(await empty.text(), /現金錢包/)
  assert.equal(database.entries.find((e) => e.id === saved.id).exportedRevision, 0)
  const bank = await create(expense('200')); const batch = await exportFile()
  assert.deepEqual(batch.records.map((r) => r.clientId), [bank.id]); assert.equal(database.entries.find((e) => e.id === saved.id).syncedRevision, 0)
  const invalidReceipt = receipt(batch); invalidReceipt.results[0].canonicalPayload.accountId = 'cash'; invalidReceipt.results[0].masterHash = payloadHash(invalidReceipt.results[0].canonicalPayload)
  assert.equal((await apply(invalidReceipt)).status, 409, 'old exchange receipts may not silently introduce a wallet')
  assert.equal(database.entries.find((e) => e.id === bank.id).data.accountId, 'cathay')
  const buffer = await historyFixture()
  const wrong = await historyPreview(buffer, { categories: { 餐飲: 'food' }, accounts: { '未提供帳戶（現金）': 'cathay', 國泰: 'cathay' } })
  assert.equal(wrong.rows.find((r) => r.sheet === '支出明細').status, 'needs_mapping')
  const correct = await historyPreview(buffer); const cashRow = correct.rows.find((r) => r.sheet === '支出明細')
  assert.equal(cashRow.accountName, '現金錢包'); assert.equal(cashRow.categoryName, '餐飲')
  const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer); book.getWorksheet('支出明細').getCell('A2').value = '2026-02-30'
  const error = await historyPreview(Buffer.from(await book.xlsx.writeBuffer())); const errorRow = error.rows.find((r) => r.sheet === '支出明細')
  assert.equal(errorRow.status, 'blocked'); assert.equal(errorRow.date, '2026-02-30'); assert.equal(errorRow.amount, '85.00'); assert.equal(errorRow.categoryName, '餐飲')
})

test('date picker handles leap years, short months and year boundaries without timezone shifts', () => {
  const { calendarDays, parsePickerValue, pickerValue, shiftPickerMonth } = load('src/lib/date-picker.ts')
  assert.equal(parsePickerValue('2026-02-29', 'date'), null)
  assert.equal(parsePickerValue('2028-02-29', 'date').getUTCDate(), 29)
  assert.equal(parsePickerValue('2026-13', 'month'), null)
  assert.equal(pickerValue(shiftPickerMonth(parsePickerValue('2026-01-31', 'date'), 1), 'date'), '2026-02-28')
  assert.equal(pickerValue(shiftPickerMonth(parsePickerValue('2026-12-31', 'date'), 1), 'date'), '2027-01-31')
  assert.equal(pickerValue(parsePickerValue('0001-01-01', 'date'), 'date'), '0001-01-01')
  const days = calendarDays(2027, 0)
  assert.equal(days.length, 42); assert.equal(days[0].getUTCDay(), 0)
  assert.equal(pickerValue(days[0], 'date'), '2026-12-27')
  assert.equal(new Set(days.map((date) => pickerValue(date, 'date'))).size, 42)
})

test('personal finance customization preserves the master contract', async (suite) => {
  const saveSettings = (preferences, expectedRevision = 0) => preferencesRoute.POST(request({ preferences, expectedRevision }))
  await suite.test('preferences authenticate, persist per member and reject stale writes', async () => {
    reset(); authenticated = false
    assert.equal((await saveSettings(defaultPreferences())).status, 401)
    authenticated = true
    const settings = defaultPreferences(); settings.accounts[0].name = '生活帳戶'; settings.cardName = '日常卡'
    assert.equal((await saveSettings(settings)).status, 200)
    assert.equal(database.entries.length, 0, 'saving preferences never creates transactions')
    const first = await (await route.GET()).json()
    assert.equal(first.preferences.accounts[0].name, '生活帳戶'); assert.equal(first.preferencesRevision, 1)
    assert.equal((await saveSettings(defaultPreferences())).status, 409)
    database.ledgers[0].userId = 'another-user'
    assert.equal((await (await route.GET()).json()).preferences.accounts[0].name, '國泰')
    assert.equal((await saveSettings(defaultPreferences())).status, 200)
    assert.equal(database.ledgers.length, 2)
  })
  await suite.test('old ledgers without preference fields upgrade without changing dataset', async () => {
    reset(); await create(); const exported = await exportFile()
    delete database.ledgers[0].preferencesRevision; delete database.ledgers[0].preferences
    assert.equal((await saveSettings(defaultPreferences())).status, 200)
    assert.equal((await (await route.GET()).json()).datasetId, exported.datasetId)
    assert.equal(database.batches.length, 1)
  })
  await suite.test('invalid category trees, unsupported accounts and disabled defaults do not save', async () => {
    reset()
    const invalid = []
    let settings = defaultPreferences(); settings.categories[0].parentId = 'food'; invalid.push(settings)
    settings = defaultPreferences(); settings.accounts[0].id = 'unmapped-bank'; invalid.push(settings)
    settings = defaultPreferences(); settings.categories[0].active = false; invalid.push(settings)
    settings = defaultPreferences(); settings.categories.push({ ...settings.categories[0] }); invalid.push(settings)
    settings = defaultPreferences(); settings.budgets.push({ month: '2026-10', total: '-1', categories: {} }); invalid.push(settings)
    for (const item of invalid) assert.equal((await saveSettings(item)).status, 400)
    assert.equal(database.ledgers.length, 0)
  })
  await suite.test('local subcategories persist, export only mapped codes, and preserve historical data', async () => {
    reset(); const settings = defaultPreferences()
    settings.categories.push({ id: 'breakfast', name: '早餐', code: 'food', parentId: 'food', icon: '🥐', color: '#df9587', active: true })
    assert.equal((await saveSettings(settings)).status, 200)
    const id = randomUUID()
    assert.equal((await route.POST(request({ records: [{ clientId: id, expectedRevision: 0, localCategoryId: 'breakfast', record: expense() }] }))).status, 201)
    const batch = await exportFile()
    assert.equal(batch.records[0].payload.categoryCode, 'food')
    assert.equal('localCategoryId' in batch.records[0], false)
    const entry = (await (await route.GET()).json()).records[0]
    assert.equal(categoryForRecord(entry, settings).name, '早餐')
    const changed = structuredClone(settings); changed.categories.at(-1).code = 'transport'; changed.categories.at(-1).parentId = null
    assert.equal((await saveSettings(changed, 1)).status, 409)
    const removed = structuredClone(settings); removed.categories.pop()
    assert.equal((await saveSettings(removed, 1)).status, 409)
    settings.categories.at(-1).active = false
    assert.equal((await saveSettings(settings, 1)).status, 200)
    assert.equal((await route.POST(request({ records: [{ clientId: randomUUID(), expectedRevision: 0, localCategoryId: 'breakfast', record: expense() }] }))).status, 409)
    assert.equal((await route.POST(request({ records: [{ clientId: id, expectedRevision: 1, localCategoryId: 'breakfast', record: expense('90') }] }))).status, 201)
    assert.equal(database.entries.length, 1)
    const corrected = { ...entry, payload: { ...entry.payload, categoryCode: 'healthcare' } }
    assert.equal(categoryForRecord(corrected, settings).name, '醫療保健')
  })
  await suite.test('disabled accounts block new entries but allow existing records to be edited', async () => {
    reset(); const existing = await create(); const settings = defaultPreferences()
    settings.accounts[0].active = false; settings.defaults.accountId = 'ctbc'
    await saveSettings(settings)
    assert.equal((await route.POST(request({ records: [{ clientId: randomUUID(), expectedRevision: 0, record: expense() }] }))).status, 409)
    assert.equal((await route.POST(request({ records: [{ clientId: existing.id, expectedRevision: 1, record: expense('100') }] }))).status, 201)
  })
  await suite.test('recurring templates advance only with an atomic confirmed entry; stale use rolls back', async () => {
    reset(); const settings = defaultPreferences()
    const template = { id: 'breakfast', name: '早餐', record: expense(), localCategoryId: 'food', repeat: 'monthly', nextDate: '2026-01-31', reminderDay: 31, active: true }
    settings.templates.push(template); assert.equal((await saveSettings(settings)).status, 200)
    assert.equal(database.entries.length, 0)
    const write = () => ({ records: [{ clientId: randomUUID(), expectedRevision: 0, localCategoryId: 'food', record: expense() }], templateId: 'breakfast', expectedPreferencesRevision: 1 })
    assert.equal((await route.POST(request(write()))).status, 201)
    assert.equal(database.ledgers[0].preferencesRevision, 2)
    assert.ok(database.ledgers[0].preferences.templates[0].nextDate > taipeiDate())
    assert.equal((await route.POST(request(write()))).status, 409)
    assert.equal(database.entries.length, 1, 'stale template confirmation must roll back all entry writes')
    assert.equal(nextReminder(template, '2026-01-31'), '2026-02-28')
    assert.equal(nextReminder({ ...template, nextDate: '2026-02-28' }, '2026-02-28'), '2026-03-31')
    assert.equal(nextReminder({ ...template, nextDate: '2028-01-31' }, '2028-01-31'), '2028-02-29')
    assert.equal(nextReminder({ ...template, repeat: 'weekly', nextDate: '2026-10-12' }, '2026-10-12'), '2026-10-19')
  })
  await suite.test('budgets aggregate children once and exclude deleted entries, card gross and movements', async () => {
    reset(); const settings = defaultPreferences()
    settings.categories.push({ id: 'breakfast', name: '早餐', code: 'food', parentId: 'food', icon: '🥐', color: '#df9587', active: true })
    settings.budgets.push({ month: '2026-10', total: '1000.00', categories: { food: '500.00', breakfast: '200.00' } })
    assert.equal(preferencesSchema.safeParse(settings).success, true); await saveSettings(settings)
    await route.POST(request({ records: [{ clientId: randomUUID(), expectedRevision: 0, localCategoryId: 'breakfast', record: expense('50') }] }))
    const removed = await create(expense('100')); await action(removed, 'delete')
    await create({ entityType: 'income', payload: { receivedDate: '2026-10-12', incomeType: 'salary', item: '薪資', amount: '30000', accountId: 'cathay', isRecurring: true, notes: null } })
    await create({ entityType: 'cash_movement', payload: { movementDate: '2026-10-12', accountId: 'cathay', movementType: 'credit_card_payment', amount: '2000', balanceAfter: null, notes: null, cardId: 'CUBE-9539', statementMonth: null } })
    await create({ entityType: 'credit_card_transaction', payload: { cardId: 'CUBE-9539', purchaseDate: '2026-10-12', postingDate: null, consumptionDate: '2026-10-12', statementMonth: null, purpose: '尚未結算', usageDate: null, usageHours: null, grossAmount: '1000', reimbursementReceivedAmount: '0', pointsOffsetAmount: '0.00', personalAmount: null, status: 'pending', expenseClientId: null, notes: null } })
    const records = (await (await route.GET()).json()).records
    const report = reportTotals(records, settings, '2026-10-01', '2026-10-31')
    assert.equal(report.expense, 5000); assert.equal(report.categories.food, 5000); assert.equal(report.categories.breakfast, 5000); assert.equal(report.income, 3000000)
    assert.equal(reportTotals(records, settings, '2026-11-01', '2026-11-30').expense, 0)
    const copy = templateRecord(records.find((entry) => entry.entityType === 'credit_card_transaction'))
    assert.equal(copy.payload.expenseClientId, null); assert.equal(copy.payload.status, 'pending'); assert.equal(copy.payload.reimbursementReceivedAmount, '0.00')
  })
})

test('finance data and exchange contract', async (suite) => {
  await suite.test('the peer session mock conforms to the exact shared return schema', () => {
    const sample = JSON.parse(fs.readFileSync(path.join(root, 'docs/finance-results-v1.mock.json'), 'utf8'))
    assert.equal(returnSchema.safeParse(sample).success, true)
    sample.results[0].warnings = null
    assert.equal(returnSchema.safeParse(sample).success, false)
  })
  await suite.test('decimal arithmetic and Taipei event dates are exact', () => {
    assert.equal(moneyToCents('0.10') + moneyToCents('0.20'), 30)
    assert.equal(normalizeMoney('00085.5'), '85.50')
    assert.throws(() => moneyToCents('1.001')); assert.throws(() => moneyToCents('1e3'))
    assert.equal(taipeiDate(new Date('2026-10-11T16:30:00Z')), '2026-10-12')
  })
  await suite.test('all routes require an authenticated user', async () => {
    reset(); authenticated = false
    for (const response of [await route.GET(), await route.POST(request({})), await exporter.POST(), await exporter.GET(new NextRequest('http://localhost/api/finance/export')), await apply({}), await action({ id: randomUUID(), revision: 1 }, 'delete')]) assert.equal(response.status, 401)
    assert.equal(database.entries.length, 0)
  })
  await suite.test('invalid dates, precision, account and negative amounts do not write', async () => {
    reset()
    for (const patch of [{ expenseDate: '2026-02-30' }, { personalAmount: '1.001' }, { personalAmount: '-3.00' }, { accountId: null }, { paymentMethod: '' }, { unknown: 'field' }]) {
      const record = expense(); Object.assign(record.payload, patch)
      assert.equal((await route.POST(request({ records: [{ clientId: randomUUID(), expectedRevision: 0, record }] }))).status, 400)
    }
    assert.equal(database.entries.length, 0)
  })
  await suite.test('foreign records and batches are isolated', async () => {
    reset(); const entry = await create(); database.entries[0].userId = 'other'
    assert.equal((await action(entry, 'delete')).status, 409)
    assert.equal((await route.POST(request({ records: [{ clientId: entry.id, expectedRevision: 0, record: expense() }] }))).status, 409)
    assert.equal((await route.GET()).status, 200); assert.equal((await (await route.GET()).json()).records.length, 0)
    database.entries[0].userId = userId; const batch = await exportFile(); database.batches[0].userId = 'other'
    assert.equal((await apply(receipt(batch))).status, 409)
    assert.equal((await exporter.GET(new NextRequest(`http://localhost/api/finance/export?batchId=${batch.batchId}`))).status, 404)
  })
  await suite.test('stale edits roll back without changing content', async () => {
    reset(); const entry = await create(); await create(expense('90'), entry.id, 1)
    assert.equal((await route.POST(request({ records: [{ clientId: entry.id, expectedRevision: 1, record: expense('100') }] }))).status, 409)
    assert.equal(database.entries[0].data.personalAmount, '90.00')
  })
  await suite.test('exported changes preserve IDs, dates and original batch snapshots', async () => {
    reset(); const entry = await create(); const first = await exportFile(); const second = await exportFile()
    assert.equal(first.records[0].changeId, second.records[0].changeId)
    assert.equal(first.records[0].clientUpdatedAt, second.records[0].clientUpdatedAt)
    await create(expense('100'), entry.id, 1)
    const downloaded = await (await exporter.GET(new NextRequest(`http://localhost/api/finance/export?batchId=${first.batchId}`))).json()
    assert.deepEqual(downloaded, first)
    assert.equal(downloaded.records[0].payload.personalAmount, '85.00')
  })
  await suite.test('preview is read-only; apply canonical corrections once', async () => {
    reset(); await create(); const batch = await exportFile(); const file = receipt(batch)
    file.results[0].canonicalPayload = { ...file.results[0].canonicalPayload, categoryCode: 'daily_goods' }
    file.results[0].masterHash = payloadHash(file.results[0].canonicalPayload)
    assert.equal((await apply(file, 'preview')).status, 200)
    assert.equal(database.entries[0].syncedRevision, 0)
    assert.equal((await apply(file)).status, 200)
    assert.equal(database.entries[0].data.categoryCode, 'daily_goods')
    assert.equal(database.entries[0].syncedRevision, 1)
    assert.equal((await (await apply(file)).json()).alreadyApplied, true)
    file.results[0].warnings.push({ code: 'X', field: null, message: 'changed' })
    assert.equal((await apply(file)).status, 409)
  })
  await suite.test('wrong dataset, hash, revision and missing rows never confirm sync', async () => {
    reset(); await create(); await create(expense('12')); const batch = await exportFile()
    const bad = [receipt(batch, { datasetId: randomUUID() }), receipt(batch, { results: [] }), receipt(batch)]
    bad[2].results[0].masterHash = `sha256:${'0'.repeat(64)}`
    const revision = receipt(batch); revision.results[0].submittedClientRevision++
    bad.push(revision)
    for (const file of bad) assert.notEqual((await apply(file)).status, 200)
    assert.equal(database.entries[0].syncedRevision, 0)
  })
  await suite.test('late return stores shadow without overwriting; choosing local rebases', async () => {
    reset(); const entry = await create(); const batch = await exportFile()
    await create(expense('95'), entry.id, 1)
    assert.equal((await (await apply(receipt(batch))).json()).conflict, true)
    assert.equal(database.entries[0].data.personalAmount, '95.00')
    assert.equal((await exporter.POST()).status, 409)
    const local = (await (await route.GET()).json()).records[0]
    assert.equal((await action(local, 'keep-local')).status, 200)
    assert.equal(database.entries[0].revision, 3)
    const next = await exportFile()
    assert.equal(next.records[0].baseMasterRevision, 1)
    assert.equal(next.records[0].payload.personalAmount, '95.00')
  })
  await suite.test('choosing Excel replaces only after explicit resolution', async () => {
    reset(); const entry = await create(); const batch = await exportFile(); await create(expense('95'), entry.id, 1); await apply(receipt(batch))
    const local = (await (await route.GET()).json()).records[0]
    assert.equal((await action(local, 'use-master')).status, 200)
    assert.equal(database.entries[0].data.personalAmount, '85.00')
    assert.equal(database.entries[0].syncedRevision, database.entries[0].revision)
  })
  await suite.test('rejected and recovery results remain pending; recovery blocks new exports', async () => {
    reset(); await create(); const batch = await exportFile(); const file = receipt(batch, { batchStatus: 'recovery_required' })
    Object.assign(file.results[0], { status: 'not_applied', masterId: null, masterRevision: null, masterHash: null, recordedDate: null, canonicalPayload: null, errors: [{ code: 'RECOVERY_REQUIRED', field: null, message: '需人工核對' }] })
    assert.equal(returnSchema.safeParse(file).success, true)
    assert.equal((await apply(file)).status, 200)
    assert.equal(database.entries[0].syncedRevision, 0)
    assert.equal((await apply(receipt(batch))).status, 409, 'a replacement receipt must not bypass unresolved recovery')
    assert.equal((await exporter.POST()).status, 409)
    const entry = (await (await route.GET()).json()).records[0]
    await create(expense('90'), entry.id, entry.revision)
    assert.equal((await exporter.POST()).status, 409, 'editing a row must not bypass batch recovery')
  })
  await suite.test('large queues export bounded batches instead of becoming impossible to sync', async () => {
    reset()
    for (let i = 0; i < 101; i++) await create(expense('1.00'))
    const batch = await exportFile()
    assert.equal(batch.records.length, 100)
    await apply(receipt(batch))
    const next = await exportFile()
    assert.equal(next.records.length, 1)
    assert.ok(!batch.records.some((row) => row.clientId === next.records[0].clientId))
  })
  await suite.test('card settlement requires paired expense; repayment is not extra consumption', async () => {
    reset(); const cardId = randomUUID(); const expenseId = randomUUID()
    const card = { entityType: 'credit_card_transaction', payload: { cardId: 'CUBE-9539', purchaseDate: '2026-10-12', postingDate: null, consumptionDate: '2026-10-12', statementMonth: null, purpose: '午餐代刷', usageDate: null, usageHours: null, grossAmount: '340.00', reimbursementReceivedAmount: '170.00', pointsOffsetAmount: '0.00', personalAmount: '170.00', status: 'settled', expenseClientId: expenseId, notes: null } }
    assert.equal((await route.POST(request({ records: [{ clientId: cardId, expectedRevision: 0, record: card }] }))).status, 409)
    const paired = expense('170'); Object.assign(paired.payload, { paymentMethod: 'credit_card', accountId: null, creditCardTransactionClientId: cardId })
    assert.equal((await route.POST(request({ records: [{ clientId: cardId, expectedRevision: 0, record: card }, { clientId: expenseId, expectedRevision: 0, record: paired }] }))).status, 201)
    await create({ entityType: 'cash_movement', payload: { movementDate: '2026-10-12', accountId: 'cathay', movementType: 'credit_card_payment', amount: '340.00', balanceAfter: null, cardId: 'CUBE-9539', statementMonth: null, notes: null } })
    const totals = monthlyTotals((await (await route.GET()).json()).records, '2026-10')
    assert.equal(totals.expense, 17000); assert.equal(totals.income, 0); assert.equal(totals.movement, 34000)
    const batch = await exportFile(); assert.equal(batch.records.length, 3)
    const cardEntry = (await (await route.GET()).json()).records.find((row) => row.id === cardId)
    assert.equal((await action(cardEntry, 'delete')).status, 200)
    assert.equal(database.entries.filter((row) => row.deleted).length, 2)
    const deleted = (await exportFile()).records.filter((row) => row.operation === 'delete')
    assert.equal(deleted.length, 2)
    const current = (await (await route.GET()).json()).records.find((row) => row.id === cardId)
    assert.equal((await action(current, 'restore')).status, 200)
    assert.equal(database.entries.filter((row) => row.deleted).length, 0)
  })
  await suite.test('inconsistent settlements and nonzero points are rejected', async () => {
    reset()
    const card = { entityType: 'credit_card_transaction', payload: { cardId: 'CUBE-9539', purchaseDate: '2026-10-12', postingDate: null, consumptionDate: '2026-10-12', statementMonth: null, purpose: '代刷', usageDate: null, usageHours: null, grossAmount: '100', reimbursementReceivedAmount: '101', pointsOffsetAmount: '0.00', personalAmount: null, status: 'pending', expenseClientId: null, notes: null } }
    for (const patch of [{ reimbursementReceivedAmount: '101' }, { reimbursementReceivedAmount: '0', pointsOffsetAmount: '5.00' }]) {
      Object.assign(card.payload, patch)
      assert.equal((await route.POST(request({ records: [{ clientId: randomUUID(), expectedRevision: 0, record: card }] }))).status, 400)
    }
    assert.equal(database.entries.length, 0)
  })
})
