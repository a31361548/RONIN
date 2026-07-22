import type { RecurrenceType, Todo, TodoPriority, TodoStatus } from '@/types/todo'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

type PatchPayload = Partial<{
  title: string
  description: string
  startAt: string
  endAt: string
  status: TodoStatus
  priority: TodoPriority
  recurrence: RecurrenceType
  recurrenceInterval: number
  recurrenceEndAt: string | null
  tagIds: string[]
}>

const patchTodo = async (id: string, payload: PatchPayload): Promise<Todo> => {
  const res = await fetch(`/api/todos/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(payload) })
  if (!res.ok) throw new Error((await res.text()) || '更新失敗')
  const data = (await res.json()) as { todo: Todo }
  return data.todo
}

export const updateTodoStatus = (id: string, status: TodoStatus): Promise<Todo> => patchTodo(id, { status })

export const delayTodo = (todo: Todo, minutes: number): Promise<Todo> => {
  const delta = minutes * 60 * 1000
  const nextStart = new Date(new Date(todo.startAt).getTime() + delta)
  const nextEnd = new Date(new Date(todo.endAt).getTime() + delta)
  return patchTodo(todo.id, { startAt: nextStart.toISOString(), endAt: nextEnd.toISOString() })
}

export const restartTodoNow = (todo: Todo, durationMinutes: number): Promise<Todo> => {
  const startAt = new Date()
  startAt.setSeconds(0, 0)
  const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000)
  return patchTodo(todo.id, { startAt: startAt.toISOString(), endAt: endAt.toISOString(), status: 'NOT_STARTED' })
}

export const extendTodo = (todo: Todo, minutes: number): Promise<Todo> => {
  const nextEnd = new Date(new Date(todo.endAt).getTime() + minutes * 60 * 1000)
  return patchTodo(todo.id, { endAt: nextEnd.toISOString() })
}
