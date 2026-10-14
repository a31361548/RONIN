// Exercise real component callbacks with in-memory hooks and fetch; no real accounts.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { randomUUID } = require('node:crypto')
const root = path.resolve(__dirname, '..')
let active
const react = {
  useState(initial) {
    const owner = active; const index = owner.index++
    if (!(index in owner.states)) owner.states[index] = typeof initial === 'function' ? initial() : initial
    return [owner.states[index], (value) => { owner.states[index] = typeof value === 'function' ? value(owner.states[index]) : value }]
  },
  useRef(initial) { return react.useState(() => ({ current: initial }))[0] },
  useEffect() {},
}
const cache = new Map()
function load(filename) {
  if (cache.has(filename)) return cache.get(filename)
  const module = { exports: {} }
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  const mockedRequire = (name) => {
    if (name === 'react') return react
    if (name === 'react/jsx-runtime') { const jsx = (type, props) => ({ type, props }); return { jsx, jsxs: jsx, Fragment: 'fragment' } }
    const resolved = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : name.startsWith('./') ? path.resolve(path.dirname(filename), name) : null
    if (!resolved) return require(name)
    const candidate = ['.ts', '.tsx'].map((extension) => resolved + extension).find(fs.existsSync)
    if (!candidate) throw new Error(`Missing module ${name}`)
    if (candidate.endsWith('.tsx') && !/PersonalFinancePage|FinanceSyncPanel/.test(candidate)) {
      const component = path.basename(candidate, '.tsx'); return { [component]: component }
    }
    return load(candidate)
  }
  new Function('require', 'module', 'exports', compiled)(mockedRequire, module, module.exports)
  cache.set(filename, module.exports); return module.exports
}
const { PersonalFinancePage } = load(path.join(root, 'src/components/finance/PersonalFinancePage.tsx'))
const { FinanceSyncPanel } = load(path.join(root, 'src/components/finance/FinanceSyncPanel.tsx'))
function renderer(component, props) {
  const owner = { states: [], index: 0, render() { active = owner; owner.index = 0; return component(props) } }
  return owner
}
function nodes(tree) { return !tree ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [] }
const text = (tree) => !tree ? '' : Array.isArray(tree) ? tree.map(text).join('') : typeof tree === 'object' ? text(tree.props?.children) : String(tree)
const response = (body) => ({ ok: true, json: async () => body })
test('saved entries close the editor and retain success when the list reload fails', async () => {
  const original = global.fetch
  try {
    let posts = 0
    const entry = { id: randomUUID(), entityType: 'expense', payload: { expenseDate: '2026-10-14', categoryCode: 'food', item: '測試早餐', personalAmount: '85.00', paymentMethod: 'cash', accountId: 'cash', isFixed: false, notes: null, creditCardTransactionClientId: null }, revision: 1, syncedRevision: 0, exportedRevision: 0, deleted: false, masterRevision: null, serverShadow: null, sourceRefs: null }
    global.fetch = async (url, options) => { if (options) { posts++; return response({ records: [entry] }) } throw new Error('清單離線') }
    const page = renderer(PersonalFinancePage); let tree = page.render(); page.states[1] = false
    tree = page.render(); nodes(tree).find((node) => node.type === 'button' && text(node) === '＋新增記帳').props.onClick()
    tree = page.render(); await nodes(tree).find((node) => node.type === 'FinanceEntryEditor').props.onSave([])
    tree = page.render(); assert.equal(posts, 1); assert.ok(!nodes(tree).some((node) => node.type === 'FinanceEntryEditor'))
    assert.match(text(tree), /記帳已儲存/); assert.match(text(tree), /操作已儲存，但清單尚未更新/)
    assert.equal(page.states[0].records[0].id, entry.id)
    global.fetch = async () => response(page.states[0])
    nodes(tree).find((node) => node.type === 'button' && text(node) === '重新載入清單').props.onClick()
    await new Promise(setImmediate); tree = page.render(); assert.equal(posts, 1); assert.doesNotMatch(text(tree), /操作已儲存，但清單尚未更新/)
  } finally { global.fetch = original }
})
test('successful receipt application closes its preview even when reload fails', async () => {
  const original = global.fetch
  try {
    let applies = 0
    global.fetch = async () => { applies++; return response({ alreadyApplied: false, conflict: false, rows: [] }) }
    const panel = renderer(FinanceSyncPanel, { batches: [], pendingCount: 1, onRefresh: async () => { throw new Error('清單離線') } })
    panel.render(); panel.states[4] = { batchStatus: 'committed' }; panel.states[5] = { alreadyApplied: false, conflict: false, rows: [] }
    let tree = panel.render(); nodes(tree).find((node) => node.type === 'button' && text(node) === '確認套用').props.onClick()
    await new Promise(setImmediate); tree = panel.render()
    assert.equal(applies, 1); assert.match(text(tree), /完整批次已確認同步/); assert.match(text(tree), /操作結果已保存，但清單更新失敗/)
    assert.equal(nodes(tree).find((node) => node.type === 'PersonalModal').props.open, false)
  } finally { global.fetch = original }
})
