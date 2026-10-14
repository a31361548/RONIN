import JSZip from 'jszip'
import type ExcelJS from 'exceljs'
import { loadFinanceWorkbook, excelSerialDate } from './history-workbook'

const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
type Scalar = string | number | boolean | null
export type WorkbookRow = { row: number; values: Record<string, Scalar> }
export type WorkbookValue = Scalar | { date: string } | { formula: string; result: Scalar }
const escapeXml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const decodeXml = (value: string): string => value.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[entity] ?? entity)
function attrs(xml: string): Record<string, string> { return Object.fromEntries(Array.from(xml.matchAll(/([\w:.-]+)="([^"]*)"/g), (match) => [match[1], decodeXml(match[2])])) }
function standardXml(xml: string): string {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('不接受外部 XML 實體')
  const prefix = new RegExp(`xmlns:([\\w.-]+)="${main.replace(/\./g, '\\.')}"`).exec(xml)?.[1]
  return prefix ? xml.replace(new RegExp(`<(/?)${prefix}:`, 'g'), '<$1').replace(`xmlns:${prefix}=`, 'xmlns=') : xml
}
function letters(column: number): string { let key = ''; while (column > 0) { column--; key = String.fromCharCode(65 + column % 26) + key; column = Math.floor(column / 26) } return key }
function columnNumber(address: string): number { return Array.from(address.replace(/\d/g, '')).reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) }
function scalar(value: ExcelJS.CellValue, cachedResult?: ExcelJS.CellValue): Scalar {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if ('formula' in value || 'sharedFormula' in value) { const result = value.result ?? cachedResult; if (result === undefined) throw new Error('公式缺少快取結果'); return scalar(result) }
  if ('richText' in value) return value.richText.map((part) => part.text).join('')
  throw new Error('不接受錯誤或不支援的儲存格')
}

// Patch only changed OOXML parts; unrelated sheets, drawings and styles stay intact.
export class FinanceWorkbookXml {
  private readonly documents = new Map<string, string>()
  private readonly paths = new Map<string, string>()
  private readonly pending = new Map<string, Map<number, Record<string, WorkbookValue>>>()
  private readonly headers = new Map<string, Map<string, number>>()
  private dateStyle = -1
  private addedSheets = false
  private constructor(readonly workbook: ExcelJS.Workbook, private readonly zip: JSZip) {}
  static async open(buffer: Buffer): Promise<FinanceWorkbookXml> {
    const document = new FinanceWorkbookXml(await loadFinanceWorkbook(buffer), await JSZip.loadAsync(buffer))
    const xml = await document.xml('xl/workbook.xml')
    const rels = await document.xml('xl/_rels/workbook.xml.rels')
    const targets = new Map(Array.from(rels.matchAll(/<Relationship\b[^>]*\/>/g), (match) => { const a = attrs(match[0]); return [a.Id, a.Target] }))
    for (const match of xml.matchAll(/<sheet\b[^>]*\/>/g)) {
      const a = attrs(match[0]); const target = targets.get(a['r:id'])
      if (!target || !/^(?:\/xl\/|\/?worksheets\/|xl\/worksheets\/)/.test(target) || target.includes('..')) throw new Error('工作表來源路徑不支援')
      document.paths.set(a.name, target.startsWith('/xl/') ? target.slice(1) : target.startsWith('xl/') ? target : `xl/${target.replace(/^\//, '')}`)
    }
    return document
  }
  private async xml(path: string): Promise<string> {
    const cached = this.documents.get(path)
    if (cached !== undefined) return cached
    const file = this.zip.file(path); if (!file) throw new Error(`Excel 缺少 ${path}`)
    const value = standardXml(await file.async('string')); this.documents.set(path, value); return value
  }
  hasSheet(name: string): boolean { return this.paths.has(name) }
  columns(name: string): Map<string, number> {
    const old = this.headers.get(name); if (old) return old
    const sheet = this.workbook.getWorksheet(name); if (!sheet) throw new Error(`Excel 缺少「${name}」`)
    const map = new Map<string, number>()
    sheet.getRow(1).eachCell((cell, column) => { if (cell.isMerged && cell.master.address !== cell.address) return; const header = String(scalar(cell.value) ?? '').trim(); if (header) { if (map.has(header)) throw new Error(`「${name}」有重複表頭`); map.set(header, column) } })
    this.headers.set(name, map); return map
  }
  rows(name: string): WorkbookRow[] {
    const sheet = this.workbook.getWorksheet(name); if (!sheet) return []
    const columns = this.columns(name); const rows: WorkbookRow[] = []
    sheet.eachRow((row, index) => { if (index > 1) rows.push({ row: index, values: Object.fromEntries(Array.from(columns, ([header, column]) => { const cell = row.getCell(column); return [header, scalar(cell.value, cell.result)] })) }) })
    return rows.filter((row) => Object.values(row.values).some((value) => value !== null && value !== ''))
  }
  date(value: Scalar): string | null { return typeof value === 'number' ? excelSerialDate(value, Boolean(this.workbook.properties.date1904)) : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null }
  setRow(name: string, row: number, values: Record<string, WorkbookValue>): void {
    const rows = this.pending.get(name) ?? new Map<number, Record<string, WorkbookValue>>()
    rows.set(row, { ...rows.get(row), ...values }); this.pending.set(name, rows)
  }
  appendRow(name: string, values: Record<string, WorkbookValue>): number {
    const last = Math.max(this.workbook.getWorksheet(name)?.rowCount ?? 1, ...Array.from(this.pending.get(name)?.keys() ?? [1]))
    this.setRow(name, last + 1, values); return last + 1
  }
  async ensureSheet(name: string, headers: string[], hidden = false): Promise<void> {
    if (this.hasSheet(name)) { for (const header of headers) if (!this.columns(name).has(header)) throw new Error(`「${name}」缺少 ${header}`); return }
    const book = await this.xml('xl/workbook.xml'), rels = await this.xml('xl/_rels/workbook.xml.rels'), types = await this.xml('[Content_Types].xml')
    const id = Math.max(0, ...Array.from(book.matchAll(/sheetId="(\d+)"/g), (match) => Number(match[1]))) + 1
    const rid = Math.max(0, ...Array.from(rels.matchAll(/Id="rId(\d+)"/g), (match) => Number(match[1]))) + 1
    const fileId = Math.max(0, ...Array.from(this.paths.values(), (path) => Number(/sheet(\d+)\.xml$/.exec(path)?.[1] ?? 0))) + 1
    const path = `xl/worksheets/sheet${fileId}.xml`
    if (this.zip.file(path)) throw new Error('新增工作表路徑已存在')
    this.documents.set('xl/workbook.xml', book.replace('</sheets>', `<sheet name="${escapeXml(name)}" sheetId="${id}"${hidden ? ' state="hidden"' : ''} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${rid}"/></sheets>`))
    this.documents.set('xl/_rels/workbook.xml.rels', rels.replace('</Relationships>', `<Relationship Id="rId${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${fileId}.xml"/></Relationships>`))
    this.documents.set('[Content_Types].xml', types.replace('</Types>', `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`))
    this.documents.set(path, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${main}"><sheetData/></worksheet>`)
    this.addedSheets = true
    this.paths.set(name, path); const sheet = this.workbook.addWorksheet(name); headers.forEach((header, index) => { sheet.getCell(1, index + 1).value = header }); this.headers.set(name, new Map(headers.map((header, index) => [header, index + 1])))
    this.setRow(name, 1, Object.fromEntries(headers.map((header) => [header, header])))
  }
  addColumn(name: string, header: string): void {
    const columns = this.columns(name); if (columns.has(header)) return
    const column = Math.max(this.workbook.getWorksheet(name)?.columnCount ?? 0, ...columns.values()) + 1
    columns.set(header, column); this.setRow(name, 1, { [header]: header })
  }
  private async dateStyleId(): Promise<number> {
    if (this.dateStyle >= 0) return this.dateStyle
    const path = 'xl/styles.xml', xml = await this.xml(path)
    const section = /<cellXfs\b([^>]*)>([\s\S]*?)<\/cellXfs>/.exec(xml); if (!section) throw new Error('Excel 缺少儲存格樣式')
    const count = Array.from(section[2].matchAll(/<xf\b/g)).length; this.dateStyle = count
    this.documents.set(path, xml.replace(section[0], `<cellXfs count="${count + 1}">${section[2]}<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>`))
    return count
  }
  private async cell(address: string, value: WorkbookValue, previous = ''): Promise<string> {
    const previousAttrs = attrs(previous); const style = previousAttrs.s ? ` s="${previousAttrs.s}"` : ''
    if (value !== null && typeof value === 'object' && 'date' in value) {
      const serial = Math.floor(Date.parse(`${value.date}T00:00:00Z`) / 86400000) + 25569 - (this.workbook.properties.date1904 ? 1462 : 0)
      if (!Number.isFinite(serial)) throw new Error('日期不正確')
      return `<c r="${address}" s="${await this.dateStyleId()}"><v>${serial}</v></c>`
    }
    const formula = value !== null && typeof value === 'object' && 'formula' in value ? `<f>${escapeXml(value.formula.replace(/^=/, ''))}</f>` : ''
    const result = typeof value === 'object' && value !== null && 'result' in value ? value.result : value as Scalar
    if (result === null) return `<c r="${address}"${style}/>`
    if (typeof result === 'number') { if (!Number.isFinite(result)) throw new Error('金額不正確'); return `<c r="${address}"${style}>${formula}<v>${result}</v></c>` }
    if (typeof result === 'boolean') return `<c r="${address}"${style} t="b">${formula}<v>${result ? 1 : 0}</v></c>`
    if (result.length > 32767 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) throw new Error('文字超過 Excel 限制或含控制字元')
    return formula ? `<c r="${address}"${style} t="str">${formula}<v>${escapeXml(result)}</v></c>` : `<c r="${address}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(result)}</t></is></c>`
  }
  async save(): Promise<Buffer> {
    for (const [name, updates] of this.pending) {
      const path = this.paths.get(name); if (!path) throw new Error('工作表不存在')
      let xml = await this.xml(path); xml = xml.replace('<sheetData/>', '<sheetData></sheetData>')
      if (/<tableParts\b|<sheetProtection\b/.test(xml)) throw new Error(`「${name}」含表格或工作表保護，需由帳本端先確認擴充方式`)
      for (const [index, values] of Array.from(updates).sort((a, b) => a[0] - b[0])) {
        const re = new RegExp(`<row\\b[^>]*\\br="${index}"[^>]*(?:\\/>|>[\\s\\S]*?<\\/row>)`)
        const previous = re.exec(xml)?.[0] ?? ''
        const cells = new Map(Array.from(previous.matchAll(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g), (match) => [attrs(match[0]).r, match[0]]))
        for (const [header, value] of Object.entries(values)) { const column = this.columns(name).get(header); if (!column) throw new Error(`未知欄位 ${header}`); const address = `${letters(column)}${index}`; cells.set(address, await this.cell(address, value, cells.get(address))) }
        const row = `<row ${previous ? previous.slice(0, previous.indexOf('>')).replace(/^<row\s*/, '').replace(/\/$/, '') : `r="${index}"`}>${Array.from(cells).sort((a, b) => columnNumber(a[0]) - columnNumber(b[0])).map(([, cell]) => cell).join('')}</row>`
        if (previous) xml = xml.replace(previous, row)
        else { const next = Array.from(xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>/g)).find((match) => Number(match[1]) > index); xml = next ? xml.slice(0, next.index) + row + xml.slice(next.index) : xml.replace('</sheetData>', `${row}</sheetData>`) }
      }
      const maxRow = Math.max(this.workbook.getWorksheet(name)?.rowCount ?? 1, ...updates.keys())
      xml = xml.replace(/<dimension\b[^>]*\/>/, `<dimension ref="A1:${letters(Math.max(this.workbook.getWorksheet(name)?.columnCount ?? 1, ...this.columns(name).values()))}${maxRow}"/>`)
      this.documents.set(path, xml)
    }
    // Only changed parts are written; read-only normalized documents are excluded.
    const changed = new Set(Array.from(this.pending.keys(), (name) => this.paths.get(name)))
    for (const path of ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', '[Content_Types].xml']) if (this.addedSheets) changed.add(path)
    if (this.dateStyle >= 0) changed.add('xl/styles.xml')
    for (const path of changed) if (path) this.zip.file(path, this.documents.get(path) ?? '')
    return this.zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  }
}
