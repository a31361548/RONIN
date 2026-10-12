// Run with: node scripts/calendar-api-check.cjs
// Routes execute against in-memory fixtures; no database or server is used.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const userId = '111111111111111111111111'
const entryId = '222222222222222222222222'
let authenticated = true
let existingNote
let existingTodo
let writes

const prisma = {
  note: {
    findUnique: async () => existingNote,
    create: async ({ data }) => { writes.push(data); return { id: entryId, updatedAt: new Date(), ...data } },
    update: async ({ data }) => { writes.push(data); return { ...existingNote, ...data } },
    delete: async () => { writes.push('delete') },
  },
  todo: {
    findFirst: async ({ where }) => existingTodo?.userId === where.userId ? existingTodo : null,
    create: async ({ data }) => { writes.push(data); return { id: entryId, ...data } },
    update: async ({ data }) => { writes.push(data); return { ...existingTodo, ...data } },
  },
}
const cache = new Map()
function load(relativePath) {
  const filename = path.resolve(root, relativePath)
  if (cache.has(filename)) return cache.get(filename)
  const source = fs.readFileSync(filename, 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const module = { exports: {} }
  const mockedRequire = (name) => {
    if (name === '@/lib/prisma') return { prisma }
    if (name === '@/lib/currentUser') return { getAuthenticatedUser: async () => authenticated ? { id: userId } : null }
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`)
    return require(name)
  }
  new Function('require', 'module', 'exports', compiled)(mockedRequire, module, module.exports)
  cache.set(filename, module.exports)
  return module.exports
}
const notes = load('src/app/api/notes/route.ts')
const note = load('src/app/api/notes/[id]/route.ts')
const todos = load('src/app/api/todos/route.ts')
const todo = load('src/app/api/todos/[id]/route.ts')
const context = { params: Promise.resolve({ id: entryId }) }
const request = (body) => new Request('http://localhost/api/calendar-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
function reset() {
  authenticated = true
  writes = []
  existingNote = { id: entryId, userId, title: '原行程', content: '原內容', noteDate: '2026-10-12', startAt: new Date('2026-10-12T01:00:00Z'), endAt: new Date('2026-10-12T02:00:00Z') }
  existingTodo = { id: entryId, userId, title: '原待辦', startAt: new Date('2020-01-01T01:00:00Z'), endAt: new Date('2020-01-01T02:00:00Z'), status: 'COMPLETED', tagIds: [], recurrence: 'NONE', recurrenceInterval: 1, recurrenceEndAt: null, priority: 'MEDIUM' }
}

test('calendar API contract', async (suite) => {
  await suite.test('unauthenticated writes are rejected', async () => {
    reset(); authenticated = false
    assert.equal((await notes.POST(request({ title: '私人行程' }))).status, 401)
    assert.equal((await note.PATCH(request({ title: '修改' }), context)).status, 401)
    assert.equal(writes.length, 0)
  })
  await suite.test('legacy notes remain unplanned', async () => {
    reset()
    const response = await notes.POST(request({ title: '舊筆記方式', content: '<p>內容</p>' }))
    assert.equal(response.status, 201)
    const result = await response.json()
    assert.equal(result.note.noteDate, null)
    assert.equal(result.note.startAt, null)
    assert.equal(result.note.endAt, null)
    assert.equal(result.note.content, '<p>內容</p>')
  })
  await suite.test('impossible dates are rejected without writes', async () => {
    reset()
    for (const date of ['2026-02-30', '2026-13-01', '2026-2-01']) {
      assert.equal((await notes.POST(request({ title: '行程', noteDate: date }))).status, 400)
    }
    assert.equal(writes.length, 0)
  })
  await suite.test('all-day events retain the chosen calendar date', async () => {
    reset()
    assert.equal((await notes.POST(request({ title: '整日', noteDate: '2028-02-29' }))).status, 201)
    assert.equal(writes[0].noteDate, '2028-02-29')
    assert.equal(writes[0].startAt, null)
  })
  await suite.test('timed and cross-day events retain their exact timestamps', async () => {
    reset()
    const body = { title: '跨日行程', noteDate: '2026-10-12', startAt: '2026-10-12T15:30:00Z', endAt: '2026-10-13T01:00:00Z' }
    assert.equal((await notes.POST(request(body))).status, 201)
    assert.equal(writes[0].startAt.getTime(), new Date(body.startAt).getTime())
    assert.equal(writes[0].endAt.getTime(), new Date(body.endAt).getTime())
  })
  await suite.test('incomplete and reversed time ranges are rejected', async () => {
    reset()
    const base = { title: '行程', noteDate: '2026-10-12', startAt: '2026-10-12T01:00:00Z' }
    for (const body of [base, { ...base, endAt: base.startAt }, { ...base, endAt: '2026-10-12T00:00:00Z' }, { ...base, noteDate: null, endAt: '2026-10-12T02:00:00Z' }]) {
      assert.equal((await notes.POST(request(body))).status, 400)
    }
    assert.equal(writes.length, 0)
  })
  await suite.test('editing content does not reschedule an event', async () => {
    reset()
    const response = await note.PATCH(request({ title: '更新標題', content: '<p>會議紀錄</p>' }), context)
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.note.noteDate, '2026-10-12')
    assert.equal(result.note.startAt, '2026-10-12T01:00:00.000Z')
    assert.equal(result.note.endAt, '2026-10-12T02:00:00.000Z')
  })
  await suite.test('partial rescheduling validates against the existing end', async () => {
    reset()
    assert.equal((await note.PATCH(request({ startAt: '2026-10-12T03:00:00Z' }), context)).status, 400)
    assert.equal(writes.length, 0)
  })
  await suite.test('timed events can become all-day or unplanned without losing content', async () => {
    reset()
    assert.equal((await note.PATCH(request({ noteDate: null, startAt: null, endAt: null }), context)).status, 200)
    assert.equal(writes[0].noteDate, null)
    assert.equal(writes[0].startAt, null)
    assert.equal(writes[0].content, undefined)
  })
  await suite.test('another user cannot edit or delete an entry', async () => {
    reset(); existingNote.userId = '333333333333333333333333'
    assert.equal((await note.PATCH(request({ title: '越權' }), context)).status, 404)
    assert.equal((await note.DELETE(request({}), context)).status, 404)
    assert.equal(writes.length, 0)
  })
  await suite.test('historical todo timestamps are preserved on creation and editing', async () => {
    reset()
    const body = { title: '過去安排', startAt: '2020-01-01T01:00:00Z', endAt: '2020-01-01T02:00:00Z' }
    assert.equal((await todos.POST(request(body))).status, 201)
    assert.equal(writes[0].startAt.getTime(), new Date(body.startAt).getTime())
    assert.equal((await todo.PATCH(request(body), context)).status, 200)
    assert.equal(writes[1].startAt.getTime(), new Date(body.startAt).getTime())
    assert.equal(writes[1].status, 'COMPLETED')
  })
})
