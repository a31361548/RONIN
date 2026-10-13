'use client'

import type { ReactElement } from 'react'
import { accounts, categories, type RecordData } from '@/lib/finance/schema'
import { formatMoney } from '@/lib/finance/money'

export const financeFieldLabels: Record<string, string> = { receivedDate: '入帳日', expenseDate: '消費日', purchaseDate: '刷卡日', postingDate: '信用卡入帳日', consumptionDate: '消費日', movementDate: '付款日', incomeType: '收入分類', categoryCode: '支出分類', item: '項目', purpose: '用途', amount: '金額', personalAmount: '個人負擔', grossAmount: '實刷金額', reimbursementReceivedAmount: '已收到回補', pointsOffsetAmount: '點數折抵', accountId: '帳戶', cardId: '卡片', paymentMethod: '支付方式', isFixed: '固定支出', isRecurring: '固定收入', notes: '備註', usageDate: '使用日', usageHours: '使用時數', statementMonth: '帳單月份', movementType: '異動類型', balanceAfter: '異動後餘額', status: '結算狀態' }
const valueLabels: Record<string, string> = { ...accounts, ...categories, cash: '現金', bank_transfer: '轉帳支付', credit_card: '信用卡', salary: '薪資', other: '其他收入', pending: '待結算', settled: '已結算', cancelled: '已取消', credit_card_payment: '信用卡繳款', family_advance_repayment: '家人代墊償還', 'CUBE-9539': '國泰 CUBE' }
export function FinanceRecordDetails({ record }: { record: RecordData }): ReactElement {
  return <dl className="mt-4 divide-y divide-[#eaded4] text-base leading-7">{Object.entries(record.payload).filter(([key]) => financeFieldLabels[key]).map(([key, value]) => <div key={key} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 py-3 sm:grid-cols-[7rem_minmax(0,1fr)]"><dt className="font-medium text-[#75665d]">{financeFieldLabels[key]}</dt><dd className="min-w-0 break-words font-semibold text-[#3f3530]">{value === null ? '未填寫' : typeof value === 'boolean' ? value ? '是' : '否' : (key.endsWith('Amount') || key === 'amount' || key === 'balanceAfter') && typeof value === 'string' ? formatMoney(value) : key === 'accountId' && value === 'cash' ? '現金錢包' : valueLabels[String(value)] ?? String(value)}</dd></div>)}</dl>
}
