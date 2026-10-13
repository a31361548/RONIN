import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { prisma } from '@/lib/prisma'
import { preferencesSchema } from '@/lib/finance/preferences'
import { jsonValue } from '@/lib/finance/store'

const saveSchema = z.object({ expectedRevision: z.number().int().min(0), preferences: preferencesSchema }).strict()

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthenticatedUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  const parsed = saveSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '設定不正確' }, { status: 400 })
  try {
    const result = await prisma.$transaction(async (tx) => {
      const { preferences, expectedRevision } = parsed.data
      const entries = await tx.financeEntry.findMany({ where: { userId: user.id } })
      for (const entry of entries) {
        if (!entry.localCategoryId) continue
        const item = preferences.categories.find((category) => category.id === entry.localCategoryId)
        const payload = entry.data
        if (!item || payload && typeof payload === 'object' && !Array.isArray(payload) && 'categoryCode' in payload && item.code !== payload.categoryCode) throw new Error('已使用的分類需保留且不可改變正式對應；可以改名或停用')
      }
      const ledger = await tx.financeLedger.findUnique({ where: { userId: user.id } })
      if (!ledger) {
        if (expectedRevision !== 0) throw new Error('設定版本已改變，請重新載入')
        await tx.financeLedger.create({ data: { userId: user.id, preferences: jsonValue(preferences), preferencesRevision: 1 } })
      } else {
        if ((ledger.preferencesRevision ?? 0) !== expectedRevision) throw new Error('其他分頁已修改設定，請重新載入後再試')
        const updated = await tx.financeLedger.updateMany({ where: { id: ledger.id, userId: user.id, ...(expectedRevision === 0 ? { OR: [{ preferencesRevision: 0 }, { preferencesRevision: null }, { preferencesRevision: { isSet: false } }] } : { preferencesRevision: expectedRevision }) }, data: { preferences: jsonValue(preferences), preferencesRevision: expectedRevision + 1 } })
        if (updated.count !== 1) throw new Error('其他分頁已修改設定，請重新載入後再試')
      }
      return { preferences, preferencesRevision: expectedRevision + 1 }
    })
    return NextResponse.json(result)
  } catch (reason) { return NextResponse.json({ error: reason instanceof Error ? reason.message : '設定儲存失敗' }, { status: 409 }) }
}
