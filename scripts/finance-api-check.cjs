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
  return Object.entries(where).every(([key, value]) => value && typeof value === 'object' ? value.in.includes(row[key]) : row[key] === value)
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
      const row = { id: randomUUID(), revision: 1, exportedRevision: 0, syncedRevision: 0, changeId: randomUUID(), deleted: false, syncError: null, sourceRefs: null, masterRevision: null, masterHash: null, recordedDate: null, serverShadow: null, createdAt: new Date(), updatedAt: new Date(), ...data }
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
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
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
const { payloadHash } = load('src/lib/finance/sync.ts')
const { monthlyTotals, returnSchema } = load('src/lib/finance/schema.ts')
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
