'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { FinanceEntryEditor, type FinanceWrite } from './FinanceEntryEditor'
import { FinanceSyncPanel, financeRequest } from './FinanceSyncPanel'
import { FinanceRecordDetails } from './FinanceRecordDetails'
import { PersonalConfirmDialog } from '@/components/ui/PersonalConfirmDialog'
import { PersonalModal } from '@/components/ui/PersonalModal'
import { PersonalSelect } from '@/components/ui/PersonalSelect'
import { categories, entityLabels, monthlyTotals, recordAmount, recordDate, recordTitle, recordDataSchema, resultSchema, type FinanceRecord } from '@/lib/finance/schema'
import { centsToMoney, formatMoney, taipeiDate } from '@/lib/finance/money'

type Data = { records: FinanceRecord[]; datasetId: string | null; batches: Array<{ id: string; createdAt: string }> }
type Action = 'delete' | 'restore' | 'keep-local' | 'use-master'
function syncLabel(entry: FinanceRecord): string {
  if (entry.serverShadow !== null) return '待解決衝突'
  if (entry.syncError) return '同步未完成'
  if (entry.syncedRevision === entry.revision) return '已同步'
  if (entry.exportedRevision === entry.revision) return '已匯出，待回匯'
  return '待同步'
}

export function PersonalFinancePage(): ReactElement {
  const [data, setData] = useState<Data>({ records: [], datasetId: null, batches: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [month, setMonth] = useState(taipeiDate().slice(0, 7))
  const [filter, setFilter] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [editor, setEditor] = useState<FinanceRecord | 'new' | null>(null)
  const [confirm, setConfirm] = useState<{ entry: FinanceRecord; action: Action } | null>(null)
  const [conflictEntry, setConflictEntry] = useState<FinanceRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const refresh = async (): Promise<void> => { setData(await financeRequest<Data>('/api/finance')) }
  useEffect(() => {
    let active = true
    void financeRequest<Data>('/api/finance').then((result) => { if (active) setData(result) }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : '記帳資料載入失敗') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const totals = monthlyTotals(data.records, month)
  const shadowResult = conflictEntry ? resultSchema.safeParse(conflictEntry.serverShadow) : null
  const shadowData = shadowResult?.success ? recordDataSchema.safeParse({ entityType: conflictEntry?.entityType, payload: shadowResult.data.canonicalPayload }) : null
  const pendingCount = data.records.filter((entry) => entry.revision > entry.syncedRevision).length
  const visible = data.records.filter((entry) => (showDeleted ? entry.deleted : !entry.deleted) && !(entry.entityType === 'expense' && entry.payload.creditCardTransactionClientId) && recordDate(entry).startsWith(month) && (!filter.length || filter.includes(entry.entityType)) && `${recordTitle(entry)} ${entry.payload.notes ?? ''}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => recordDate(b).localeCompare(recordDate(a)))
  const save = async (records: FinanceWrite[]): Promise<void> => { await financeRequest('/api/finance', { records }); await refresh(); setEditor(null) }
  const runAction = async (entry: FinanceRecord, action: Action): Promise<void> => {
    setBusy(true); setActionError('')
    try {
      const response = await fetch(`/api/finance/${entry.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, expectedRevision: entry.revision }) })
      if (!response.ok) { const result = await response.json() as { error?: string }; throw new Error(result.error ?? '操作失敗') }
      await refresh(); setConfirm(null); setConflictEntry(null)
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : '操作失敗') }
    finally { setBusy(false) }
  }
  const shiftMonth = (offset: number): void => {
    const [year, m] = month.split('-').map(Number)
    const date = new Date(Date.UTC(year, m - 1 + offset, 1))
    setMonth(date.toISOString().slice(0, 7))
  }
  return <div className="space-y-6" data-testid="finance-page">
    <header className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-semibold tracking-[0.16em] text-[#b7655a]">讓每一筆生活，有跡可循</p><h1 className="mt-2 text-4xl font-bold tracking-[0.12em] text-[#3f3530] sm:text-5xl">記帳</h1><p className="mt-3 text-sm text-[#8d7f76]">日常收支、信用卡與付款，一起整理清楚。</p></div><button type="button" disabled={loading || Boolean(error)} onClick={() => setEditor('new')} className="rounded-2xl bg-[#e98a7a] px-5 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-50">＋新增記帳</button></header>
    {error && <div role="alert" className="rounded-2xl bg-[#fff0ed] p-4 text-sm text-[#a85b4e]">{error}<button type="button" onClick={() => { setLoading(true); void refresh().then(() => setError('')).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '載入失敗')).finally(() => setLoading(false)) }} className="ml-3 font-bold underline">重新載入</button></div>}
    {loading ? <p role="status" className="py-16 text-center text-[#8d7f76]">正在整理記帳資料⋯</p> : !error && <>
      <div className="flex flex-wrap items-center gap-2"><button type="button" aria-label="上一個月份" onClick={() => shiftMonth(-1)} className="rounded-xl bg-[#fffdfa] px-3 py-2">‹</button><label><span className="sr-only">記帳月份</span><input type="month" required value={month} onChange={(event) => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) setMonth(event.target.value) }} className="rounded-xl border border-[#eaded4] bg-[#fffdfa] px-3 py-2 text-sm font-bold" /></label><button type="button" aria-label="下一個月份" onClick={() => shiftMonth(1)} className="rounded-xl bg-[#fffdfa] px-3 py-2">›</button><button type="button" onClick={() => setMonth(taipeiDate().slice(0, 7))} className="px-3 py-2 text-sm text-[#a85b4e]">本月</button><span className="text-xs text-[#8d7f76]">網站紀錄摘要 · 不等於 Excel 完整帳本或銀行餘額</span></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[{ label: '收入', value: totals.income, color: 'text-[#5f7f5a]' }, { label: '消費支出', value: totals.expense, color: 'text-[#a85b4e]' }, { label: '收支結餘', value: totals.income - totals.expense, color: 'text-[#4a413c]' }, { label: '付款與代墊償還', value: totals.movement, color: 'text-[#5b7486]' }].map((item) => <div key={item.label} className="rounded-3xl border border-[#eaded4] bg-[#fffdfa] p-4 sm:p-5"><p className="text-xs font-semibold text-[#8d7f76]">{item.label}</p><p className={`mt-3 break-words text-xl font-bold sm:text-2xl ${item.color}`}>{formatMoney(centsToMoney(item.value))}</p></div>)}</div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0 rounded-3xl border border-[#eaded4] bg-[#fffdfa] p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{showDeleted ? '刪除待處理' : '交易紀錄'}</h2><label className="text-xs text-[#8d7f76]"><input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} className="mr-2" />顯示刪除標記</label></div><div className="mt-4 flex flex-wrap gap-2"><PersonalSelect multiple ariaLabel="篩選記帳類型" size="compact" className="w-full sm:w-60" value={filter} onChange={setFilter} placeholder="所有類型（可複選）" options={Object.entries(entityLabels).map(([value, label]) => ({ value, label: value === 'expense' ? '現金／轉帳支出' : label }))} /><label className="min-w-0 flex-1"><span className="sr-only">搜尋交易</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋項目或備註" className="h-10 w-full rounded-xl border border-[#eaded4] bg-[#fffaf6] px-3 text-sm" /></label></div>
          <div className="mt-4 divide-y divide-[#f0e5dc]">{visible.map((entry) => <article key={entry.id} className="py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-[#8d7f76]">{recordDate(entry)} · {entityLabels[entry.entityType]}{entry.entityType === 'expense' ? ` · ${categories[entry.payload.categoryCode]}` : ''}</p><h3 className="mt-1 break-words font-bold">{recordTitle(entry)}</h3><p className="mt-1 text-xs font-semibold text-[#a85b4e]">{syncLabel(entry)}{entry.recordedDate ? ` · 正式寫入 ${entry.recordedDate}` : ''}</p></div><div className="shrink-0 text-right"><p className="text-base font-bold">{formatMoney(recordAmount(entry))}</p>{entry.entityType === 'credit_card_transaction' && <p className="mt-1 text-xs text-[#8d7f76]">{entry.payload.status === 'settled' ? `個人 ${formatMoney(entry.payload.personalAmount ?? '0.00')}` : entry.payload.status === 'cancelled' ? '已取消' : '待結算'}</p>}</div></div>{entry.payload.notes && <p className="mt-2 break-words text-sm leading-6 text-[#8d7f76]">{entry.payload.notes}</p>}{entry.syncError && <p className="mt-2 break-words rounded-xl bg-[#fff0ed] p-2 text-xs leading-5 text-[#a85b4e]">{entry.syncError}</p>}<div className="mt-3 flex flex-wrap gap-4 text-xs font-bold text-[#a85b4e]">{entry.serverShadow !== null ? <button type="button" onClick={() => { setConflictEntry(entry); setActionError('') }}>檢視並解決衝突</button> : entry.deleted ? <button type="button" onClick={() => { setConfirm({ entry, action: 'restore' }); setActionError('') }}>還原紀錄</button> : <><button type="button" onClick={() => setEditor(entry)}>編輯</button><button type="button" onClick={() => { setConfirm({ entry, action: 'delete' }); setActionError('') }}>標記刪除</button></>}</div></article>)}{visible.length === 0 && <p className="py-12 text-center text-sm text-[#8d7f76]">{search ? '找不到符合的紀錄。' : '這個月份還沒有符合的紀錄，從第一筆開始吧。'}</p>}</div>
        </section>
        <aside className="space-y-4"><section className="rounded-3xl border border-[#eaded4] bg-[#fffdfa] p-5"><h2 className="font-bold">支出分類</h2><div className="mt-4 space-y-4">{Object.entries(totals.categories).sort((a, b) => b[1] - a[1]).map(([key, amount]) => <div key={key}><div className="flex justify-between gap-2 text-xs text-[#776e68]"><span>{categories[key as keyof typeof categories]}</span><span>{formatMoney(centsToMoney(amount))}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#faf3ed]"><div className="h-full rounded-full bg-[#dfa08e]" style={{ width: `${totals.expense ? amount / totals.expense * 100 : 0}%` }} /></div></div>)}{!totals.expense && <p className="text-sm text-[#8d7f76]">尚無已結算消費支出。</p>}</div></section><section className="rounded-3xl border border-[#eaded4] bg-[#fffdfa] p-5 text-sm leading-7 text-[#8d7f76]"><p>固定支出 <strong className="float-right text-[#4a413c]">{formatMoney(centsToMoney(totals.fixed))}</strong></p><p>變動支出 <strong className="float-right text-[#4a413c]">{formatMoney(centsToMoney(totals.expense - totals.fixed))}</strong></p><p>待結算刷卡 <strong className="float-right text-[#4a413c]">{formatMoney(centsToMoney(totals.pendingCard))}</strong></p><p className="mt-3 text-xs">回補不當收入；卡費繳款與代墊償還不重複列入消費。</p></section></aside>
      </div>
      <FinanceSyncPanel batches={data.batches} pendingCount={pendingCount} onRefresh={refresh} />
    </>}
    {editor && <FinanceEntryEditor entry={editor === 'new' ? undefined : editor} linkedExpense={editor !== 'new' && editor.entityType === 'credit_card_transaction' ? data.records.find((entry) => entry.id === editor.payload.expenseClientId) : undefined} onClose={() => setEditor(null)} onSave={save} />}
    <PersonalConfirmDialog open={confirm !== null} title={confirm?.action === 'restore' ? '還原這筆紀錄？' : '標記刪除這筆紀錄？'} description={confirm?.action === 'restore' ? '網站會恢復紀錄並產生新版本，仍需重新同步；信用卡與對應支出一起還原。' : `「${confirm ? recordTitle(confirm.entry) : ''}」會從網站摘要隱藏，保留紀錄及刪除標記；信用卡與對應支出一起處理。Excel 第一版不接受正式刪除，仍需由帳本端核對。${actionError ? `操作失敗：${actionError}` : ''}`} confirmLabel={confirm?.action === 'restore' ? '確認還原' : '標記刪除'} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => { if (confirm) void runAction(confirm.entry, confirm.action) }} />
    <PersonalModal open={conflictEntry !== null} title="選擇記帳版本" busy={busy} onClose={() => setConflictEntry(null)}>{conflictEntry && <><p className="text-sm leading-6 text-[#8d7f76]">「{recordTitle(conflictEntry)}」有網站與 Excel 兩個版本。關聯信用卡與支出會一起處理，確認後才套用。</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="min-w-0 rounded-xl bg-[#faf3ed] p-3"><h3 className="font-bold">網站版本</h3><FinanceRecordDetails record={conflictEntry} /></div><div className="min-w-0 rounded-xl bg-[#f2f8ef] p-3"><h3 className="font-bold">Excel 回匯</h3>{shadowData?.success ? <FinanceRecordDetails record={shadowData.data} /> : <p className="mt-2 text-sm">回匯缺少可套用的完整內容。</p>}</div></div>{actionError && <p role="alert" className="mt-3 text-sm text-[#a85b4e]">{actionError}</p>}<div className="mt-5 flex flex-wrap justify-end gap-3"><button type="button" disabled={busy} onClick={() => void runAction(conflictEntry, 'keep-local')} className="rounded-xl border border-[#eaded4] px-4 py-2 text-sm">保留網站，重新待同步</button><button type="button" disabled={busy} onClick={() => void runAction(conflictEntry, 'use-master')} className="rounded-xl bg-[#e98a7a] px-4 py-2 text-sm text-white">採用 Excel 版本</button></div></>}</PersonalModal>
  </div>
}
