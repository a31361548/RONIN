import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { HoloWindow } from '@/components/ui/HoloWindow'
import { TechButton } from '@/components/ui/TechButton'
import { TodoDetailClient } from '@/components/todos/TodoDetailClient'
import type { Todo } from '@/types/todo'

type PageProps = { params: Promise<{ id: string }> }

const serializeTodo = (todo: NonNullable<Awaited<ReturnType<typeof prisma.todo.findFirst>>>): Todo => ({
  id: todo.id,
  title: todo.title,
  description: todo.description,
  status: todo.status,
  priority: todo.priority,
  recurrence: todo.recurrence,
  recurrenceInterval: todo.recurrenceInterval,
  recurrenceEndAt: todo.recurrenceEndAt?.toISOString() ?? null,
  tagIds: todo.tagIds,
  startAt: todo.startAt.toISOString(),
  endAt: todo.endAt.toISOString(),
  createdAt: todo.createdAt.toISOString(),
  updatedAt: todo.updatedAt.toISOString(),
})

export default async function TodoDetailPage({ params }: PageProps): Promise<React.ReactElement> {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')
  const { id } = await params
  const todo = await prisma.todo.findFirst({ where: { id, userId: user.id } })
  if (!todo) redirect('/dashboard/todos')
  return <HoloWindow title={`TASK ORBIT // ${todo.id.slice(0, 6)}`} className="h-full" controls={<Link href="/dashboard/todos"><TechButton variant="ghost" className="!px-4 !py-2 text-[11px]">返回清單</TechButton></Link>}><div className="space-y-6"><div className="rounded-[32px] border border-white/10 bg-gradient-to-br from-white/10 to-black/30 p-6 text-white shadow-[0_25px_70px_rgba(0,0,0,0.45)]"><p className="text-xs font-tech uppercase tracking-[0.45em] text-white/60">Task Editor</p><h1 className="text-3xl font-pixel uppercase tracking-[0.35em]">調整任務細節</h1><p className="mt-2 text-sm text-white/70">更新任務參數或刪除這筆儀式。變更後會立即同步。</p></div><TodoDetailClient initialTodo={serializeTodo(todo)} /></div></HoloWindow>
}
