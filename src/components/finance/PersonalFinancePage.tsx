'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { FinanceEntryEditor, type FinanceWrite } from './FinanceEntryEditor'
import { FinanceSyncPanel, financeRequest } from './FinanceSyncPanel'
import { FinanceRecordDetails } from './FinanceRecordDetails'
import { FinanceSettings, type FinanceSettingsTab } from './FinanceSettings'
import { FinanceReports } from './FinanceReports'
import { categoryForRecord, defaultPreferences, dueTemplates, templateRecord, type FinancePreferences, type FinanceTemplate, type PreferencesState } from '@/lib/finance/preferences'
import { PersonalConfirmDialog } from '@/components/ui/PersonalConfirmDialog'
import { PersonalModal } from '@/components/ui/PersonalModal'
import { PersonalSelect } from '@/components/ui/PersonalSelect'
import { PersonalDatePicker } from '@/components/ui/PersonalDatePicker'
import { FinanceHistoryImport } from './FinanceHistoryImport'
import { FinanceHistorySummary } from './FinanceHistorySummary'
import { FinanceIncomeReview } from './FinanceIncomeReview'
import { incomeIncluded, incomeNeedsReview, incomeReview, incomeReviewCurrent, incomeSummary, type FinanceBatchInfo } from '@/lib/finance/income-review'
import { refreshAfterWrite } from '@/lib/finance/write-refresh'
import { historySourceSchema, isHistoryRecord, type HistorySummary } from '@/lib/finance/history'
import { categories, entityLabels, monthlyTotals, recordAmount, recordDate, recordTitle, recordDataSchema, resultSchema, usesCashWallet, type FinanceRecord, type RecordData } from '@/lib/finance/schema'
import { centsToMoney, formatMoney, taipeiDate } from '@/lib/finance/money'

type Data = PreferencesState & { records: FinanceRecord[]; datasetId: string | null; batches: FinanceBatchInfo[]; historySummaries: HistorySummary[] }
type Action = 'delete' | 'restore' | 'keep-local' | 'use-master'
const transactionButtonClass = 'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b7655a] focus-visible:ring-offset-2'
const transactionActionClass = `${transactionButtonClass} border-[#e3cfc0] bg-[#faf3ed] text-[#795747] hover:border-[#cda58e] hover:bg-[#f3e5d9] active:bg-[#ead8c8]`
const transactionDeleteClass = `${transactionButtonClass} border-[#e8b9b1] bg-[#fff0ed] text-[#a4483b] hover:border-[#d88b7f] hover:bg-[#ffe0d9] active:bg-[#f8cfc5]`
function syncLabel(entry: FinanceRecord): string {
  if (isHistoryRecord(entry)) return 'Excel 歷史資料'
  if (incomeIncluded(entry)) return '已註記包含在 Excel 月收入 · 不重複匯出'
  if (entry.serverShadow !== null) return '待解決衝突'
  if (entry.syncError) return '同步未完成'
  if (entry.syncedRevision === entry.revision) return '已同步'
  if (entry.exportedRevision === entry.revision) return '已匯出，待回匯'
  return '待同步'
}

export function PersonalFinancePage(): ReactElement {
  const [data, setData] = useState<Data>({ records: [], datasetId: null, batches: [], historySummaries: [], preferences: defaultPreferences(), preferencesRevision: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [month, setMonth] = useState(taipeiDate().slice(0, 7))
  const [filter, setFilter] = useState<string[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [editor, setEditor] = useState<FinanceRecord | 'new' | null>(null)
  const [seed, setSeed] = useState<(RecordData & { localCategoryId?: string | null }) | undefined>()
  const [templateId, setTemplateId] = useState<string | undefined>()
  const [editingTemplate, setEditingTemplate] = useState<FinanceTemplate | undefined>()
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<FinanceSettingsTab>('categories')
  const openSettings = (tab: FinanceSettingsTab = 'categories'): void => { setSettingsTab(tab); setShowSettings(true) }
  const [notice, setNotice] = useState('')
  const [refreshError, setRefreshError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [recoveryEntryId, setRecoveryEntryId] = useState<string | null>(null)
  const openIncomeReview = (entry: FinanceRecord): void => { setRecoveryEntryId(null); setReviewEntry(entry) }
  const [historyEntry, setHistoryEntry] = useState<FinanceRecord | null>(null)
  const [reviewEntry, setReviewEntry] = useState<FinanceRecord | null>(null)
  const historySource = historySourceSchema.safeParse(historyEntry?.sourceRefs)
  const openNew = (source?: RecordData & { localCategoryId?: string | null }, template?: string): void => { setSeed(source); setTemplateId(template); setEditingTemplate(undefined); setEditor('new') }
  const editTemplate = (template: FinanceTemplate): void => { openNew({ ...template.record, localCategoryId: template.localCategoryId }); setEditingTemplate(template) }
  const [confirm, setConfirm] = useState<{ entry: FinanceRecord; action: Action } | null>(null)
  const [conflictEntry, setConflictEntry] = useState<FinanceRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const refresh = async (): Promise<void> => { setData(await financeRequest<Data>('/api/finance')); setRefreshError('') }
  const refreshSaved = async (): Promise<void> => {
    const problem = await refreshAfterWrite(refresh)
    if (problem) setRefreshError(problem)
  }
  const retryRefresh = async (): Promise<void> => {
    setRefreshing(true)
    try { await refreshSaved() } finally { setRefreshing(false) }
  }
  useEffect(() => {
    let active = true
    void financeRequest<Data>('/api/finance').then((result) => { if (active) setData(result) }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : '記帳資料載入失敗') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const totals = monthlyTotals(data.records, month)
  const historySummary = data.historySummaries.find((summary) => summary.month === month)
  const historicalExpense = monthlyTotals(data.records.filter(isHistoryRecord), month).expense
  const shadowResult = conflictEntry ? resultSchema.safeParse(conflictEntry.serverShadow) : null
  const shadowData = shadowResult?.success ? recordDataSchema.safeParse({ entityType: conflictEntry?.entityType, payload: shadowResult.data.canonicalPayload }) : null
  const pendingCount = data.records.filter((entry) => !isHistoryRecord(entry) && !incomeIncluded(entry) && entry.revision > entry.syncedRevision).length
  const walletPendingCount = data.records.filter((entry) => !isHistoryRecord(entry) && usesCashWallet(entry) && entry.revision > entry.syncedRevision).length
  const incomeCandidates = data.records.filter((entry) => incomeNeedsReview(entry, data.historySummaries))
  const entryCategory = (entry: FinanceRecord): ReturnType<typeof categoryForRecord> => {
    const expense = entry.entityType === 'credit_card_transaction' ? data.records.find((item) => item.id === entry.payload.expenseClientId) : entry
    return expense ? categoryForRecord(expense, data.preferences) : undefined
  }
  const visible = data.records.filter((entry) => {
    const category = entryCategory(entry)
    return (showDeleted ? entry.deleted : !entry.deleted) && !(entry.entityType === 'expense' && entry.payload.creditCardTransactionClientId) && recordDate(entry).startsWith(month) && (!filter.length || filter.includes(entry.entityType)) && (!categoryFilter.length || Boolean(category && (categoryFilter.includes(category.id) || category.parentId && categoryFilter.includes(category.parentId)))) && `${recordTitle(entry)} ${entry.payload.notes ?? ''} ${category?.name ?? ''}`.toLowerCase().includes(search.toLowerCase())
  }).sort((a, b) => recordDate(b).localeCompare(recordDate(a)))
  const save = async (records: FinanceWrite[]): Promise<void> => {
    const saved = await financeRequest<{ records: FinanceRecord[] }>('/api/finance', { records, ...(templateId && editor === 'new' ? { templateId, expectedPreferencesRevision: data.preferencesRevision } : {}) })
    setData((old) => ({ ...old, records: [...old.records.filter((entry) => !saved.records.some((item) => item.id === entry.id)), ...saved.records] }))
    setEditor(null); setNotice('記帳已儲存。')
    await refreshSaved()
    const candidate = saved.records.find((entry) => incomeNeedsReview(entry, data.historySummaries))
    if (candidate) openIncomeReview(candidate)
  }
  const savePreferences = async (preferences: FinancePreferences): Promise<void> => {
    const result = await financeRequest<PreferencesState>('/api/finance/preferences', { expectedRevision: data.preferencesRevision, preferences })
    setData((old) => ({ ...old, ...result })); setNotice('記帳設定已儲存。')
  }
  const saveTemplate = async (template: FinanceTemplate): Promise<void> => { await savePreferences({ ...data.preferences, templates: data.preferences.templates.some((item) => item.id === template.id) ? data.preferences.templates.map((item) => item.id === template.id ? template : item) : [...data.preferences.templates, template] }); setEditor(null); setNotice('模板已儲存，本次沒有新增交易。') }
  const openTemplate = (template: FinanceTemplate): void => openNew({ ...template.record, localCategoryId: template.localCategoryId }, template.id)
  const due = dueTemplates(data.preferences)
  const runAction = async (entry: FinanceRecord, action: Action): Promise<void> => {
    setBusy(true); setActionError('')
    try {
      const response = await fetch(`/api/finance/${entry.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, expectedRevision: entry.revision }) })
      if (!response.ok) { const result = await response.json() as { error?: string }; throw new Error(result.error ?? '操作失敗') }
      setConfirm(null); setConflictEntry(null); setNotice('帳目操作已儲存。'); await refreshSaved()
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : '操作失敗') }
    finally { setBusy(false) }
  }
  const shiftMonth = (offset: number): void => {
    const [year, m] = month.split('-').map(Number)
    const date = new Date(Date.UTC(year, m - 1 + offset, 1))
    setMonth(date.toISOString().slice(0, 7))
  }
  return <div className="space-y-6" data-testid="finance-page" data-finance-surface>
    <header className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-semibold tracking-[0.16em] text-[#b7655a]">讓每一筆生活，有跡可循</p><h1 className="mt-2 text-4xl font-bold tracking-[0.12em] text-[#3f3530] sm:text-5xl">記帳</h1><p className="mt-3 text-sm text-[#8d7f76]">日常收支、信用卡與付款，一起整理清楚。</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={loading || Boolean(error)} onClick={() => openSettings()} className="rounded-2xl border border-[#eaded4] bg-[#fffdfa] px-5 py-3 text-sm font-bold text-[#a85b4e] disabled:opacity-50">記帳設定</button><button type="button" disabled={loading || Boolean(error)} onClick={() => openNew()} className="rounded-2xl bg-[#e98a7a] px-5 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-50">＋新增記帳</button></div></header>
    {notice && <p role="status" className="rounded-2xl bg-[#f2f8ef] p-3 text-sm text-[#668866]">{notice}</p>}
    {refreshError && <div role="alert" className="rounded-2xl border border-[#ead9ad] bg-[#fff8e7] p-4 text-sm leading-6 text-[#806023]"><p className="font-semibold">操作已儲存，但清單尚未更新。請重新載入，無需再次新增或儲存。</p><p className="mt-1">{refreshError}</p><button type="button" disabled={refreshing} onClick={() => void retryRefresh()} className={`${transactionActionClass} mt-3`}>{refreshing ? '重新載入中⋯' : '重新載入清單'}</button></div>}
    {error && <div role="alert" className="rounded-2xl bg-[#fff0ed] p-4 text-sm text-[#a85b4e]">{error}<button type="button" onClick={() => { setLoading(true); void refresh().then(() => setError('')).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '載入失敗')).finally(() => setLoading(false)) }} className="ml-3 font-bold underline">重新載入</button></div>}
    {loading ? <p role="status" className="py-16 text-center text-[#8d7f76]">正在整理記帳資料⋯</p> : !error && <>
      <section className="rounded-3xl border border-[#eaded4] bg-[#fffdfa] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">從 Excel 更新網站帳目</h2><p className="mt-2 text-sm text-[#8d7f76]">選擇正式 .xlsx 帳本，預覽後更新網站；同一來源的帳目會更新，不會新增第二份。</p></div><FinanceHistoryImport preferences={data.preferences} onComplete={async (message) => { setNotice(message); await refreshSaved() }} /></div></section>
      <FinanceSyncPanel recoveryEntryId={recoveryEntryId} batches={data.batches} pendingCount={pendingCount} walletPendingCount={walletPendingCount} incomeReviewCount={incomeCandidates.length} includedIncomeCount={data.records.filter((entry) => !entry.deleted && incomeIncluded(entry)).length} onRefresh={refresh} />
      {incomeCandidates.length > 0 && <section role="status" className="rounded-3xl border border-[#ead9ad] bg-[#fff8e7] p-5"><h2 className="text-lg font-bold text-[#806023]">{incomeCandidates.length} 筆收入需要核對</h2><p className="mt-2 text-sm leading-6 text-[#806023]">網站收入可能已包含在 Excel 月收入中；月份、分類與金額相同不代表已確認同一筆。請先核對再匯出。</p><div className="mt-3 flex flex-wrap gap-2">{incomeCandidates.map((entry) => <button type="button" key={entry.id} onClick={() => openIncomeReview(entry)} className={transactionActionClass}>核對 {recordTitle(entry)} · {recordDate(entry)} · {formatMoney(recordAmount(entry))}</button>)}</div></section>}
      <section className="rounded-3xl border border-[#eaded4] bg-[#fffdfa] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">常用模板</h2><button type="button" onClick={() => openSettings('templates')} className={transactionActionClass}>管理模板</button></div><div className="mt-3 flex flex-wrap gap-2">{data.preferences.templates.filter((item) => item.active).map((template) => <div key={template.id} className="flex overflow-hidden rounded-xl bg-[#faf3ed]"><button type="button" onClick={() => openTemplate(template)} className="px-4 py-2 text-sm font-semibold text-[#776e68]">＋{template.name}</button><button type="button" aria-label={`編輯${template.name}模板`} onClick={() => editTemplate(template)} className="border-l border-[#eaded4] px-3 text-xs text-[#a85b4e]">編輯</button></div>)}{!data.preferences.templates.some((item) => item.active) && <p className="text-sm text-[#8d7f76]">新增記帳時勾選「存成常用模板」，下次就能快速帶入。</p>}</div>{due.length > 0 && <div className="mt-4 rounded-2xl bg-[#fff0ed] p-4"><h3 className="text-sm font-bold text-[#a85b4e]">{due.length} 筆重複記帳待確認</h3><div className="mt-2 flex flex-wrap gap-2">{due.map((template) => <button key={template.id} type="button" onClick={() => openTemplate(template)} className="rounded-xl bg-white px-3 py-2 text-xs text-[#a85b4e]">{template.name} · {template.nextDate} · 確認入帳</button>)}</div><p className="mt-2 text-xs text-[#8d7f76]">確認儲存後才新增交易並更新下次提醒日。</p></div>}</section>
      <div className="flex flex-wrap items-center gap-2"><button type="button" aria-label="上一個月份" onClick={() => shiftMonth(-1)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#fffdfa] text-lg">‹</button><PersonalDatePicker required mode="month" size="compact" ariaLabel="記帳月份" className="w-40" value={month} onChange={setMonth} /><button type="button" aria-label="下一個月份" onClick={() => shiftMonth(1)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#fffdfa] text-lg">›</button><button type="button" onClick={() => setMonth(taipeiDate().slice(0, 7))} className="min-h-11 rounded-xl px-3 py-2 text-sm font-semibold text-[#a85b4e]">本月</button><span className="text-xs text-[#8d7f76]">網站紀錄摘要 · 不等於 Excel 完整帳本或銀行餘額</span></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[{ label: '收入', value: totals.income, color: 'text-[#5f7f5a]' }, { label: '消費支出', value: totals.expense, color: 'text-[#a85b4e]' }, { label: '收支結餘', value: totals.income - totals.expense, color: 'text-[#4a413c]' }, { label: '付款與代墊償還', value: totals.movement, color: 'text-[#5b7486]' }].map((item) => <div key={item.label} className="rounded-3xl border border-[#eaded4] bg-[#fffdfa] p-4 sm:p-5"><p className="text-xs font-semibold text-[#8d7f76]">{item.label}</p><p className={`mt-3 break-words text-xl font-bold sm:text-2xl ${item.color}`}>{formatMoney(centsToMoney(item.value))}</p></div>)}</div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        {historySummary && <FinanceHistorySummary summary={historySummary} historicalExpense={historicalExpense} />}
        <section className="min-w-0 rounded-3xl border border-[#eaded4] bg-[#fffdfa] p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{showDeleted ? '刪除待處理' : '交易紀錄'}</h2><label className="text-xs text-[#8d7f76]"><input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} className="mr-2" />顯示刪除標記</label></div><div className="mt-4 flex flex-wrap gap-2"><PersonalSelect multiple ariaLabel="篩選記帳類型" size="compact" className="w-full sm:w-60" value={filter} onChange={setFilter} placeholder="所有類型（可複選）" options={Object.entries(entityLabels).map(([value, label]) => ({ value, label: value === 'expense' ? '消費支出' : label }))} /><PersonalSelect multiple ariaLabel="篩選支出分類" size="compact" className="w-full sm:w-52" value={categoryFilter} onChange={setCategoryFilter} placeholder="所有支出分類" options={data.preferences.categories.map((item) => ({ value: item.id, label: `${item.icon} ${item.name}${item.active ? '' : '（已停用）'}` }))} /><label className="min-w-0 flex-1"><span className="sr-only">搜尋交易</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋項目或備註" className="h-10 w-full rounded-xl border border-[#eaded4] bg-[#fffaf6] px-3 text-sm" /></label></div>
          <div className="mt-4 divide-y divide-[#f0e5dc]">{visible.map((entry) => <article key={entry.id} className="py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-[#8d7f76]">{recordDate(entry)} · {entityLabels[entry.entityType]}{entryCategory(entry) ? ` · ${entryCategory(entry)?.name}` : ''}</p><h3 className="mt-1 break-words font-bold">{recordTitle(entry)}</h3><p className="mt-1 text-xs font-semibold text-[#a85b4e]">{syncLabel(entry)}{entry.recordedDate ? ` · 正式寫入 ${entry.recordedDate}` : ''}</p></div><div className="shrink-0 text-right"><p className="text-base font-bold">{formatMoney(recordAmount(entry))}</p>{entry.entityType === 'credit_card_transaction' && <p className="mt-1 text-xs text-[#8d7f76]">{entry.payload.status === 'settled' ? `個人 ${formatMoney(entry.payload.personalAmount ?? '0.00')}` : entry.payload.status === 'cancelled' ? '已取消' : '待結算'}</p>}</div></div>{entry.payload.notes && <p className="mt-2 break-words text-sm leading-6 text-[#8d7f76]">{entry.payload.notes}</p>}{incomeReview(entry) && <p className="mt-3 rounded-xl bg-[#f2f8ef] p-3 text-sm leading-6 text-[#4f704e]"><strong>{incomeReviewCurrent(entry, incomeSummary(entry, data.historySummaries)) ? '核對註解：' : '先前核對已過期，請重新核對：'}</strong>{incomeReview(entry)?.note}</p>}{incomeNeedsReview(entry, data.historySummaries) && <p className="mt-3 rounded-xl bg-[#fff8e7] p-3 text-sm font-semibold text-[#806023]">可能已包含在 Excel 月收入，請核對後再匯出。</p>}{entry.syncError && <p className="mt-2 break-words rounded-xl bg-[#fff0ed] p-2 text-xs leading-5 text-[#a85b4e]">{entry.syncError}</p>}<div className="mt-4 flex flex-wrap gap-2">{!entry.deleted && (incomeNeedsReview(entry, data.historySummaries) || incomeReview(entry)) && <button type="button" className={transactionActionClass} onClick={() => openIncomeReview(entry)}>核對收入</button>}{isHistoryRecord(entry) ? <><button type="button" className={transactionActionClass} onClick={() => setHistoryEntry(entry)}>查看來源</button><button type="button" className={transactionActionClass} onClick={() => openNew({ ...templateRecord(entry), localCategoryId: entry.entityType === 'expense' ? entry.localCategoryId : undefined })}>複製新增</button></> : entry.serverShadow !== null ? <button type="button" className={transactionActionClass} onClick={() => { setConflictEntry(entry); setActionError('') }}>檢視並解決衝突</button> : entry.deleted ? <button type="button" className={transactionActionClass} onClick={() => { setConfirm({ entry, action: 'restore' }); setActionError('') }}>還原紀錄</button> : <><button type="button" className={transactionActionClass} onClick={() => setEditor(entry)}>編輯</button><button type="button" className={transactionActionClass} onClick={() => openNew({ ...templateRecord(entry), localCategoryId: entry.entityType === 'expense' ? entry.localCategoryId : undefined })}>複製新增</button><button type="button" className={transactionDeleteClass} onClick={() => { setConfirm({ entry, action: 'delete' }); setActionError('') }}>標記刪除</button></>}</div></article>)}{visible.length === 0 && <p className="py-12 text-center text-sm text-[#8d7f76]">{search ? '找不到符合的紀錄。' : '這個月份還沒有符合的紀錄，從第一筆開始吧。'}</p>}</div>
        </section>
        <aside className="space-y-4"><section className="rounded-3xl border border-[#eaded4] bg-[#fffdfa] p-5"><h2 className="font-bold">支出分類</h2><div className="mt-4 space-y-4">{Object.entries(totals.categories).sort((a, b) => b[1] - a[1]).map(([key, amount]) => <div key={key}><div className="flex justify-between gap-2 text-xs text-[#776e68]"><span>{data.preferences.categories.find((item) => item.id === key && !item.parentId)?.name ?? categories[key as keyof typeof categories]}</span><span>{formatMoney(centsToMoney(amount))}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#faf3ed]"><div className="h-full rounded-full bg-[#dfa08e]" style={{ width: `${totals.expense ? amount / totals.expense * 100 : 0}%` }} /></div></div>)}{!totals.expense && <p className="text-sm text-[#8d7f76]">尚無已結算消費支出。</p>}</div></section><section className="rounded-3xl border border-[#eaded4] bg-[#fffdfa] p-5 text-sm leading-7 text-[#8d7f76]"><p>固定支出 <strong className="float-right text-[#4a413c]">{formatMoney(centsToMoney(totals.fixed))}</strong></p><p>變動支出 <strong className="float-right text-[#4a413c]">{formatMoney(centsToMoney(totals.expense - totals.fixed))}</strong></p><p>待結算刷卡 <strong className="float-right text-[#4a413c]">{formatMoney(centsToMoney(totals.pendingCard))}</strong></p><p className="mt-3 text-xs">回補不當收入；卡費繳款與代墊償還不重複列入消費。</p></section></aside>
      </div>
      <FinanceReports key={month} records={data.records} preferences={data.preferences} month={month} onSettings={() => openSettings('budgets')} />
    </>}
    {editor && <FinanceEntryEditor entry={editor === 'new' ? undefined : editor} seed={editor === 'new' ? seed : undefined} template={editor === 'new' ? editingTemplate : undefined} preferences={data.preferences} linkedExpense={editor !== 'new' && editor.entityType === 'credit_card_transaction' ? data.records.find((entry) => entry.id === editor.payload.expenseClientId) : undefined} onClose={() => setEditor(null)} onSave={save} onSaveTemplate={saveTemplate} />}
    {showSettings && <FinanceSettings initialTab={settingsTab} preferences={data.preferences} onClose={() => setShowSettings(false)} onSave={savePreferences} />}
    {reviewEntry && <FinanceIncomeReview key={`${reviewEntry.id}-${reviewEntry.revision}`} entry={reviewEntry} summary={incomeSummary(reviewEntry, data.historySummaries)} batches={data.batches} onResolveBatch={() => { setRecoveryEntryId(reviewEntry.id); setReviewEntry(null) }} onClose={() => setReviewEntry(null)} onComplete={async () => { setNotice('收入核對與註解已儲存；原始 Excel 未修改。'); await refreshSaved() }} />}
    <PersonalModal surface="finance" open={historyEntry !== null} title="Excel 帳目來源" onClose={() => setHistoryEntry(null)}>{historyEntry && <><FinanceRecordDetails record={historyEntry} />{historySource.success && <div className="mt-4 rounded-xl bg-[#faf3ed] p-4 text-base font-medium leading-7"><p className="break-all">檔案：{historySource.data.fileName}</p><p>工作表：{historySource.data.sheet} 第 {historySource.data.row} 列</p><p className="break-all">正式 ID：{historySource.data.masterId}</p><p className="mt-3 text-sm leading-6 text-[#75665d]">保留來源 ID 與首次正式寫入日期。請在 Excel 修改後重新匯入；這份歷史副本不會匯出成新帳。</p></div>}</>}</PersonalModal>
    <PersonalConfirmDialog open={confirm !== null} title={confirm?.action === 'restore' ? '還原這筆紀錄？' : '標記刪除這筆紀錄？'} description={confirm?.action === 'restore' ? '網站會恢復紀錄並產生新版本，仍需重新同步；信用卡與對應支出一起還原。' : `「${confirm ? recordTitle(confirm.entry) : ''}」會從網站摘要隱藏，保留紀錄及刪除標記；信用卡與對應支出一起處理。Excel 第一版不接受正式刪除，仍需由帳本端核對。${actionError ? `操作失敗：${actionError}` : ''}`} confirmLabel={confirm?.action === 'restore' ? '確認還原' : '標記刪除'} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => { if (confirm) void runAction(confirm.entry, confirm.action) }} />
    <PersonalModal surface="finance" open={conflictEntry !== null} title="選擇記帳版本" busy={busy} onClose={() => setConflictEntry(null)}>{conflictEntry && <><p className="text-sm leading-6 text-[#8d7f76]">「{recordTitle(conflictEntry)}」有網站與 Excel 兩個版本。關聯信用卡與支出會一起處理，確認後才套用。</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="min-w-0 rounded-xl bg-[#faf3ed] p-3"><h3 className="font-bold">網站版本</h3><FinanceRecordDetails record={conflictEntry} /></div><div className="min-w-0 rounded-xl bg-[#f2f8ef] p-3"><h3 className="font-bold">Excel 回匯</h3>{shadowData?.success ? <FinanceRecordDetails record={shadowData.data} /> : <p className="mt-2 text-sm">回匯缺少可套用的完整內容。</p>}</div></div>{actionError && <p role="alert" className="mt-3 text-sm text-[#a85b4e]">{actionError}</p>}<div className="mt-5 flex flex-wrap justify-end gap-3"><button type="button" disabled={busy} onClick={() => void runAction(conflictEntry, 'keep-local')} className="rounded-xl border border-[#eaded4] px-4 py-2 text-sm">保留網站，重新待同步</button><button type="button" disabled={busy} onClick={() => void runAction(conflictEntry, 'use-master')} className="rounded-xl bg-[#e98a7a] px-4 py-2 text-sm text-white">採用 Excel 版本</button></div></>}</PersonalModal>
  </div>
}
