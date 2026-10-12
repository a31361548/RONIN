import type { FinanceEntry, FinanceBatch, Prisma } from '@prisma/client'
import { z } from 'zod'
import { exportSchema, recordDataSchema, changeSchema, type FinanceRecord, type FinanceExport } from './schema'

export function serializeEntry(entry: FinanceEntry): FinanceRecord {
  return { ...recordDataSchema.parse({ entityType: entry.kind, payload: entry.data }), id: entry.id, revision: entry.revision, exportedRevision: entry.exportedRevision, syncedRevision: entry.syncedRevision, syncError: entry.syncError, deleted: entry.deleted, createdAt: entry.createdAt.toISOString(), updatedAt: entry.updatedAt.toISOString(), changeId: entry.changeId, masterRevision: entry.masterRevision, masterHash: entry.masterHash, recordedDate: entry.recordedDate, serverShadow: entry.serverShadow ?? null, sourceRefs: entry.sourceRefs ?? null }
}
export function serializeExport(batch: FinanceBatch): FinanceExport {
  const file = exportSchema.parse(batch.payload)
  return { ...file, records: file.records.map((record) => {
    const combined = z.object({ entityType: z.unknown(), payload: z.unknown() }).passthrough().parse(record)
    const { entityType, payload, ...change } = combined
    return { ...changeSchema.parse(change), ...recordDataSchema.parse({ entityType, payload }) }
  }) }
}
export function jsonValue(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue }
export const receiptSchema = z.object({ files: z.record(z.string()), committed: z.boolean(), recoveryRequired: z.boolean().default(false) })
