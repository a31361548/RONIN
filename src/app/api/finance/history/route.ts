import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { prisma } from '@/lib/prisma'
import { jsonValue, serializeEntry } from '@/lib/finance/store'
import { readPreferences } from '@/lib/finance/preferences'
import { historySummaries, type HistoryPreview, type HistorySummary } from '@/lib/finance/history'
import { historyId, mappingSchema, prepareHistory, readHistoryWorkbook, workbookMappings } from '@/lib/finance/history-workbook'
import { payloadHash } from '@/lib/finance/sync'
import { validateLinks } from '@/lib/finance/schema'

export const runtime = 'nodejs'
export const maxDuration = 60
async function boundedForm(req: NextRequest): Promise<FormData> {
  if (!req.headers.get('content-type')?.startsWith('multipart/form-data')) throw new Error('請使用 Excel 檔案上傳')
  if (Number(req.headers.get('content-length')) > 4_000_000) throw new Error('上傳內容超過大小限制')
  const reader = req.body?.getReader()
  if (!reader) throw new Error('未收到檔案')
  const parts: Uint8Array<ArrayBuffer>[] = []; let size = 0
  while (true) {
    const result = await reader.read()
    if (result.done) break
    size += result.value.byteLength
    if (size > 4_000_000) { await reader.cancel(); throw new Error('上傳內容超過大小限制') }
    parts.push(new Uint8Array(result.value))
  }
  return new Response(new Blob(parts), { headers: { 'content-type': req.headers.get('content-type') as string } }).formData()
}
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getAuthenticatedUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  try {
    const form = await boundedForm(req)
    const mode = z.enum(['preview', 'apply']).parse(form.get('mode'))
    const upload = form.get('file')
    if (!(upload instanceof File) || !/\.xlsx$/i.test(upload.name) || upload.size > 3_000_000) throw new Error('請選擇小於 3 MB 的 .xlsx 帳本')
    const workbook = await readHistoryWorkbook(Buffer.from(await upload.arrayBuffer()), upload.name.slice(0, 200))
    const suppliedMapping = form.get('mapping')
    const mapping = typeof suppliedMapping === 'string' ? mappingSchema.parse(JSON.parse(suppliedMapping)) : null
    const keys = mode === 'apply' ? z.array(z.string().max(300)).min(1).max(500).parse(JSON.parse(String(form.get('selected')))) : []
    if (new Set(keys).size !== keys.length) throw new Error('選取來源重複')
    const result = await prisma.$transaction(async (tx) => {
      const [ledger, rawEntries, batches] = await Promise.all([
        tx.financeLedger.findUnique({ where: { userId: user.id } }),
        tx.financeEntry.findMany({ where: { userId: user.id } }),
        tx.financeBatch.findMany({ where: { userId: user.id }, select: { id: true, payload: true } }),
      ])
      const preferences = readPreferences(ledger?.preferences)
      const entries = rawEntries.map(serializeEntry)
      const available = workbookMappings(workbook, preferences)
      const effectiveMapping = mapping ?? available.defaults
      const summaries = historySummaries(batches.map((batch) => batch.payload))
      const groups = prepareHistory(workbook, user.id, preferences, effectiveMapping, entries, summaries)
      const previewHash = payloadHash({ fileHash: workbook.fileHash, mapping: effectiveMapping, preferences, entries: entries.map((e) => ({ id: e.id, revision: e.revision, changeId: e.changeId, deleted: e.deleted, sourceRefs: e.sourceRefs })).sort((a, b) => a.id.localeCompare(b.id)), summaries })
      const preview: HistoryPreview = { fileName: workbook.fileName, fileHash: workbook.fileHash, previewHash, rows: groups.map(({ items: _items, summary: _summary, ...row }) => row), warnings: [...workbook.warnings, '缺少帳戶的支出需指定對照；分類與帳戶對照只影響網站副本。', workbook.rows.some((row) => row.sheet === '收入明細') ? '收入明細保留來源日期；月彙總另行核對，不重複加總。' : '來源沒有逐筆收入，月彙總與網站逐筆收入分開顯示。', '未出現在本次檔案的舊資料會保留，不會推斷刪除。'], ...available, defaults: effectiveMapping, summaries: groups.flatMap((g) => g.summary ? [g.summary] : []) }
      if (mode === 'preview') return preview
      const selected = keys.map((key) => groups.find((group) => group.key === key))
      if (selected.some((group) => !group || group.status === 'blocked' || group.status === 'needs_mapping')) throw new Error('選取資料尚未完成對照、有錯誤或來源已改變，請重新預覽')
      const chosen = selected.filter((group) => group !== undefined)
      if (chosen.every((group) => group.status === 'duplicate')) return { imported: 0, updated: 0, skipped: chosen.length, summaries: 0, alreadyApplied: true }
      if (form.get('previewHash') !== previewHash) throw new Error('預覽後帳本、對照或網站資料已改變，請重新預覽')
      const writable = chosen.filter((group) => group.status !== 'duplicate')
      const items = writable.flatMap((group) => group.items)
      if (items.length > 500) throw new Error('單次最多匯入 500 筆，請分批勾選')
      const candidates = new Map(entries.map((entry) => [entry.id, entry]))
      const sourceRefs = (i: typeof items[number]): Record<string, unknown> => ({ origin: 'excel-history', masterId: i.masterId, sourceHash: i.sourceHash, fileHash: workbook.fileHash, fileName: workbook.fileName, sheet: i.source.sheet, row: i.source.row, original: i.source.values })
      for (const i of items) candidates.set(i.id, { ...candidates.get(i.id), ...i.record, id: i.id, deleted: false, sourceRefs: sourceRefs(i) } as ReturnType<typeof serializeEntry>)
      validateLinks(Array.from(candidates.values()))
      let imported = 0; let updated = 0
      for (const i of items) {
        const old = entries.find((e) => e.id === i.id)
        const values = { kind: i.record.entityType, data: jsonValue(i.record.payload), localCategoryId: i.localCategoryId, recordedDate: i.recordedDate, sourceRefs: jsonValue(sourceRefs(i)), syncedRevision: (old?.revision ?? 0) + 1, changeId: randomUUID() }
        if (old) {
          const update = await tx.financeEntry.updateMany({ where: { id: old.id, userId: user.id, revision: old.revision, changeId: old.changeId }, data: { ...values, revision: { increment: 1 } } })
          if (update.count !== 1) throw new Error('匯入期間資料已改變，請重新預覽')
          updated++
        } else { await tx.financeEntry.create({ data: { ...values, id: i.id, userId: user.id } }); imported++ }
      }
      const importedSummaries: HistorySummary[] = writable.flatMap((group) => group.summary ? [group.summary] : [])
      await tx.financeBatch.create({ data: { id: historyId(user.id, 'history-receipt', payloadHash({ fileHash: workbook.fileHash, mapping: effectiveMapping, selected: [...keys].sort() })), userId: user.id, payload: jsonValue({ fileType: 'finance-history', version: 1, fileHash: workbook.fileHash, fileName: workbook.fileName, importedAt: new Date().toISOString(), summaries: importedSummaries }), receipts: { files: {}, committed: false } } })
      return { imported, updated, skipped: chosen.length - writable.length, summaries: importedSummaries.length, alreadyApplied: false }
    }, { maxWait: 10_000, timeout: 60_000 })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? '欄位不正確' : error instanceof Error ? error.message : 'Excel 匯入失敗'
    return NextResponse.json({ error: message }, { status: 409 })
  }
}
