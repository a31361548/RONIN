'use client'

import { useState, type FormEvent, type ReactElement } from 'react'
import { PersonalModal } from '@/components/ui/PersonalModal'
import { PersonalConfirmDialog } from '@/components/ui/PersonalConfirmDialog'
import { PersonalSelect } from '@/components/ui/PersonalSelect'
import { PersonalDatePicker } from '@/components/ui/PersonalDatePicker'
import { entityLabels, recordAmount, recordDate, recordTitle, recordDataSchema, type FinanceRecord, type RecordData } from '@/lib/finance/schema'
import { templateRecord, type FinancePreferences, type FinanceTemplate } from '@/lib/finance/preferences'
import { centsToMoney, moneyToCents, taipeiDate } from '@/lib/finance/money'

export type FinanceWrite = { clientId: string; expectedRevision: number; record: RecordData; localCategoryId?: string | null }
type Props = { entry?: FinanceRecord; seed?: RecordData & { localCategoryId?: string | null }; template?: FinanceTemplate; preferences: FinancePreferences; linkedExpense?: FinanceRecord; onClose: () => void; onSave: (records: FinanceWrite[]) => Promise<void>; onSaveTemplate: (template: FinanceTemplate) => Promise<void> }
const inputClass = 'mt-2 h-11 w-full min-w-0 rounded-xl border border-[#e5d9cf] bg-[#fffdfa] px-3 text-base font-normal outline-none focus:border-[#b7655a] focus:ring-4 focus:ring-[#b7655a]/15'

export function FinanceEntryEditor({ entry, seed, template, preferences, linkedExpense, onClose, onSave, onSaveTemplate }: Props): ReactElement {
  const initial = entry ?? seed
  const [id] = useState(() => entry?.id ?? crypto.randomUUID())
  const [expenseId] = useState(() => linkedExpense?.id ?? crypto.randomUUID())
  const [kind, setKind] = useState<RecordData['entityType']>(initial?.entityType ?? 'expense')
  const [date, setDate] = useState(entry ? recordDate(entry) : taipeiDate())
  const [title, setTitle] = useState(initial ? recordTitle(initial) : '')
  const [amount, setAmount] = useState(initial ? recordAmount(initial) : '')
  const initialCode = initial?.entityType === 'expense' ? initial.payload.categoryCode : linkedExpense?.entityType === 'expense' ? linkedExpense.payload.categoryCode : undefined
  const [categoryId, setCategoryId] = useState(() => {
    const localId = initial?.localCategoryId ?? linkedExpense?.localCategoryId
    return preferences.categories.find((item) => item.id === localId && (entry || item.active) && (!initialCode || item.code === initialCode))?.id ?? preferences.categories.find((item) => item.id === initialCode && !item.parentId && (entry || item.active))?.id ?? preferences.defaults.categoryId
  })
  const category = preferences.categories.find((item) => item.id === categoryId)?.code ?? 'food'
  const initialAccount = initial?.entityType !== 'credit_card_transaction' ? initial?.payload.accountId : null
  const [account, setAccount] = useState<'cathay' | 'ctbc' | 'cash'>(!entry && (initial?.entityType === 'expense' ? initial.payload.paymentMethod === 'cash' : !initial && preferences.defaults.paymentMethod === 'cash') ? 'cash' : initialAccount && (entry || preferences.accounts.some((item) => item.id === initialAccount && item.active)) ? initialAccount : preferences.defaults.accountId)
  const [payment, setPayment] = useState(initial?.entityType === 'expense' ? initial.payload.paymentMethod : preferences.defaults.paymentMethod)
  const [fixed, setFixed] = useState(initial?.entityType === 'expense' ? initial.payload.isFixed : linkedExpense?.entityType === 'expense' ? linkedExpense.payload.isFixed : false)
  const [incomeType, setIncomeType] = useState<'salary' | 'other'>(initial?.entityType === 'income' ? initial.payload.incomeType : 'salary')
  const [recurring, setRecurring] = useState(initial?.entityType === 'income' && initial.payload.isRecurring)
  const [movementType, setMovementType] = useState<'credit_card_payment' | 'family_advance_repayment'>(initial?.entityType === 'cash_movement' ? initial.payload.movementType : 'credit_card_payment')
  const [balance, setBalance] = useState(entry?.entityType === 'cash_movement' ? entry.payload.balanceAfter ?? '' : '')
  const [status, setStatus] = useState<'pending' | 'settled' | 'cancelled'>(initial?.entityType === 'credit_card_transaction' ? initial.payload.status : 'settled')
  const [reimbursement, setReimbursement] = useState(entry?.entityType === 'credit_card_transaction' ? entry.payload.reimbursementReceivedAmount : '0.00')
  const [purchaseDate, setPurchaseDate] = useState(entry?.entityType === 'credit_card_transaction' ? entry.payload.purchaseDate : taipeiDate())
  const [postingDate, setPostingDate] = useState(entry?.entityType === 'credit_card_transaction' ? entry.payload.postingDate ?? '' : '')
  const [statementMonth, setStatementMonth] = useState(entry?.entityType === 'credit_card_transaction' || entry?.entityType === 'cash_movement' ? entry.payload.statementMonth ?? '' : '')
  const [usageDate, setUsageDate] = useState(entry?.entityType === 'credit_card_transaction' ? entry.payload.usageDate ?? '' : '')
  const [usageHours, setUsageHours] = useState(entry?.entityType === 'credit_card_transaction' ? entry.payload.usageHours ?? '' : '')
  const [notes, setNotes] = useState(initial?.payload.notes ?? '')
  const [templateMode, setTemplateMode] = useState(Boolean(template))
  const [templateName, setTemplateName] = useState(template?.name ?? '')
  const [repeat, setRepeat] = useState<FinanceTemplate['repeat']>(template?.repeat ?? 'none')
  const [nextDate, setNextDate] = useState(template?.nextDate ?? taipeiDate())
  const [reminderDay, setReminderDay] = useState(template?.reminderDay ?? Number((template?.nextDate ?? taipeiDate()).slice(8)))
  const [dirty, setDirty] = useState(Boolean(seed))
  const [confirmClose, setConfirmClose] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const close = (): void => { if (dirty) setConfirmClose(true); else onClose() }
  let personalAmount = '0.00'
  try { personalAmount = centsToMoney(moneyToCents(amount) - moneyToCents(reimbursement)) } catch { /* Input is validated before saving. */ }

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setError('')
    try {
      const commonNotes = notes.trim() || null
      let raw: unknown
      if (kind === 'income') raw = { entityType: kind, payload: { receivedDate: date, incomeType, item: title, amount, accountId: account, isRecurring: recurring, notes: commonNotes } }
      if (kind === 'expense') raw = { entityType: kind, payload: { expenseDate: date, categoryCode: category, item: title, personalAmount: amount, paymentMethod: payment, accountId: account, isFixed: fixed, notes: commonNotes, creditCardTransactionClientId: null } }
      if (kind === 'cash_movement') raw = { entityType: kind, payload: { movementDate: date, movementType, amount, accountId: account, balanceAfter: balance || null, cardId: movementType === 'credit_card_payment' ? 'CUBE-9539' : null, statementMonth: movementType === 'credit_card_payment' ? statementMonth || null : null, notes: commonNotes } }
      if (kind === 'credit_card_transaction') raw = { entityType: kind, payload: { cardId: 'CUBE-9539', purchaseDate, postingDate: postingDate || null, consumptionDate: date, statementMonth: statementMonth || null, purpose: title, usageDate: usageDate || null, usageHours: usageHours || null, grossAmount: amount, reimbursementReceivedAmount: reimbursement, pointsOffsetAmount: '0.00', personalAmount: status === 'settled' ? personalAmount : null, status, expenseClientId: status === 'settled' ? expenseId : null, notes: commonNotes } }
      const parsed = recordDataSchema.safeParse(raw)
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? '請確認欄位')
      if (templateMode) {
        setSaving(true)
        const record = templateRecord(parsed.data)
        await onSaveTemplate({ id: template?.id ?? crypto.randomUUID(), name: templateName.trim() || title.trim().slice(0, 40) || '付款模板', record, localCategoryId: record.entityType === 'expense' ? categoryId : null, repeat, nextDate: repeat === 'none' ? null : nextDate, reminderDay: repeat === 'monthly' ? reminderDay : null, active: template?.active ?? true })
        return
      }
      const writes: FinanceWrite[] = [{ clientId: id, expectedRevision: entry?.revision ?? 0, record: parsed.data, localCategoryId: kind === 'expense' ? categoryId : null }]
      if (parsed.data.entityType === 'credit_card_transaction' && parsed.data.payload.status === 'settled') writes.push({ clientId: expenseId, expectedRevision: linkedExpense?.revision ?? 0, localCategoryId: categoryId, record: recordDataSchema.parse({ entityType: 'expense', payload: { expenseDate: date, categoryCode: category, item: title, personalAmount, paymentMethod: 'credit_card', accountId: null, isFixed: fixed, notes: commonNotes, creditCardTransactionClientId: id } }) })
      setSaving(true)
      await onSave(writes)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '儲存失敗') }
    finally { setSaving(false) }
  }

  return <PersonalModal surface="finance" open title={template ? '編輯模板內容' : entry ? '編輯記帳' : '新增記帳'} onClose={close} busy={saving}>
    <form data-finance-surface onSubmit={save} onChange={() => setDirty(true)}>
      <fieldset disabled={saving} className="grid min-w-0 gap-4 text-sm font-semibold text-[#695e57] sm:grid-cols-2">
        <PersonalSelect label="紀錄類型" className="sm:col-span-2" value={kind} disabled={Boolean(entry) || Boolean(seed) || saving} onChange={(value) => { setKind(value); setAccount(value === 'expense' && payment === 'cash' ? 'cash' : preferences.defaults.accountId); setDirty(true) }} options={Object.entries(entityLabels).map(([value, label]) => ({ value: value as RecordData['entityType'], label }))} />
        <PersonalDatePicker required disabled={saving} label={kind === 'income' ? '實際入帳日' : kind === 'cash_movement' ? '付款日' : '消費日'} value={date} onChange={(value) => { setDate(value); setDirty(true) }} />
        <label>{kind === 'credit_card_transaction' ? '實刷請款金額' : '金額（TWD）'}<input required type="number" min="0.01" step="0.01" className={inputClass} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label>
        {kind !== 'cash_movement' && <label className="sm:col-span-2">項目<input required maxLength={200} className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：午餐、薪資" /></label>}
        {kind !== 'credit_card_transaction' && <PersonalSelect label="付款帳戶" value={account} disabled={saving} onChange={(value) => { setAccount(value); setDirty(true) }} options={preferences.accounts.filter((item) => (item.active || Boolean(entry) && item.id === account) && (kind === 'expense' && payment === 'cash' ? item.id === 'cash' || Boolean(entry) && item.id === account : item.id !== 'cash')).map((item) => ({ value: item.id, label: item.name + (item.active ? '' : '（已停用）') }))} description={kind === 'expense' && account === 'cash' ? '現金從錢包支出，保留現金帳戶；使用新版交換檔與帳本端接收工具，完整回匯後才確認同步。' : undefined} />}
        {kind === 'expense' && <PersonalSelect label="支付方式" required value={payment} disabled={saving} onChange={(value) => { setPayment(value); setAccount(value === 'cash' ? 'cash' : preferences.defaults.accountId); setDirty(true) }} options={[{ value: 'cash', label: '現金' }, { value: 'bank_transfer', label: '轉帳支付' }]} description="刷卡請改選「信用卡」類型。" />}
        {(kind === 'expense' || kind === 'credit_card_transaction' && status === 'settled') && <><PersonalSelect label="支出分類" value={categoryId} disabled={saving} onChange={(value) => { setCategoryId(value); setDirty(true) }} options={preferences.categories.filter((item) => item.active || Boolean(entry) && item.id === categoryId).map((item) => ({ value: item.id, label: `${item.icon} ${item.parentId ? `${preferences.categories.find((parent) => parent.id === item.parentId)?.name} / ` : ''}${item.name}${item.active ? '' : '（已停用）'}` }))} /><label className="flex items-center gap-2 self-center"><input type="checkbox" checked={fixed} onChange={(event) => setFixed(event.target.checked)} />固定支出</label></>}
        {kind === 'income' && <><PersonalSelect label="收入分類" value={incomeType} disabled={saving} onChange={(value) => { setIncomeType(value); setDirty(true) }} options={[{ value: 'salary', label: '薪資' }, { value: 'other', label: '其他收入' }]} /><label className="flex items-center gap-2"><input type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} />固定收入（僅註記，仍需手動入帳）</label></>}
        {kind === 'credit_card_transaction' && <>
          <p className="rounded-xl bg-[#faf3ed] p-3 text-xs sm:col-span-2">{preferences.cardName} · CUBE-9539。只填已收到的回補；結算會連動同一筆支出，並不表示卡費已繳清。</p>
          <PersonalSelect label="交易狀態" value={status} disabled={saving} onChange={(value) => { setStatus(value); setDirty(true) }} options={[{ value: 'settled', label: '已結算個人負擔' }, ...(entry?.entityType !== 'credit_card_transaction' || entry.payload.status !== 'settled' ? [{ value: 'pending' as const, label: '待結算' }, { value: 'cancelled' as const, label: '取消（尚未產生支出）' }] : [])]} />
          <label>已收到回補<input required type="number" min="0" step="0.01" className={inputClass} value={reimbursement} onChange={(event) => setReimbursement(event.target.value)} /></label>
          <p className="text-sm sm:col-span-2">{status === 'settled' ? `個人負擔：${personalAmount} 元` : '尚未列入消費支出'}</p>
          <PersonalDatePicker required disabled={saving} label="刷卡日" value={purchaseDate} onChange={(value) => { setPurchaseDate(value); setDirty(true) }} />
          <PersonalDatePicker disabled={saving} label="入帳日（可留白）" value={postingDate} onChange={(value) => { setPostingDate(value); setDirty(true) }} />
          <PersonalDatePicker disabled={saving} label="實際使用日（可留白）" value={usageDate} onChange={(value) => { setUsageDate(value); setDirty(true) }} />
          <label>使用時數（可留白）<input type="number" min="0" step="0.01" className={inputClass} value={usageHours} onChange={(event) => setUsageHours(event.target.value)} /></label>
        </>}
        {kind === 'cash_movement' && <><PersonalSelect label="異動類型" value={movementType} disabled={saving} onChange={(value) => { setMovementType(value); setDirty(true) }} options={[{ value: 'credit_card_payment', label: '信用卡繳款' }, { value: 'family_advance_repayment', label: '家人代墊償還' }]} /><label>異動後餘額（未知留白）<input type="number" step="0.01" className={inputClass} value={balance} onChange={(event) => setBalance(event.target.value)} /></label><p className="text-xs font-normal text-[#8d7f76] sm:col-span-2">資金異動獨立列示，不再計入消費支出，也不推算銀行餘額。</p></>}
        {(kind === 'credit_card_transaction' || kind === 'cash_movement' && movementType === 'credit_card_payment') && <PersonalDatePicker disabled={saving} mode="month" label="帳單月份（未知留白）" value={statementMonth} onChange={(value) => { setStatementMonth(value); setDirty(true) }} />}
        <label className="sm:col-span-2">備註<textarea className={`${inputClass} h-24 py-3`} maxLength={4000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <div className="rounded-2xl bg-[#faf3ed] p-4 sm:col-span-2"><label className="flex items-center gap-2"><input type="checkbox" checked={templateMode} disabled={Boolean(template)} onChange={(event) => setTemplateMode(event.target.checked)} />存成常用模板（本次不入帳）</label>{templateMode && <div className="mt-4 grid gap-4 sm:grid-cols-2"><label>模板名稱<input maxLength={40} value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder={title || '例如：每日午餐'} className={inputClass} /></label><PersonalSelect label="提醒頻率" value={repeat} onChange={(value) => { setRepeat(value); setDirty(true) }} options={[{ value: 'none', label: '不重複' }, { value: 'weekly', label: '每週' }, { value: 'monthly', label: '每月' }]} />{repeat !== 'none' && <PersonalDatePicker required disabled={saving} label="下次提醒日" value={nextDate} onChange={(value) => { setNextDate(value); setReminderDay(Number(value.slice(8))); setDirty(true) }} />}<p className="text-xs font-normal leading-6 text-[#8d7f76] sm:col-span-2">模板不保留信用卡結算連結、已收回補或銀行餘額。提醒出現後仍需確認金額並儲存記帳。</p></div>}</div>
        {error && <p role="alert" className="text-[#a85b4e] sm:col-span-2">{error}</p>}
        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#eaded4] bg-[#fffdfa] py-3 sm:col-span-2"><button type="button" onClick={close} className="rounded-xl px-4 py-2 text-[#8d7f76]">取消</button><button type="submit" className="rounded-xl bg-[#e98a7a] px-5 py-2 text-white disabled:opacity-50">{saving ? '儲存中⋯' : templateMode ? '儲存模板' : '儲存記帳'}</button></div>
      </fieldset>
    </form>
    <PersonalConfirmDialog open={confirmClose} title="放棄這次修改？" description="尚未儲存的記帳內容會遺失。" confirmLabel="放棄修改" onCancel={() => setConfirmClose(false)} onConfirm={onClose} />
  </PersonalModal>
}
