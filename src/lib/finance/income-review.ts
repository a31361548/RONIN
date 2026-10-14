import { z } from 'zod'
import type { FinanceRecord } from './schema'
import { isHistoryRecord, type HistorySummary } from './history'

const reviewSchema = z.object({ decision: z.enum(['included', 'separate']), month: z.string(), summaryHash: z.string(), reviewedRevision: z.number().int().min(1), note: z.string().min(1).max(1000), reviewedAt: z.string() })
export type IncomeReview = z.infer<typeof reviewSchema>
export type FinanceBatchInfo = { id: string; createdAt: string; status: 'awaiting_result' | 'rejected' | 'committed' | 'recovery_required'; recordIds: string[] }
export function incomeReviewBlockReason(record: FinanceRecord, batches: FinanceBatchInfo[]): string | null {
  if (record.serverShadow !== null) return '此筆有回匯衝突，請先在交易紀錄解決衝突。'
  if (record.masterRevision !== null) return '此筆已有正式同步來源；請由帳本端核對，不能改成本地收入核對。'
  if (record.exportedRevision === 0) return null
  const related = batches.filter((batch) => batch.recordIds.includes(record.id))
  if (!related.length) return '找不到這筆收入的原批次，請重新載入或交由帳本管理對話核對。'
  if (related.some((batch) => batch.status === 'recovery_required')) return '原批次需要人工恢復；請將原檔交由帳本管理對話核對，勿建立新批次。'
  if (related.some((batch) => batch.status === 'committed')) return '原批次已有成功回匯；請先核對正式帳目與網站版本。'
  if (related.some((batch) => batch.status === 'awaiting_result')) return '原批次尚未回匯，無法確認是否已入帳。請取得該批次的完整結果，再回來核對。'
  return null
}
export function incomeReview(record: FinanceRecord): IncomeReview | null {
  const source = record.sourceRefs
  const result = reviewSchema.safeParse(source && typeof source === 'object' && 'incomeReview' in source ? source.incomeReview : null)
  return result.success ? result.data : null
}
export function incomeSummary(record: FinanceRecord, summaries: HistorySummary[]): HistorySummary | undefined {
  return record.entityType === 'income' ? summaries.find((summary) => summary.month === record.payload.receivedDate.slice(0, 7)) : undefined
}
export function summaryIncomeAmount(record: FinanceRecord, summary?: HistorySummary): string | null {
  return record.entityType === 'income' && summary ? record.payload.incomeType === 'salary' ? summary.salary : summary.otherIncome : null
}
export function incomeMatchesSummary(record: FinanceRecord, summary?: HistorySummary): boolean {
  return !record.deleted && !isHistoryRecord(record) && record.entityType === 'income' && record.payload.amount === summaryIncomeAmount(record, summary)
}
export function incomeReviewCurrent(record: FinanceRecord, summary?: HistorySummary): boolean {
  const review = incomeReview(record)
  return Boolean(review && summary && review.summaryHash === summary.sourceHash && review.month === summary.month && review.reviewedRevision === record.revision)
}
export function incomeNeedsReview(record: FinanceRecord, summaries: HistorySummary[]): boolean {
  if (record.deleted || record.entityType !== 'income' || isHistoryRecord(record) || record.syncedRevision === record.revision && record.masterRevision !== null) return false
  const summary = incomeSummary(record, summaries)
  return Boolean((incomeMatchesSummary(record, summary) || incomeReview(record)) && !incomeReviewCurrent(record, summary))
}
// Keep the website transaction in summaries; only its repeated Excel export is excluded.
export function incomeIncluded(record: FinanceRecord): boolean { return record.entityType === 'income' && incomeReview(record)?.decision === 'included' }
