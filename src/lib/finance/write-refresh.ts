// A failed list reload must never turn a confirmed write into a failed save.
export async function refreshAfterWrite(refresh: () => Promise<void>): Promise<string | null> {
  try { await refresh(); return null }
  catch (reason: unknown) { return reason instanceof Error ? reason.message : '清單讀取失敗' }
}
