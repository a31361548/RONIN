import { createHash } from 'node:crypto'
import type { FinanceRecord, FinanceExport, ReturnFile, SyncResult, RecordData } from './schema'
import { recordDataSchema, recordTitle, validateLinks } from './schema'

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`
}
export function payloadHash(value: unknown): string { return `sha256:${createHash('sha256').update(stableJson(value), 'utf8').digest('hex')}` }
export function success(result: SyncResult): boolean { return result.status === 'applied' || result.status === 'unchanged' }

export type ImportPreview = { conflict: boolean; rows: Array<{ id: string; title: string; status: string; message: string; changes: string[] }> }
export function previewReturn(batch: FinanceExport, file: ReturnFile, entries: FinanceRecord[]): ImportPreview {
  if (batch.datasetId !== file.datasetId || batch.batchId !== file.batchId) throw new Error('回匯檔不屬於此帳本或批次')
  if (file.masterChanges.length) throw new Error('此版尚未支援批次外的 Excel 異動，請請帳本端以原匯出批次回傳修正結果')
  if (file.results.length !== batch.records.length || new Set(file.results.map((result) => result.clientId)).size !== file.results.length) throw new Error('回匯必須完整包含該批次，且每筆紀錄只能出現一次')
  if (file.batchStatus === 'committed' ? file.results.some((result) => !success(result)) : file.results.some(success)) throw new Error('回匯的批次狀態與逐筆結果不一致')
  if (file.batchStatus === 'recovery_required' && file.results.some((result) => result.status !== 'not_applied' || !result.errors.some((error) => error.code === 'RECOVERY_REQUIRED'))) throw new Error('待恢復批次必須完整回報 RECOVERY_REQUIRED')
  let conflict = false
  const candidates = new Map(entries.map((entry) => [entry.id, entry]))
  const rows = file.results.map((result) => {
    const sent = batch.records.find((record) => record.clientId === result.clientId)
    const local = entries.find((entry) => entry.id === result.clientId)
    if (!sent || !local || sent.changeId !== result.changeId || sent.clientRevision !== result.submittedClientRevision || sent.entityType !== result.entityType) throw new Error('回匯包含未知紀錄、修改 ID 或版本不符')
    let data: RecordData | null = null
    if (success(result) || result.status === 'conflict' && result.canonicalPayload !== null) {
      if (sent.operation === 'delete') throw new Error('第一版不接受正式刪除成功回執，請由帳本端回報不支援')
      if (!result.masterId || !result.masterRevision || !result.masterHash || (sent.baseMasterRevision === null && success(result) && !result.recordedDate)) throw new Error('回執缺少正式 ID、版本、雜湊或首次寫入日期')
      data = recordDataSchema.parse({ entityType: result.entityType, payload: result.canonicalPayload })
      if (payloadHash(data.payload) !== result.masterHash) throw new Error('正式內容與 SHA-256 雜湊不一致')
      if (local.masterRevision !== null && result.masterRevision < local.masterRevision) throw new Error('回匯的正式版本比目前版本舊，拒絕套用')
      if (local.masterRevision === result.masterRevision && local.masterHash !== null && local.masterHash !== result.masterHash) throw new Error('相同正式版本的內容雜湊被改變，拒絕套用')
      if (success(result)) candidates.set(local.id, { ...local, ...data, deleted: false })
    }
    const changed = local.revision !== sent.clientRevision || local.changeId !== sent.changeId || local.serverShadow !== null
    if (success(result) && changed || result.status === 'conflict' && data !== null) conflict = true
    if (!success(result) && !result.errors.length || success(result) && result.errors.length) throw new Error('回執狀態與錯誤陣列不一致')
    if ((result.status === 'rejected' || result.status === 'not_applied') && [result.masterId, result.masterRevision, result.masterHash, result.recordedDate, result.canonicalPayload].some((value) => value !== null)) throw new Error('拒絕或未套用的結果不得包含正式成功欄位')
    const changes = data ? Object.keys(data.payload).filter((key) => stableJson((sent.payload as Record<string, unknown>)[key]) !== stableJson((data.payload as Record<string, unknown>)[key])) : []
    return { id: local.id, title: recordTitle(local), status: success(result) ? changed ? 'local_conflict' : result.status : result.status, message: (success(result) ? changed ? '匯出後網站已有修改，保留本地並待你選擇' : changes.length ? `Excel 修正 ${changes.join('、')}` : '內容一致，確認同步' : result.errors.map((error) => `${error.code}：${error.message}`).join('；') || '尚未套用') + (result.warnings.length ? `；${result.warnings.map((warning) => warning.message).join('；')}` : ''), changes }
  })
  if (file.batchStatus === 'committed') validateLinks(Array.from(candidates.values()))
  return { conflict, rows }
}
