const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const cache = new Map()
function loadFinanceModule(relative) {
  const filename = path.resolve(root, relative)
  if (!filename.startsWith(root + path.sep)) throw new Error('Module outside project')
  if (cache.has(filename)) return cache.get(filename).exports
  const module = { exports: {} }; cache.set(filename, module)
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  const localRequire = (name) => name.startsWith('@/') ? loadFinanceModule(`src/${name.slice(2)}.ts`) : name.startsWith('./') ? loadFinanceModule(path.relative(root, path.resolve(path.dirname(filename), name + '.ts'))) : require(name)
  new Function('require', 'module', 'exports', source)(localRequire, module, module.exports)
  return module.exports
}
module.exports = { loadFinanceModule }
