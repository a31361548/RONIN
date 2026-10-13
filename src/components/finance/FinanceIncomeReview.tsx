'use client'

import { useState, type ReactElement } from 'react'
import { PersonalModal } from '@/components/ui/PersonalModal'
import { financeRequest } from './FinanceSyncPanel'
import { incomeMatchesSummary, incomeReview, summaryIncomeAmount } from '@/lib/finance/income-review'
import type { FinanceRecord } from '@/lib/finance/schema'
import type { HistorySummary } from '@/lib/finance/history'
import { formatMoney } from '@/lib/finance/money'

const defaultNotes = { included: '已核對：這筆收入包含在 Excel 的本月收入中。', separate: '已核對：這是另一筆收入，保留待同步。' }

export function FinanceIncomeReview({ entry, summary, onClose, onComplete }: { entry: FinanceRecord; summary?: HistorySummary; onClose: () => void; onComplete: () => Promise<void> }): ReactElement {
  const old = incomeReview(entry)
  const [decision, setDecision] = useState<'included' | 'separate' | ''>(old?.decision ?? '')
  const [note, setNote] = useState(old?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const editable = entry.exportedRevision === 0 && entry.masterRevision === null && entry.serverShadow === null
  const matched = incomeMatchesSummary(entry, summary)
  const excelAmount = summaryIncomeAmount(entry, summary)
  const save = async (clear = false): Promise<void> => {
    setBusy(true); setError('')
    try {
      const body = clear ? { action: 'clear-income-review', expectedRevision: entry.revision } : { action: decision === 'included' ? 'income-included' : 'income-separate', expectedRevision: entry.revision, summaryHash: summary?.sourceHash, note: note.trim() }
      await financeRequest(`/api/finance/${entry.id}`, body, 'PATCH')
      await onComplete(); onClose()
    } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : '核對失敗') }
    finally { setBusy(false) }
  }
  return <PersonalModal open title="核對這筆收入" busy={busy} onClose={onClose}>
    <p className="text-base leading-7 text-[#67584e]">Excel 提供整月收入，沒有逐筆入帳日期。相同月份、收入分類與金額只能表示可能重複，請依實際帳目確認。</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <section className="rounded-2xl border border-[#eaded4] bg-[#faf3ed] p-4"><h3 className="font-bold">網站這筆收入</h3>{entry.entityType === 'income' && <><p className="mt-2 text-base font-semibold">{entry.payload.item}</p><p className="mt-2 text-2xl font-bold">{formatMoney(entry.payload.amount)}</p><p className="mt-2 text-sm">入帳日：{entry.payload.receivedDate}</p><p className="mt-1 text-sm">{entry.payload.incomeType === 'salary' ? '薪資' : '其他收入'}</p></>}</section>
      <section className="rounded-2xl border border-[#dce6d7] bg-[#f2f8ef] p-4"><h3 className="font-bold">Excel {summary?.month ?? '未找到'} 整月{entry.entityType === 'income' && entry.payload.incomeType === 'salary' ? '薪資' : '其他收入'}</h3><p className="mt-2 text-2xl font-bold">{excelAmount !== null ? formatMoney(excelAmount) : '未提供'}</p><p className="mt-2 break-words text-sm">來源：{summary?.fileName ?? '請重新匯入帳本'}</p><p className="mt-1 text-sm">未提供逐筆入帳日期</p></section>
    </div>
    {!editable && <p className="mt-4 rounded-xl bg-[#fff8e7] p-3 text-sm leading-6">這筆收入已有匯出／同步紀錄，請先核對既有批次；此處不會取消已送出的帳目。</p>}
    <fieldset disabled={busy || !editable || !summary} className="mt-5 space-y-3">
      <legend className="mb-3 text-base font-bold">你確認後如何處理？</legend>
      {([{ value: 'included', label: '確認已包含在 Excel 月收入', description: '保留網站紀錄與入帳日，收入只計一次，這筆不再匯出為新收入。', disabled: !matched }, { value: 'separate', label: '保留為另一筆收入', description: '註記為不同收入，繼續保留待同步；不修改 Excel 月收入。', disabled: false }] as const).map((option) => <label key={option.value} className={`flex gap-3 rounded-2xl border p-4 ${decision === option.value ? 'border-[#b7655a] bg-[#faf3ed]' : 'border-[#eaded4]'} ${option.disabled ? 'opacity-50' : 'cursor-pointer'}`}><input type="radio" name="income-review-decision" value={option.value} checked={decision === option.value} disabled={option.disabled} onChange={() => { setDecision(option.value); if (!note.trim() || Object.values(defaultNotes).includes(note)) setNote(defaultNotes[option.value]) }} className="mt-1 shrink-0" /><span><span className="block font-semibold">{option.label}</span><span className="mt-1 block text-sm leading-6 text-[#75665d]">{option.description}</span></span></label>)}
      {!matched && <p className="text-sm leading-6 text-[#9a702b]">目前分類或金額不一致，不能直接確認為同一筆。</p>}
      <label className="block pt-2 text-sm font-semibold">核對註解<textarea required maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-[#eaded4] bg-white p-3 text-base font-normal" /></label>
    </fieldset>
    {error && <p role="alert" className="mt-3 text-sm text-[#a4483b]">{error}</p>}
    <div className="mt-5 flex flex-wrap justify-end gap-3">{old && editable && <button type="button" disabled={busy} onClick={() => void save(true)} className="mr-auto rounded-xl border border-[#eaded4] px-4 py-3 text-sm font-semibold">撤回核對</button>}<button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-[#eaded4] px-4 py-3 text-sm font-semibold">取消</button><button type="button" disabled={busy || !editable || !summary || !decision || !note.trim() || decision === 'included' && !matched} onClick={() => void save()} className="rounded-xl bg-[#e98a7a] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? '儲存中⋯' : '儲存核對結果'}</button></div>
  </PersonalModal>
}
