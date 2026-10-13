import { z } from 'zod'

const money = z.string().regex(/^-?\d{1,10}\.\d{2}$/)
export const historySummarySchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), salary: money.nullable(), otherIncome: money.nullable(), income: money, fixedExpense: money, variableExpense: money, recordedDate: z.string().nullable(), notes: z.string().nullable(), sourceHash: z.string(), fileName: z.string() })
export type HistorySummary = z.infer<typeof historySummarySchema>
export const historyReceiptSchema = z.object({ fileType: z.literal('finance-history'), version: z.literal(1), fileHash: z.string(), fileName: z.string(), importedAt: z.string(), summaries: z.array(historySummarySchema) })
export const historySourceSchema = z.object({ origin: z.literal('excel-history'), masterId: z.string(), sourceHash: z.string(), fileHash: z.string(), fileName: z.string(), sheet: z.string(), row: z.number().int(), original: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])) })
export function isHistoryRecord(record: { sourceRefs?: unknown }): boolean { return historySourceSchema.safeParse(record.sourceRefs).success }
export function historySummaries(payloads: unknown[]): HistorySummary[] {
  const summaries = new Map<string, HistorySummary>()
  const receipts = payloads.map((payload) => historyReceiptSchema.safeParse(payload)).filter((result) => result.success).map((result) => result.data).sort((a, b) => a.importedAt.localeCompare(b.importedAt))
  for (const receipt of receipts) for (const summary of receipt.summaries) summaries.set(summary.month, summary)
  return Array.from(summaries.values()).sort((a, b) => a.month.localeCompare(b.month))
}

export type HistoryMapping = { categories: Record<string, string>; accounts: Record<string, string>; cards?: Record<string, string> }
export type HistoryPreviewRow = { key: string; title: string; sheet: string; row: number; date: string; amount: string; status: 'new' | 'update' | 'duplicate' | 'suspected' | 'needs_mapping' | 'blocked'; message: string; sourceIds: string[]; categoryName?: string; paymentMethod?: string; accountName?: string; requiredMapping?: { kind: 'category' | 'account' | 'card'; name: string } }
export type HistoryPreview = { fileName: string; fileHash: string; previewHash: string; rows: HistoryPreviewRow[]; warnings: string[]; categoryNames: string[]; accountNames: string[]; cardNames: string[]; defaults: HistoryMapping; summaries: HistorySummary[] }
