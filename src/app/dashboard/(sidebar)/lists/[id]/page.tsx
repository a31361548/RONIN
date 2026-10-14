import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/authOptions'
import { HoloWindow } from '@/components/ui/HoloWindow'
import { TechButton } from '@/components/ui/TechButton'
import ItemForm from './ui/ItemForm'
import ItemRow from './ui/ItemRow'
import ListTitleEditor from './ui/ListTitleEditor'

export default async function ListDetail({ params }: { params: Promise<{ id: string }> }): Promise<React.ReactElement> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) notFound()
  const { id } = await params
  const list = await prisma.list.findUnique({ where: { id }, include: { items: true } })
  if (!list) notFound()
  const expanded = list.items.flatMap((item) => Array.from({ length: item.weight }, () => item.label))
  const hasItems = expanded.length > 0
  const qs = hasItems ? encodeURIComponent(expanded.join(',')) : ''

  return (
    <HoloWindow
      title="SCROLL STUDIO"
      className="h-full"
      controls={
        <Link href="/dashboard/lists">
          <TechButton variant="ghost" className="!px-4 !py-2 text-[11px]">
            返回清單
          </TechButton>
        </Link>
      }
    >
      <div className="space-y-8">
        <section className="rounded-[34px] border border-white/10 bg-black/25 p-6 text-white shadow-[0_25px_70px_rgba(0,0,0,0.45)]">
          <ListTitleEditor listId={list.id} initialTitle={list.title} />
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/15 bg-black/40 p-4">
              <p className="text-xs font-tech uppercase tracking-[0.4em] text-white/60">項目數</p>
              <p className="mt-2 text-3xl font-mono text-white">{list.items.length}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-black/40 p-4">
              <p className="text-xs font-tech uppercase tracking-[0.4em] text-white/60">最後更新</p>
              <p className="mt-2 text-lg">{new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(list.updatedAt)}</p>
            </div>
            <div className="space-y-3 rounded-2xl border border-white/15 bg-black/40 p-4">
              <p className="text-xs font-tech uppercase tracking-[0.4em] text-white/60">輪盤狀態</p>
              <p className="mt-2 text-lg text-emerald-200">{hasItems ? 'READY' : 'EMPTY'}</p>
              {hasItems ? (
                <Link href={`/modes/wheel?items=${qs}`}>
                  <TechButton variant="primary" className="w-full !py-2 text-[11px]">
                    投入輪盤
                  </TechButton>
                </Link>
              ) : (
                <TechButton variant="ghost" className="w-full !py-2 text-[11px]" disabled>
                  尚未可用
                </TechButton>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-6 rounded-[34px] border border-white/10 bg-black/25 p-6 text-white shadow-[0_25px_70px_rgba(0,0,0,0.45)]">
          <h2 className="text-2xl font-heading">刻寫素材</h2>
          <ItemForm listId={list.id} />
        </section>

        <section className="rounded-[34px] border border-white/10 bg-black/20 p-6 text-white shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
          <h2 className="text-2xl font-heading">卷軸內容</h2>
          {list.items.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-white/20 p-10 text-center text-white/60">
              尚無項目，使用上方表單新增素材。
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {list.items.map((item) => (
                <ItemRow key={item.id} item={{ id: item.id, label: item.label, weight: item.weight }} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </HoloWindow>
  )
}
