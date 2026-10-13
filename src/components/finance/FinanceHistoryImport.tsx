'use client'

import { useRef, useState, type ReactElement } from 'react'
import { PersonalModal } from '@/components/ui/PersonalModal'
import { PersonalSelect } from '@/components/ui/PersonalSelect'
import { formatMoney } from '@/lib/finance/money'
import type { FinancePreferences } from '@/lib/finance/preferences'
import type { HistoryMapping, HistoryPreview, HistoryPreviewRow } from '@/lib/finance/history'

const buttonClass = 'min-h-11 rounded-xl border border-[#e3cfc0] bg-[#faf3ed] px-4 py-2 text-sm font-semibold text-[#795747] hover:bg-[#f3e5d9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b7655a] disabled:opacity-50'
const statuses = {
  new: { label: '可新增', hint: '核對後可勾選匯入', color: 'border-[#d4e4d2] bg-[#f2f8ef] text-[#426841]' },
  update: { label: '可更新', hint: '同一來源 ID 的內容已修改', color: 'border-[#cddfe8] bg-[#edf5fa] text-[#426c87]' },
  needs_mapping: { label: '待補對照', hint: '補上分類、帳戶或卡片後更新預覽', color: 'border-[#ead9ad] bg-[#fff8e8] text-[#806023]' },
  suspected: { label: '疑似重複', hint: '人工確認是不同筆後才勾選', color: 'border-[#ead9ad] bg-[#fff8e8] text-[#806023]' },
  blocked: { label: '資料錯誤', hint: '需先修正 Excel 原檔', color: 'border-[#edc5be] bg-[#fff0ed] text-[#a4483b]' },
  duplicate: { label: '已匯入', hint: '相同來源與內容，這次略過', color: 'border-[#e1ded9] bg-[#f5f4f2] text-[#78736d]' },
}
type Status = HistoryPreviewRow['status']
type Result = { imported: number; updated: number; summaries: number; skipped: number; alreadyApplied: boolean }

export function FinanceHistoryImport({ preferences, onComplete }: { preferences: FinancePreferences; onComplete: (message: string) => Promise<void> }): ReactElement {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<HistoryPreview | null>(null)
  const [mapping, setMapping] = useState<HistoryMapping>({ categories: {}, accounts: {} })
  const [selected, setSelected] = useState<string[]>([])
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Status | 'all'>('all')
  const [mappingExpanded, setMappingExpanded] = useState(false)
  const [page, setPage] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const mappingPanel = useRef<HTMLElement>(null)
  const changed = preview !== null && JSON.stringify(mapping) !== JSON.stringify(preview.defaults)
  const chosen = preview?.rows.filter((row) => selected.includes(row.key)) ?? []
  const suspected = chosen.filter((row) => row.status === 'suspected').length
  const counts = (status: Status): number => preview?.rows.filter((row) => row.status === status).length ?? 0
  const visible = preview?.rows.filter((row) => (filter === 'all' || row.status === filter) && (row.title + ' ' + row.date + ' ' + row.sheet + ' ' + row.message + ' ' + (row.categoryName ?? '') + ' ' + (row.paymentMethod ?? '') + ' ' + row.sourceIds.join(' ')).toLowerCase().includes(search.toLowerCase())) ?? []
  const pages = Math.max(1, Math.ceil(visible.length / 40))
  const missing = Array.from(new Set(preview?.rows.flatMap((row) => row.requiredMapping ? [row.requiredMapping.kind + ':' + row.requiredMapping.name] : []) ?? []))
  const mappingLabels = { category: '分類', account: '帳戶', card: '卡片' }
  const showMapping = (): void => {
    setMappingExpanded(true)
    mappingPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const reset = (): void => { setFile(null); setPreview(null); setSelected([]); setError(''); setAcknowledged(false); setSearch(''); setFilter('all'); setPage(0); setMappingExpanded(false) }
  const changeMapping = (kind: 'categories' | 'accounts' | 'cards', name: string, value: string): void => {
    setMapping((oldMapping) => ({ ...oldMapping, [kind]: { ...oldMapping[kind], [name]: value } }))
    setAcknowledged(false)
  }
  const upload = async (mode: 'preview' | 'apply', selectedFile: File, initial = false): Promise<HistoryPreview | Result> => {
    const form = new FormData()
    form.set('file', selectedFile); form.set('mode', mode)
    if (!initial) form.set('mapping', JSON.stringify(mapping))
    if (mode === 'apply') { form.set('selected', JSON.stringify(selected)); form.set('previewHash', preview?.previewHash ?? '') }
    const response = await fetch('/api/finance/history', { method: 'POST', body: form })
    if (!response.ok) { const result = await response.json().catch(() => null) as { error?: string } | null; throw new Error(result?.error ?? 'Excel 讀取失敗，請稍後重試') }
    return await response.json() as HistoryPreview | Result
  }
  const load = async (selectedFile: File, initial: boolean): Promise<void> => {
    setBusy(true); setError(''); setAcknowledged(false)
    try {
      if (!/\.xlsx$/i.test(selectedFile.name) || selectedFile.size > 3_000_000) throw new Error('請選擇小於 3 MB 的 .xlsx 帳本')
      const result = await upload('preview', selectedFile, initial) as HistoryPreview
      setFile(selectedFile); setPreview(result); setMapping(result.defaults)
      setSelected(result.rows.filter((row) => row.status === 'new' || row.status === 'update').map((row) => row.key).slice(0, 400))
      setMappingExpanded(result.rows.some((row) => row.status === 'needs_mapping'))
      setFilter('all'); setPage(0)
    } catch (reason) { setPreview(null); setError(reason instanceof Error ? reason.message : '讀取失敗') }
    finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  const apply = async (): Promise<void> => {
    if (!file || !preview || changed || !acknowledged || !selected.length) return
    setBusy(true); setError('')
    try {
      const result = await upload('apply', file) as Result
      await onComplete(result.alreadyApplied ? '這些 Excel 帳目已匯入，沒有重複新增。' : 'Excel 匯入完成：新增 ' + result.imported + ' 筆、更新 ' + result.updated + ' 筆、月彙總 ' + result.summaries + ' 個。')
      setOpen(false); reset()
    } catch (reason) { setAcknowledged(false); setError(reason instanceof Error ? reason.message : '匯入失敗') }
    finally { setBusy(false) }
  }
  return <>
    <button type="button" onClick={() => { reset(); setOpen(true) }} className={buttonClass}>匯入 Excel 帳目</button>
    <PersonalModal open={open} title="匯入 Excel 帳目" busy={busy} onClose={() => setOpen(false)} className="max-w-4xl">
      <p className="text-sm leading-6 text-[#8d7f76]">選擇「財務投資總表.xlsx」。先確認分類與付款帳戶，再預覽及勾選匯入。原始 Excel 不會被修改，投資資料暫不匯入。</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className={buttonClass}>{file ? '更換 Excel 檔案' : '選擇 Excel 檔案'}</button>
        {file && <span className="min-w-0 break-all text-sm text-[#8d7f76]">{file.name}</span>}
        <input ref={input} type="file" accept=".xlsx" aria-label="選擇歷史 Excel 帳本" className="sr-only" disabled={busy} onChange={(event) => { const chosenFile = event.target.files?.[0]; if (chosenFile) { setFile(chosenFile); setPreview(null); void load(chosenFile, true) } }} />
      </div>
      {busy && <p role="status" className="mt-3 text-sm text-[#8d7f76]">{preview ? '正在處理帳目⋯' : '正在唯讀解析 Excel⋯'}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-[#fff0ed] p-3 text-sm text-[#a4483b]">{error}</p>}
      {preview && <>
        <div className="mt-5 rounded-2xl border border-[#eaded4] bg-[#fffaf6] p-4 text-sm leading-6">
          <p className="font-semibold">共 {preview.rows.length} 組帳目，{counts('new') + counts('update')} 組可直接勾選匯入。</p>
          <p className="mt-1 text-xs text-[#8d7f76]">分類是「花在哪裡」，付款方式是「怎麼付」，帳戶是「從哪裡支出」。現金使用獨立的現金錢包。</p>
          {preview.defaults.accounts['未提供帳戶（現金）'] === 'cash' && <p className="mt-2 text-xs text-[#426841]">現金支出已依「現金 → 現金錢包」對照；消費分類仍依各筆 Excel 類別保留。</p>}
          {counts('needs_mapping') > 0 && <div className="mt-3 rounded-xl border border-[#ead9ad] bg-[#fff8e8] p-3 text-[#806023]">
            <p className="font-semibold">{counts('needs_mapping')} 組待補對照，暫時不能勾選。</p>
            <p className="mt-1 text-xs">請補上{missing.map((key) => { const [kind, ...name] = key.split(':'); return mappingLabels[kind as keyof typeof mappingLabels] + '「' + name.join(':') + '」' }).join('、')}，再按「更新預覽」。</p>
            <button type="button" disabled={busy} onClick={showMapping} className="mt-2 min-h-11 rounded-xl border border-[#dcc58c] bg-white px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b59343]">補上對照</button>
          </div>}
          {counts('blocked') > 0 && <p className="mt-3 text-xs text-[#a4483b]">{counts('blocked')} 組資料錯誤；請查看紅色列的原因並修正 Excel 原檔。</p>}
        </div>
        <section ref={mappingPanel} className="mt-4 scroll-mt-4 rounded-2xl border border-[#eaded4] p-4">
          <button type="button" aria-expanded={mappingExpanded} disabled={busy} onClick={() => setMappingExpanded((oldMappingExpanded) => !oldMappingExpanded)} className="flex min-h-11 w-full items-center justify-between gap-3 text-left font-bold">
            <span>分類與付款帳戶對照</span><span className="text-xs font-normal text-[#8d7f76]">{mappingExpanded ? '收合 ▴' : '檢查對照 ▾'}</span>
          </button>
          {mappingExpanded && <>
            <p className="mt-1 text-xs leading-6 text-[#8d7f76]">現金只使用現金錢包；轉帳需指定銀行。對照只影響網站副本。「待補對照」提示表示該欄仍待指定。</p>
            <fieldset disabled={busy} className="mt-3 grid gap-3 sm:grid-cols-2">
              {preview.categoryNames.map((name) => <PersonalSelect key={'category:' + name} label={'分類：' + (name || '空白')} value={mapping.categories[name] ?? ''} onChange={(value) => changeMapping('categories', name, value)} placeholder="請選擇網站分類" description={missing.includes('category:' + name) ? '待補對照：請指定分類' : undefined} options={preferences.categories.filter((item) => item.active).map((item) => ({ value: item.id, label: item.icon + ' ' + item.name }))} />)}
              {preview.accountNames.map((name) => <PersonalSelect key={'account:' + name} label={'付款帳戶：' + (name || '空白')} value={mapping.accounts[name] ?? ''} onChange={(value) => changeMapping('accounts', name, value)} placeholder="請指定付款帳戶" description={missing.includes('account:' + name) ? '待補對照：請指定付款帳戶' : undefined} options={preferences.accounts.filter((item) => item.active && (name === '未提供帳戶（現金）' ? item.id === 'cash' : item.id !== 'cash')).map((item) => ({ value: item.id, label: item.name }))} />)}
              {preview.cardNames.map((name) => <PersonalSelect key={'card:' + name} label={'卡片：' + name} value={mapping.cards?.[name] ?? ''} onChange={(value) => changeMapping('cards', name, value)} placeholder="請指定付款卡片" options={[{ value: 'CUBE-9539', label: preferences.cardName + ' · 9539' }]} />)}
            </fieldset>
          </>}
          {changed && <p role="status" className="mt-3 rounded-xl bg-[#fff8e8] p-3 text-xs text-[#806023]">對照已修改，預覽尚未更新，暫時不能匯入。</p>}
          {(mappingExpanded || changed) && <button type="button" disabled={busy || !file} onClick={() => { if (file) void load(file, false) }} className={buttonClass + ' mt-4'}>更新預覽</button>}
        </section>
        <details className="mt-4 rounded-xl bg-[#f5f4f2] p-3 text-xs leading-6 text-[#78736d]"><summary className="cursor-pointer font-bold">來源與匯入注意事項</summary><ul className="mt-2 list-disc pl-4">{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>
        <section className="mt-5">
          <h3 className="font-bold">帳目預覽</h3>
          <p className="mt-1 text-xs leading-6 text-[#8d7f76]">綠色可新增、藍色可更新；黃色需要補對照或核對重複；紅色是資料錯誤；灰色已匯入。點擊狀態可篩選。</p>
          <div role="group" aria-label="篩選匯入狀態" className="mt-3 flex flex-wrap gap-2">
            <button type="button" aria-pressed={filter === 'all'} onClick={() => { setFilter('all'); setPage(0) }} className={buttonClass + (filter === 'all' ? ' ring-2 ring-[#b7655a]' : '')}>全部 {preview.rows.length}</button>
            {(Object.keys(statuses) as Status[]).map((status) => <button key={status} type="button" aria-pressed={filter === status} onClick={() => { setFilter(status); setPage(0) }} className={'min-h-11 rounded-xl border px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b7655a] ' + statuses[status].color + (filter === status ? ' ring-2 ring-[#b7655a]' : '')}>{statuses[status].label} {counts(status)}</button>)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input type="search" aria-label="搜尋匯入帳目" placeholder="搜尋項目、分類、付款方式或日期" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#eaded4] px-3 text-sm" />
            <button type="button" disabled={busy || changed} onClick={() => { setSelected(preview.rows.filter((row) => row.status === 'new' || row.status === 'update').map((row) => row.key).slice(0, 400)); setAcknowledged(false) }} className={buttonClass}>勾選可匯入</button>
            <button type="button" disabled={busy} onClick={() => { setSelected([]); setAcknowledged(false) }} className={buttonClass}>清除勾選</button>
          </div>
          <p className="mt-2 text-xs text-[#8d7f76]">顯示 {visible.length} 組；篩選不會清除已勾選的帳目。</p>
          <div className="mt-3 space-y-3">
            {visible.slice(page * 40, (page + 1) * 40).map((row) => {
              const style = statuses[row.status]
              const unavailable = row.status === 'blocked' || row.status === 'needs_mapping' || row.status === 'duplicate'
              return <article key={row.key + ':' + row.row} className={'flex items-start gap-3 rounded-2xl border p-4 ' + style.color}>
                <input type="checkbox" aria-label={'匯入' + row.title + '，' + row.sheet + '第' + row.row + '列'} className="mt-1 h-4 w-4 shrink-0 accent-[#b7655a]" checked={selected.includes(row.key)} disabled={busy || changed || unavailable} onChange={(event) => { setSelected((oldSelected) => event.target.checked ? [...oldSelected, row.key] : oldSelected.filter((key) => key !== row.key)); setAcknowledged(false) }} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-[#4a413c]"><h4 className="break-words">{row.title}</h4>{row.amount && <span>{formatMoney(row.amount)}</span>}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-lg border border-current/20 px-2 py-1 font-semibold">{style.label}</span>
                    {row.categoryName && <span className="rounded-lg bg-white/70 px-2 py-1 text-[#695e57]">分類：{row.categoryName}</span>}
                    {row.paymentMethod && <span className="rounded-lg bg-white/70 px-2 py-1 text-[#695e57]">付款：{row.paymentMethod}</span>}
                    {row.paymentMethod && <span className="rounded-lg bg-white/70 px-2 py-1 text-[#695e57]">帳戶：{row.accountName || '待指定'}</span>}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[#8d7f76]">{row.date || '日期待核對'} · {row.sheet} 第 {row.row} 列</p>
                  <p className="mt-1 text-xs leading-6">{row.message || style.hint}</p>
                  {row.status === 'needs_mapping' && <button type="button" disabled={busy} onClick={showMapping} className="mt-2 min-h-11 rounded-xl border border-[#dcc58c] bg-white px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b59343]">補上對照</button>}
                  <p className="mt-2 break-all text-[11px] text-[#8d7f76]">來源 ID：{row.sourceIds.join(' ／ ') || '未提供'}</p>
                </div>
              </article>
            })}
            {!visible.length && <p className="py-8 text-center text-sm text-[#8d7f76]">沒有符合此篩選的帳目。</p>}
          </div>
          <div className="mt-3 flex items-center justify-center gap-3 text-sm"><button type="button" disabled={page === 0 || busy} onClick={() => setPage((oldPage) => oldPage - 1)} className={buttonClass}>上一頁</button><span>{page + 1} / {pages}</span><button type="button" disabled={page + 1 >= pages || busy} onClick={() => setPage((oldPage) => oldPage + 1)} className={buttonClass}>下一頁</button></div>
        </section>
        <div className="mt-5 space-y-3 border-t border-[#eaded4] bg-[#fffdfa] py-4">
          <p className="text-sm font-bold">已勾選 {selected.length} 組{suspected > 0 ? '，其中 ' + suspected + ' 組疑似重複' : ''}；信用卡與支出會一起處理。</p>
          <label className="flex items-start gap-2 text-sm leading-6 text-[#795747]"><input type="checkbox" className="mt-1.5 accent-[#b7655a]" checked={acknowledged} disabled={busy || changed || !selected.length} onChange={(event) => setAcknowledged(event.target.checked)} /><span>我已核對對照與勾選資料{suspected ? '，並確認疑似重複項目是不同筆帳目' : ''}。更新會替換同一來源 ID 的歷史副本，原有網站紀錄不會被覆蓋。</span></label>
          <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setOpen(false)} className={buttonClass}>取消</button><button type="button" disabled={busy || changed || !selected.length || !acknowledged} onClick={() => void apply()} className="min-h-11 rounded-xl bg-[#e98a7a] px-5 py-2 text-sm font-bold text-white hover:bg-[#d87969] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b7655a] focus-visible:ring-offset-2 disabled:opacity-50">確認匯入</button></div>
        </div>
      </>}
    </PersonalModal>
  </>
}
