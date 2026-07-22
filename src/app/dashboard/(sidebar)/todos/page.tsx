import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { PersonalTodosPage } from '@/components/todos/PersonalTodosPage'
import type { Todo } from '@/types/todo'

export const dynamic = 'force-dynamic'

export default async function TodosPage(): Promise<React.ReactElement> {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/')

  const todos = await prisma.todo.findMany({
    where: { userId: user.id },
    orderBy: [{ startAt: 'asc' }, { createdAt: 'desc' }],
  })

  const serializedTodos: Todo[] = todos.map((todo) => ({
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
  }))

  return <PersonalTodosPage initialTodos={serializedTodos} />
}
