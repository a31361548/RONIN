'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { PersonalModal } from '@/components/ui/PersonalModal'
import { returnSchema, type ReturnFile, type FinanceExport } from '@/lib/finance/schema'
import type { ImportPreview } from '@/lib/finance/sync'
import { financeFieldLabels } from './FinanceRecordDetails'
import type { FinanceBatchInfo } from '@/lib/finance/income-review'
import { refreshAfterWrite } from '@/lib/finance/write-refresh'

export async function financeRequest<T>(url: string, body?: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<T> {
  const response = await fetch(url, body === undefined ? undefined : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) {
    const text = await response.text()
    let message = text
    try { const data = JSON.parse(text) as { error?: string }; message = data.error ?? text } catch { /* Text responses also occur for authentication errors. */ }
    throw new Error(message || '操作失敗')
  }
  return await response.json() as T
}

export function downloadFinanceFile(file: FinanceExport): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `daynook-finance-v${file.schemaVersion}-${file.batchId}.json`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type Preview = ImportPreview & { alreadyApplied: boolean }
const batchLabels: Record<FinanceBatchInfo['status'], string> = { awaiting_result: '等待完整回匯', rejected: '已回報未套用', committed: '已確認成功', recovery_required: '需人工恢復' }
export function FinanceSyncPanel({ batches, pendingCount, walletPendingCount = 0, incomeReviewCount = 0, includedIncomeCount = 0, recoveryEntryId, onRefresh }: { batches: FinanceBatchInfo[]; pendingCount: number; walletPendingCount?: number; incomeReviewCount?: number; includedIncomeCount?: number; recoveryEntryId?: string | null; onRefresh: () => Promise<void> }): ReactElement {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<ReturnFile | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [confirmError, setConfirmError] = useState('')
  const [refreshError, setRefreshError] = useState('')
  const batchList = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (!recoveryEntryId || !batchList.current) return
    batchList.current.open = true
    batchList.current.scrollIntoView({ block: 'center' })
    batchList.current.querySelector<HTMLElement>('summary')?.focus()
  }, [recoveryEntryId])
  const reload = async (): Promise<void> => { setRefreshError((await refreshAfterWrite(onRefresh)) ?? '') }
  const exportFile = async (batchId?: string): Promise<void> => {
    setBusy(true); setError(''); setMessage('')
    let exported: FinanceExport | null = null
    try {
      exported = batchId ? await financeRequest<FinanceExport>(`/api/finance/export?batchId=${encodeURIComponent(batchId)}`) : await financeRequest<FinanceExport>('/api/finance/export', {})
      downloadFinanceFile(exported)
      setMessage(`已建立 ${exported.records.length} 筆交換檔並啟動下載；尚未確認寫入 Excel。請交給帳本管理對話核對工具是否支援，再取得完整回匯結果。同一批需要重送時使用原批次。`)
      await reload()
    } catch (reason) {
      setError(exported ? '批次已保存，但下載未完成。請下載原批次，無需建立新批次。' : reason instanceof Error ? reason.message : '匯出失敗')
      if (exported) await reload()
    }
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
      setMessage(result.alreadyApplied ? '這份回匯檔已處理，沒有重複套用。' : result.conflict ? '回匯結果已保存；衝突紀錄保留本地版本，請在交易清單選擇處理方式。' : file.batchStatus === 'committed' ? '完整批次已確認同步，Excel 修正已回匯。' : '拒絕或待恢復結果已保存，紀錄仍待同步，請依原因與帳本端核對。')
      setPreview(null); setFile(null)
      await reload()
    } catch (reason) { setConfirmError(reason instanceof Error ? reason.message : '套用失敗') }
    finally { setBusy(false) }
  }
  return <section className="rounded-3xl border border-[#eaded4] bg-[#fffdfa] p-5 sm:p-6" data-testid="finance-sync">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-bold">將網站新帳同步回 Excel</h2><p className="mt-2 text-sm leading-6 text-[#8d7f76]">{pendingCount} 筆待同步 · 匯出後仍需回匯確認。Excel 是正式主帳本。</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void exportFile()} disabled={busy || incomeReviewCount > 0 || pendingCount === 0} className="rounded-xl bg-[#e98a7a] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? '處理中⋯' : '匯出待同步紀錄'}</button><button type="button" onClick={() => input.current?.click()} disabled={busy} className="rounded-xl border border-[#eaded4] px-4 py-2.5 text-sm font-bold text-[#776e68] disabled:opacity-50">匯入同步結果</button><input ref={input} type="file" accept=".json,application/json" aria-label="選擇 Excel 同步回匯檔" className="hidden" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void loadFile(selected) }} /></div></div>
    {incomeReviewCount > 0 && <p className="mt-3 rounded-xl bg-[#fff8e7] p-3 text-sm font-semibold text-[#806023]">{incomeReviewCount} 筆收入可能重複，請使用下方「核對收入」完成確認，再匯出新批次。</p>}
    {includedIncomeCount > 0 && <p className="mt-3 text-sm leading-6 text-[#4f704e]">{includedIncomeCount} 筆收入已確認包含在 Excel 月收入；網站保留紀錄與註解，不再匯出為新收入。</p>}
    {walletPendingCount > 0 && <p className="mt-4 rounded-xl border border-[#ead9ad] bg-[#fff8e8] p-3 text-xs leading-6 text-[#806023]">其中 {walletPendingCount} 筆現金錢包紀錄會使用新版交換檔同步，保留現金帳戶；完整回匯後才確認正式入帳。</p>}
    <p className="mt-4 rounded-xl bg-[#faf3ed] p-3 text-sm leading-6 text-[#695e57]"><strong>使用交換版本 2 與本機 Excel 接收工具。</strong>將交換檔交給帳本管理對話，先預覽並核對，再執行接收與驗證；取得完整結果後匯回網站。下載檔案不代表已入帳。</p>
    <details className="mt-4 text-sm text-[#75665d]"><summary className="cursor-pointer font-semibold">同步流程與限制</summary><p className="mt-2 rounded-xl bg-[#fffaf6] p-3 text-sm leading-6">新版支援現金錢包、收入明細與資金異動；單批最多 100 筆，信用卡與支出成組處理。舊批次保留原交換版本。疑似重複需人工確認，正式刪除、退款與互轉仍不支援；拒絕與恢復原因會保留。</p></details>
    {batches.length > 0 && <details ref={batchList} className="mt-4 text-sm"><summary tabIndex={0} className="min-h-11 cursor-pointer py-3 font-semibold text-[#776e68]">匯出批次與處理狀態（可下載原檔）</summary><ul className="mt-3 space-y-2">{batches.filter((batch, index) => index < 20 || batch.status === 'awaiting_result' || batch.status === 'recovery_required' || Boolean(recoveryEntryId && batch.recordIds.includes(recoveryEntryId))).map((batch) => <li key={batch.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#faf3ed] px-3 py-2"><span className="break-all text-xs text-[#8d7f76]">{new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', dateStyle: 'short', timeStyle: 'short' }).format(new Date(batch.createdAt))} · {batch.id.slice(0, 8)} · {batchLabels[batch.status]}</span><button type="button" disabled={busy} onClick={() => void exportFile(batch.id)} className="min-h-11 rounded-xl border border-[#e3cfc0] px-3 py-2 text-sm font-semibold text-[#a85b4e]">下載原批次</button></li>)}</ul></details>}
    {refreshError && <div role="alert" className="mt-3 rounded-xl bg-[#fff8e7] p-3 text-sm leading-6 text-[#806023]"><p>操作結果已保存，但清單更新失敗。請重新載入，不用再次匯出或套用。</p><p>{refreshError}</p><button type="button" disabled={busy} onClick={() => { setBusy(true); void reload().finally(() => setBusy(false)) }} className="mt-2 min-h-11 rounded-xl border border-[#c7ab70] px-3 py-2 font-semibold">重新載入清單</button></div>}
    {error && <p role="alert" className="mt-3 text-sm text-[#a85b4e]">{error}</p>}{message && <p role="status" className="mt-3 text-sm text-[#5f7f5a]">{message}</p>}
    <PersonalModal surface="finance" open={preview !== null} title="同步結果預覽" onClose={() => { setPreview(null); setFile(null) }} busy={busy}>
      {preview && <><p className="text-sm leading-6 text-[#8d7f76]">{preview.alreadyApplied ? '這份結果已套用，不會重複入帳。' : file?.batchStatus === 'committed' ? preview.conflict ? '網站已有新修改；此批會保存 Excel 版本供你選擇，保留本地內容。' : '確認後才更新網站與同步狀態。' : '此批未確認成功；套用僅保存拒絕或恢復原因，紀錄仍待同步。'}</p><ul className="mt-4 space-y-3">{preview.rows.map((row) => <li key={row.id} className="rounded-xl border border-[#eaded4] p-3"><p className="font-bold">{row.title}</p><p className="mt-1 break-words text-sm leading-6 text-[#8d7f76]">{row.message}</p></li>)}</ul>{confirmError && <p role="alert" className="mt-3 text-sm text-[#a85b4e]">{confirmError}</p>}<div className="sticky bottom-0 mt-5 flex justify-end gap-3 border-t border-[#eaded4] bg-[#fffdfa] py-3"><button type="button" disabled={busy} onClick={() => { setPreview(null); setFile(null) }} className="px-4 py-2 text-sm">取消</button><button type="button" disabled={busy || preview.alreadyApplied} onClick={() => void apply()} className="rounded-xl bg-[#e98a7a] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? '套用中⋯' : '確認套用'}</button></div></>}
    </PersonalModal>
  </section>
}
