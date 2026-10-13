'use client'

import type { ReactElement } from 'react'
import type { HistorySummary } from '@/lib/finance/history'
import { centsToMoney, formatMoney, moneyToCents } from '@/lib/finance/money'

export function FinanceHistorySummary({ summary, historicalExpense }: { summary: HistorySummary; historicalExpense: number }): ReactElement {
  const expected = moneyToCents(summary.fixedExpense) + moneyToCents(summary.variableExpense)
  const difference = historicalExpense - expected
  return <section className="rounded-3xl border border-[#dce6d7] bg-[#f2f8ef] p-5 sm:p-6 xl:col-span-2">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{summary.month} 本月帳目核對</h2><span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${difference === 0 ? 'bg-white text-[#4f704e]' : 'bg-[#fff8e7] text-[#9a702b]'}`}>{difference === 0 ? '支出總額一致' : '支出總額有差額'}</span></div>
    <p className="mt-2 text-sm leading-6 text-[#5f7359]">確認 Excel 的整月支出與網站已匯入明細是否一致。這個區塊只供核對，不會再加進上方收支。</p>
    <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">{[{ label: 'Excel 整月支出', amount: expected }, { label: '網站已匯入 Excel 支出', amount: historicalExpense }, { label: '差額（網站 − Excel）', amount: difference }].map((item) => <div key={item.label} className="rounded-2xl bg-white/70 p-4"><dt className="text-sm font-medium text-[#67584e]">{item.label}</dt><dd className="mt-2 text-xl font-bold">{formatMoney(centsToMoney(item.amount))}</dd></div>)}</dl>
    {difference !== 0 && <p className="mt-3 text-sm leading-6 text-[#9a702b]">金額未一致，請確認是否漏匯入、分類不同或 Excel 明細已更新；此處只比對總額，不能證明每筆完全相同。</p>}
    <details className="mt-4 border-t border-[#dce6d7] pt-4"><summary className="cursor-pointer text-sm font-semibold text-[#4f704e]">查看 Excel 月收入與來源</summary><div className="mt-3 space-y-2 text-sm leading-6"><p>月收入：<strong>{formatMoney(summary.income)}</strong>（薪資 {summary.salary !== null ? formatMoney(summary.salary) : '未提供'}；其他收入 {summary.otherIncome !== null ? formatMoney(summary.otherIncome) : '未提供'}）</p><p>固定消費：{formatMoney(summary.fixedExpense)}；變動消費：{formatMoney(summary.variableExpense)}</p><p className="break-words">來源：{summary.fileName}</p><p>月收入沒有逐筆入帳日，不會自動產生薪資交易，也不與網站收入相加。相同月份、分類與金額的網站收入會另行提示核對。</p></div></details>
  </section>
}
