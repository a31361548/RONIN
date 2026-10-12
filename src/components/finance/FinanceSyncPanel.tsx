'use client'

import { useRef, useState, type ReactElement } from 'react'
import { PersonalModal } from '@/components/ui/PersonalModal'
import { returnSchema, type ReturnFile, type FinanceExport } from '@/lib/finance/schema'
import type { ImportPreview } from '@/lib/finance/sync'
import { financeFieldLabels } from './FinanceRecordDetails'

export async function financeRequest<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) {
    const text = await response.text()
    let message = text
    try { const data = JSON.parse(text) as { error?: string }; message = data.error ?? text } catch { /* Text responses also occur for authentication errors. */ }
    throw new Error(message || '操作失敗')
  }
  return await response.json() as T
}

function download(file: FinanceExport): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `daynook-finance-${file.batchId}.json`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type Batch = { id: string; createdAt: string }
type Preview = ImportPreview & { alreadyApplied: boolean }
export function FinanceSyncPanel({ batches, pendingCount, onRefresh }: { batches: Batch[]; pendingCount: number; onRefresh: () => Promise<void> }): ReactElement {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<ReturnFile | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [confirmError, setConfirmError] = useState('')
  const exportFile = async (batchId?: string): Promise<void> => {
    setBusy(true); setError(''); setMessage('')
    try {
      const exported = batchId ? await financeRequest<FinanceExport>(`/api/finance/export?batchId=${encodeURIComponent(batchId)}`) : await financeRequest<FinanceExport>('/api/finance/export', {})
      download(exported)
      await onRefresh()
      setMessage(`已下載 ${exported.records.length} 筆紀錄。請交給「總管(3代)」同步 Excel，再取得回匯檔；同一批要重送時請下載原批次。`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '匯出失敗') }
    finally { setBusy(false) }
  }
  const loadFile = async (selected: File): Promise<void> => {
    setBusy(true); setError(''); setMessage(''); setConfirmError('')
    try {
      if (selected.size > 5_000_000) throw new Error('回匯檔需小於 5 MB')
      const parsed = returnSchema.safeParse(JSON.parse(await selected.text()) as unknown)
      if (!parsed.success) throw new Error(`檔案格式不正確：${parsed.error.issues[0]?.message ?? ''}`)
      const result = await financeRequest<Preview>('/api/finance/import', { mode: 'preview', file: parsed.data })
      setFile(parsed.data); setPreview({ ...result, rows: result.rows.map((row) => ({ ...row, message: Object.entries(financeFieldLabels).reduce((message, [key, label]) => message.split(key).join(label), row.message) })) })
    } catch (reason) { setError(reason instanceof Error ? reason.message : '回匯檔讀取失敗') }
    finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  const apply = async (): Promise<void> => {
    if (!file) return
    setBusy(true); setConfirmError('')
    try {
      const result = await financeRequest<Preview>('/api/finance/import', { mode: 'apply', file })
      await onRefresh()
      setMessage(result.alreadyApplied ? '這份回匯檔已處理，沒有重複套用。' : result.conflict ? '回匯結果已保存；衝突紀錄保留本地版本，請在交易清單選擇處理方式。' : file.batchStatus === 'committed' ? '完整批次已確認同步，Excel 修正已回匯。' : '拒絕或待恢復結果已保存，紀錄仍待同步，請依原因與帳本端核對。')
      setPreview(null); setFile(null)
    } catch (reason) { setConfirmError(reason instanceof Error ? reason.message : '套用失敗') }
    finally { setBusy(false) }
  }
  return <section className="rounded-3xl border border-[#eaded4] bg-[#fffdfa] p-5 sm:p-6" data-testid="finance-sync">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-bold">與 Excel 同步</h2><p className="mt-2 text-sm leading-6 text-[#8d7f76]">{pendingCount} 筆待同步 · 匯出後仍需回匯確認。Excel 是正式主帳本。</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void exportFile()} disabled={busy || pendingCount === 0} className="rounded-xl bg-[#e98a7a] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? '處理中⋯' : '匯出待同步紀錄'}</button><button type="button" onClick={() => input.current?.click()} disabled={busy} className="rounded-xl border border-[#eaded4] px-4 py-2.5 text-sm font-bold text-[#776e68] disabled:opacity-50">匯入同步結果</button><input ref={input} type="file" accept=".json,application/json" aria-label="選擇 Excel 同步回匯檔" className="hidden" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void loadFile(selected) }} /></div></div>
    <p className="mt-4 rounded-xl bg-[#fffaf6] p-3 text-xs leading-6 text-[#8d7f76]">第一版使用 JSON 交換檔，單批最多 100 筆，信用卡與支出不拆開。收入與資金異動的 Excel 來源、正式刪除及同步工具仍需帳本端支援；被拒絕的資料會保留待同步與原因，不會默默忽略。</p>
    {batches.length > 0 && <details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold text-[#776e68]">最近匯出批次（可重新下載原檔）</summary><ul className="mt-3 space-y-2">{batches.map((batch) => <li key={batch.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#faf3ed] px-3 py-2"><span className="break-all text-xs text-[#8d7f76]">{new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', dateStyle: 'short', timeStyle: 'short' }).format(new Date(batch.createdAt))} · {batch.id.slice(0, 8)}</span><button type="button" disabled={busy} onClick={() => void exportFile(batch.id)} className="text-xs font-bold text-[#a85b4e]">下載原批次</button></li>)}</ul></details>}
    {error && <p role="alert" className="mt-3 text-sm text-[#a85b4e]">{error}</p>}{message && <p role="status" className="mt-3 text-sm text-[#5f7f5a]">{message}</p>}
    <PersonalModal open={preview !== null} title="同步結果預覽" onClose={() => { setPreview(null); setFile(null) }} busy={busy}>
      {preview && <><p className="text-sm leading-6 text-[#8d7f76]">{preview.alreadyApplied ? '這份結果已套用，不會重複入帳。' : file?.batchStatus === 'committed' ? preview.conflict ? '網站已有新修改；此批會保存 Excel 版本供你選擇，保留本地內容。' : '確認後才更新網站與同步狀態。' : '此批未確認成功；套用僅保存拒絕或恢復原因，紀錄仍待同步。'}</p><ul className="mt-4 space-y-3">{preview.rows.map((row) => <li key={row.id} className="rounded-xl border border-[#eaded4] p-3"><p className="font-bold">{row.title}</p><p className="mt-1 break-words text-sm leading-6 text-[#8d7f76]">{row.message}</p></li>)}</ul>{confirmError && <p role="alert" className="mt-3 text-sm text-[#a85b4e]">{confirmError}</p>}<div className="sticky bottom-0 mt-5 flex justify-end gap-3 border-t border-[#eaded4] bg-[#fffdfa] py-3"><button type="button" disabled={busy} onClick={() => { setPreview(null); setFile(null) }} className="px-4 py-2 text-sm">取消</button><button type="button" disabled={busy || preview.alreadyApplied} onClick={() => void apply()} className="rounded-xl bg-[#e98a7a] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? '套用中⋯' : '確認套用'}</button></div></>}
    </PersonalModal>
  </section>
}
