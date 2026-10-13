'use client'

import { useState, type ReactElement } from 'react'
import { PersonalDatePicker } from '@/components/ui/PersonalDatePicker'
import { categories, monthlyTotals, type FinanceRecord } from '@/lib/finance/schema'
import { reportTotals, type FinancePreferences } from '@/lib/finance/preferences'
import { centsToMoney, formatMoney, moneyToCents } from '@/lib/finance/money'

const cardClass = 'min-w-0 rounded-3xl border border-[#eaded4] bg-[#fffdfa] p-5 sm:p-6'
function BudgetProgress({ label, amount, target, color = '#dfa08e' }: { label: string; amount: number; target: number; color?: string }): ReactElement {
  const exceeded = amount > target
  return <div><div className="flex flex-wrap justify-between gap-2 text-sm"><p className="font-semibold">{label}</p><p className={exceeded ? 'font-bold text-[#b85a4b]' : 'text-[#8d7f76]'}>{formatMoney(centsToMoney(amount))} / {formatMoney(centsToMoney(target))}</p></div><div role="progressbar" aria-label={`${label}使用比例`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(amount / target * 100))} aria-valuetext={`${Math.round(amount / target * 100)}%，${exceeded ? '已超出預算' : '未超出預算'}`} className="mt-2 h-2 overflow-hidden rounded-full bg-[#faf3ed]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, amount / target * 100)}%`, backgroundColor: exceeded ? '#b85a4b' : color }} /></div><p className={`mt-1 text-xs ${exceeded ? 'text-[#b85a4b]' : 'text-[#8d7f76]'}`}>{exceeded ? '超出' : '剩餘'} {formatMoney(centsToMoney(Math.abs(target - amount)))}</p></div>
}

export function FinanceReports({ records, preferences, month, onSettings }: { records: FinanceRecord[]; preferences: FinancePreferences; month: string; onSettings: () => void }): ReactElement {
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10)
  const [from, setFrom] = useState(`${month}-01`)
  const [to, setTo] = useState(lastDay)
  const rangeValid = Boolean(from && to && from <= to)
  const totals = reportTotals(records, preferences, `${month}-01`, lastDay)
  const report = reportTotals(records, preferences, from, to)
  const budget = preferences.budgets.find((item) => item.month === month)
  const target = budget ? moneyToCents(budget.total) : 0
  const categoryBudgets = Object.entries(budget?.categories ?? {}).filter(([, value]) => moneyToCents(value) > 0)
  const trend = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 6 + index, 1))
    const key = date.toISOString().slice(0, 7)
    return { key, ...monthlyTotals(records, key) }
  })
  const max = Math.max(1, ...trend.flatMap((item) => [item.income, item.expense]))
  return <div className="grid items-start gap-6 lg:grid-cols-2">
    <section className={cardClass}><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">{month} 預算</h2><button type="button" onClick={onSettings} className="text-xs font-bold text-[#a85b4e]">設定預算</button></div><p className="mt-2 text-xs leading-6 text-[#8d7f76]">依已結算消費計算，包含固定支出；待結算刷卡不列入。</p><div className="mt-5 space-y-5">{target > 0 && <BudgetProgress label="整月消費" amount={totals.expense} target={target} />}{categoryBudgets.map(([id, value]) => { const category = preferences.categories.find((item) => item.id === id); return <BudgetProgress key={id} label={`${category?.icon ?? ''} ${category?.name ?? id}`} amount={totals.categories[id] ?? 0} target={moneyToCents(value)} color={category?.color} /> })}{target === 0 && !categoryBudgets.length && <p className="py-5 text-sm text-[#8d7f76]">先設定本月消費上限，就能查看剩餘額度與超支提醒。</p>}</div></section>
    <section className={cardClass}><h2 className="text-lg font-bold">近六個月收支</h2><p className="mt-2 text-xs leading-6 text-[#8d7f76]">網站已記錄的收入與消費支出，付款和回補不重複列入。</p><div className="mt-4 flex gap-4 text-xs text-[#8d7f76]"><span>● <span className="text-[#668866]">收入</span></span><span>● <span className="text-[#b7655a]">支出</span></span></div><div className="mt-4 space-y-4">{trend.map((item) => <div key={item.key} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 text-xs"><span className="text-[#8d7f76]">{Number(item.key.slice(5))} 月</span><div><div className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-2"><div className="h-2 rounded-full bg-[#faf3ed]"><div className="h-full rounded-full bg-[#86a886]" style={{ width: `${item.income / max * 100}%` }} /></div><span className="text-right">{formatMoney(centsToMoney(item.income))}</span></div><div className="mt-2 grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-2"><div className="h-2 rounded-full bg-[#faf3ed]"><div className="h-full rounded-full bg-[#dfa08e]" style={{ width: `${item.expense / max * 100}%` }} /></div><span className="text-right">{formatMoney(centsToMoney(item.expense))}</span></div></div></div>)}</div></section>
    <section className={`${cardClass} lg:col-span-2`}><div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-lg font-bold">自訂期間分類報表</h2><div className="flex flex-wrap gap-2 text-xs"><PersonalDatePicker required size="compact" label="開始日" value={from} onChange={setFrom} /><PersonalDatePicker required size="compact" label="結束日" value={to} onChange={setTo} /></div></div>{rangeValid ? <><div className="mt-5 flex flex-wrap gap-5 text-sm"><p>收入 <strong className="text-[#668866]">{formatMoney(centsToMoney(report.income))}</strong></p><p>支出 <strong className="text-[#a85b4e]">{formatMoney(centsToMoney(report.expense))}</strong></p><p>結餘 <strong>{formatMoney(centsToMoney(report.income - report.expense))}</strong></p></div><p className="mt-2 text-xs text-[#8d7f76]">主分類已包含子分類，展開明細不另加總。</p><div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">{preferences.categories.filter((item) => !item.parentId && report.categories[item.id]).map((item) => <div key={item.id}><div className="flex justify-between gap-2 text-sm"><span>{item.icon} {item.name}</span><strong>{formatMoney(centsToMoney(report.categories[item.id]))}</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#faf3ed]"><div className="h-full rounded-full" style={{ width: `${report.expense ? report.categories[item.id] / report.expense * 100 : 0}%`, backgroundColor: item.color }} /></div>{preferences.categories.filter((child) => child.parentId === item.id && report.categories[child.id]).map((child) => <p key={child.id} className="mt-2 flex justify-between gap-2 pl-4 text-xs text-[#8d7f76]"><span>↳ {child.icon} {child.name}</span><span>{formatMoney(centsToMoney(report.categories[child.id]))}</span></p>)}</div>)}{Object.entries(report.categories).filter(([id]) => !preferences.categories.some((item) => item.id === id)).map(([id, amount]) => <p key={id} className="text-sm">{categories[id as keyof typeof categories] ?? id} · {formatMoney(centsToMoney(amount))}</p>)}{!report.expense && <p className="py-4 text-sm text-[#8d7f76]">這段期間尚無已結算消費支出。</p>}</div></> : <p role="alert" className="mt-4 text-sm text-[#a85b4e]">請選擇完整日期，且結束日需在開始日之後。</p>}</section>
  </div>
}
