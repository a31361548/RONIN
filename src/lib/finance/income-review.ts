import { z } from 'zod'
import type { FinanceRecord } from './schema'
import { isHistoryRecord, type HistorySummary } from './history'

const reviewSchema = z.object({ decision: z.enum(['included', 'separate']), month: z.string(), summaryHash: z.string(), reviewedRevision: z.number().int().min(1), note: z.string().min(1).max(1000), reviewedAt: z.string() })
export type IncomeReview = z.infer<typeof reviewSchema>
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
  if (record.deleted || record.entityType !== 'income' || isHistoryRecord(record)) return false
  const summary = incomeSummary(record, summaries)
  return Boolean((incomeMatchesSummary(record, summary) || incomeReview(record)) && !incomeReviewCurrent(record, summary))
}
// Keep the website transaction in summaries; only its repeated Excel export is excluded.
export function incomeIncluded(record: FinanceRecord): boolean { return record.entityType === 'income' && incomeReview(record)?.decision === 'included' }
