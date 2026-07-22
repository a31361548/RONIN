'use client'

import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from 'react'
import { delayTodo, updateTodoStatus } from '@/lib/todoActions'
import { PersonalSelect } from '@/components/ui/PersonalSelect'
import { PersonalTagPicker } from '@/components/ui/PersonalTagPicker'
import { PersonalToast, type PersonalToastState } from '@/components/ui/PersonalToast'
import type { PersonalTag } from '@/types/tag'
import type { RecurrenceType, Todo, TodoPriority, TodoStatus } from '@/types/todo'
import { RECURRENCE_LABEL, RECURRENCE_OPTIONS, TODO_PRIORITY_LABEL, TODO_PRIORITY_OPTIONS, TODO_STATUS_LABEL } from '@/types/todo'

type PersonalTodosProps = { initialTodos: Todo[] }
type StatusFilter = 'ALL' | TodoStatus

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: '全部狀態' },
  ...Object.entries(TODO_STATUS_LABEL).map(([value, label]) => ({ value: value as TodoStatus, label })),
]

function localDateTime(value: Date): string {
  const offset = value.getTimezoneOffset() * 60 * 1000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(value))
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

function priorityClass(priority: TodoPriority): string {
  if (priority === 'HIGH') return 'bg-[#fff0ed] text-[#a85b4e]'
  if (priority === 'LOW') return 'bg-[#f2f6ef] text-[#5f7f5a]'
  return 'bg-[#faf3ed] text-[#9a6a5f]'
}

function statusClass(status: TodoStatus): string {
  if (status === 'COMPLETED') return 'bg-[#f2f6ef] text-[#5f7f5a]'
  if (status === 'IN_PROGRESS') return 'bg-[#edf5ea] text-[#5f7f5a]'
  if (status === 'FAILED') return 'bg-[#fff0ed] text-[#a85b4e]'
  return 'bg-[#faf3ed] text-[#9a6a5f]'
}

function TagChips({ tagIds, tags }: { tagIds: string[]; tags: PersonalTag[] }): ReactElement | null {
  const selectedTags = tagIds.map((id) => tags.find((tag) => tag.id === id)).filter((tag): tag is PersonalTag => Boolean(tag))
  if (selectedTags.length === 0) return null
  return <div className="mt-3 flex flex-wrap gap-2">{selectedTags.map((tag) => <span key={tag.id} className="rounded-full border px-2.5 py-1 text-[11px] font-bold" style={{ borderColor: tag.color, color: tag.color }}>{tag.name}</span>)}</div>
}

export function PersonalTodosPage({ initialTodos }: PersonalTodosProps): ReactElement {
  const [todos, setTodos] = useState(initialTodos)
  const [tags, setTags] = useState<PersonalTag[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startAt, setStartAt] = useState(localDateTime(new Date()))
  const [endAt, setEndAt] = useState(localDateTime(new Date(Date.now() + 30 * 60 * 1000)))
  const [priority, setPriority] = useState<TodoPriority>('MEDIUM')
  const [recurrence, setRecurrence] = useState<RecurrenceType>('NONE')
  const [recurrenceInterval, setRecurrenceInterval] = useState('1')
  const [recurrenceEndAt, setRecurrenceEndAt] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [tagFilter, setTagFilter] = useState('ALL')
  const [saving, setSaving] = useState(false)
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const [toast, setToast] = useState<PersonalToastState | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/tags')
      .then(async (response) => {
        if (!response.ok) throw new Error('標籤載入失敗')
        return (await response.json()) as { tags: PersonalTag[] }
      })
      .then((data) => { if (active) setTags(data.tags) })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  const loadTodos = async (preferredId?: string | null) => {
    const response = await fetch('/api/todos')
    if (!response.ok) throw new Error('無法取得待辦')
    const data = (await response.json()) as { todos: Todo[] }
    setTodos(data.todos)
    if (preferredId) {
      const nextTodo = data.todos.find((todo) => todo.id === preferredId)
      if (nextTodo) beginEdit(nextTodo)
    }
  }

  const resetForm = () => {
    setEditingId(null)
    setTitle('')
    setDescription('')
    setStartAt(localDateTime(new Date()))
    setEndAt(localDateTime(new Date(Date.now() + 30 * 60 * 1000)))
    setPriority('MEDIUM')
    setRecurrence('NONE')
    setRecurrenceInterval('1')
    setRecurrenceEndAt('')
    setTagIds([])
  }

  const beginEdit = (todo: Todo) => {
    setEditingId(todo.id)
    setTitle(todo.title)
    setDescription(todo.description ?? '')
    setStartAt(localDateTime(new Date(todo.startAt)))
    setEndAt(localDateTime(new Date(todo.endAt)))
    setPriority(todo.priority)
    setRecurrence(todo.recurrence)
    setRecurrenceInterval(String(todo.recurrenceInterval || 1))
    setRecurrenceEndAt(todo.recurrenceEndAt ? localDateTime(new Date(todo.recurrenceEndAt)) : '')
    setTagIds(todo.tagIds)
    setToast(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim()) {
      setToast({ tone: 'error', message: '請先輸入待辦標題' })
      return
    }
    const start = new Date(startAt)
    const end = new Date(endAt)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setToast({ tone: 'error', message: '請確認開始與結束時間' })
      return
    }
    setSaving(true)
    setToast(null)
    try {
      const endpoint = editingId ? `/api/todos/${editingId}` : '/api/todos'
      const response = await fetch(endpoint, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          priority,
          recurrence,
          recurrenceInterval: Math.max(1, Number(recurrenceInterval) || 1),
          recurrenceEndAt: recurrenceEndAt ? new Date(recurrenceEndAt).toISOString() : null,
          tagIds,
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      const savedId = editingId
      await loadTodos(savedId)
      resetForm()
      setToast({ tone: 'success', message: editingId ? '待辦已更新' : '待辦已建立' })
    } catch (error) {
      setToast({ tone: 'error', message: error instanceof Error ? error.message : '儲存失敗' })
    } finally {
      setSaving(false)
    }
  }

  const handleStatus = async (todo: Todo, nextStatus: TodoStatus) => {
    setMutatingId(todo.id)
    setToast(null)
    try {
      const updated = await updateTodoStatus(todo.id, nextStatus)
      setTodos((current) => current.map((item) => item.id === updated.id ? updated : item))
      setToast({ tone: 'success', message: nextStatus === 'COMPLETED' ? `「${todo.title}」已完成` : '狀態已更新' })
    } catch (error) {
      setToast({ tone: 'error', message: error instanceof Error ? error.message : '更新失敗' })
    } finally {
      setMutatingId(null)
    }
  }

  const handleDelay = async (todo: Todo, minutes: number) => {
    setMutatingId(todo.id)
    setToast(null)
    try {
      const nextTodo = await delayTodo(todo, minutes)
      setTodos((current) => current.map((item) => item.id === nextTodo.id ? nextTodo : item))
      setToast({ tone: 'success', message: `已延後 ${minutes} 分鐘` })
    } catch (error) {
      setToast({ tone: 'error', message: error instanceof Error ? error.message : '延後失敗' })
    } finally {
      setMutatingId(null)
    }
  }

  const handleDelete = async (todo: Todo) => {
    if (!window.confirm(`刪除前請確認：確定要刪除「${todo.title}」嗎？此動作無法復原。`)) return
    setMutatingId(todo.id)
    try {
      const response = await fetch(`/api/todos/${todo.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('刪除失敗')
      setTodos((current) => current.filter((item) => item.id !== todo.id))
      if (editingId === todo.id) resetForm()
      setToast({ tone: 'success', message: '待辦已刪除' })
    } catch (error) {
      setToast({ tone: 'error', message: error instanceof Error ? error.message : '刪除失敗' })
    } finally {
      setMutatingId(null)
    }
  }

  const matchesFilters = (todo: Todo): boolean => {
    const query = search.trim().toLowerCase()
    const matchesText = !query || `${todo.title} ${todo.description ?? ''}`.toLowerCase().includes(query)
    const matchesStatus = statusFilter === 'ALL' || todo.status === statusFilter
    const matchesTag = tagFilter === 'ALL' || todo.tagIds.includes(tagFilter)
    return matchesText && matchesStatus && matchesTag
  }

  const activeTodos = useMemo(() => todos.filter((todo) => todo.status !== 'COMPLETED' && matchesFilters(todo)), [todos, search, statusFilter, tagFilter])
  const completedTodos = useMemo(() => todos.filter((todo) => todo.status === 'COMPLETED' && matchesFilters(todo)), [todos, search, statusFilter, tagFilter])
  const todayTodos = useMemo(() => todos.filter((todo) => todo.status !== 'COMPLETED' && new Date(todo.startAt).toDateString() === new Date().toDateString()), [todos])
  const tagOptions = [{ value: 'ALL', label: '全部標籤' }, ...tags.map((tag) => ({ value: tag.id, label: tag.name }))]

  return (
    <div className="space-y-6" data-testid="todos-page">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[#c96b61]">把事情放下來，就不用一直記著</p><h1 className="mt-2 text-4xl font-bold tracking-tight text-[#2e2a28] sm:text-5xl">待辦事項</h1><p className="mt-3 text-base leading-7 text-[#776e68]">安排提醒、完成它，或替自己留一點彈性。</p></div><div className="flex gap-2 text-sm font-semibold text-[#776e68]"><span className="rounded-full bg-[#f8efe8] px-3 py-2">未完成 {todos.filter((todo) => todo.status !== 'COMPLETED').length}</span><span className="rounded-full bg-[#e9f2e6] px-3 py-2">已完成 {todos.filter((todo) => todo.status === 'COMPLETED').length}</span></div></header>

      <section className="rounded-[2rem] border border-[#eaded4] bg-[#fffdfa] p-5 shadow-[0_16px_44px_rgba(112,82,62,0.08)] sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold text-[#2e2a28]">{editingId ? '編輯待辦' : '新增待辦'}</p><p className="mt-1 text-sm text-[#8d7f76]">時間、優先級、標籤與提醒週期會同步到首頁與月曆。</p></div>{editingId && <button type="button" onClick={resetForm} className="text-sm font-semibold text-[#b7655a] hover:text-[#8f4d45]">取消編輯</button>}</div><form onSubmit={handleSubmit} className="mt-5 space-y-4"><div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]"><label className="block text-sm font-semibold text-[#695e57]">待辦標題<input data-testid="todo-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：晚上記得澆花" className="mt-2 h-12 w-full rounded-2xl border border-[#e5d9cf] bg-[#fffdfa] px-4 font-normal text-[#2e2a28] outline-none placeholder:text-[#a79b91] focus:border-[#d97568] focus:ring-4 focus:ring-[#e98a7a]/15" /></label><label className="block text-sm font-semibold text-[#695e57]">開始時間<input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-[#e5d9cf] bg-[#fffdfa] px-3 font-normal text-[#2e2a28] outline-none focus:border-[#d97568] focus:ring-4 focus:ring-[#e98a7a]/15" /></label></div><div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]"><label className="block text-sm font-semibold text-[#695e57]">備註<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="想補充的細節，可以之後再寫" className="mt-2 w-full resize-none rounded-2xl border border-[#e5d9cf] bg-[#fffdfa] px-4 py-3 font-normal leading-6 text-[#2e2a28] outline-none placeholder:text-[#a79b91] focus:border-[#d97568] focus:ring-4 focus:ring-[#e98a7a]/15" /></label><label className="block text-sm font-semibold text-[#695e57]">結束時間<input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-[#e5d9cf] bg-[#fffdfa] px-3 font-normal text-[#2e2a28] outline-none focus:border-[#d97568] focus:ring-4 focus:ring-[#e98a7a]/15" /></label></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><label className="block text-sm font-semibold text-[#695e57]">優先級<PersonalSelect value={priority} options={TODO_PRIORITY_OPTIONS} onChange={setPriority} className="mt-2" /></label><label className="block text-sm font-semibold text-[#695e57]">提醒週期<PersonalSelect value={recurrence} options={RECURRENCE_OPTIONS} onChange={setRecurrence} className="mt-2" /></label>{recurrence === 'CUSTOM' ? <label className="block text-sm font-semibold text-[#695e57]">每幾天一次<input type="number" min={1} max={365} value={recurrenceInterval} onChange={(event) => setRecurrenceInterval(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-[#e5d9cf] bg-[#fffdfa] px-4 font-normal text-[#2e2a28] outline-none focus:border-[#d97568] focus:ring-4 focus:ring-[#e98a7a]/15" /></label> : <div />}</div><div><p className="text-sm font-semibold text-[#695e57]">標籤</p><PersonalTagPicker value={tagIds} onChange={setTagIds} /></div><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[#9a8c83]">週期提醒完成後會停止建立下一次安排。</p><button type="submit" disabled={saving} className="rounded-2xl bg-[#e98a7a] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#d97568] disabled:cursor-wait disabled:opacity-60">{saving ? '儲存中⋯' : editingId ? '儲存變更' : '新增待辦'}</button></div></form></section>

      <section className="rounded-[2rem] border border-[#eaded4] bg-[#fffdfa] p-5 shadow-[0_16px_44px_rgba(112,82,62,0.08)] sm:p-7"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-sm font-bold text-[#2e2a28]">找一件事</p><p className="mt-1 text-sm text-[#8d7f76]">搜尋標題或備註，也可以依狀態與標籤篩選。</p></div><div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_150px_150px] lg:w-[620px]"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋待辦" className="h-11 rounded-2xl border border-[#e5d9cf] bg-[#fffdfa] px-4 text-sm text-[#4a413c] outline-none focus:border-[#d97568] focus:ring-4 focus:ring-[#e98a7a]/15" /><PersonalSelect value={statusFilter} options={STATUS_OPTIONS} onChange={setStatusFilter} /><PersonalSelect value={tagFilter} options={tagOptions} onChange={setTagFilter} /></div></div></section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]"><section className="rounded-[2rem] border border-[#eaded4] bg-[#fffdfa] p-5 shadow-[0_16px_44px_rgba(112,82,62,0.08)] sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold text-[#2e2a28]">所有未完成事項</p><p className="mt-1 text-sm text-[#8d7f76]">需要你下一步注意的事情。</p></div><span className="rounded-full bg-[#f8efe8] px-3 py-1 text-xs font-bold text-[#a85b4e]">{activeTodos.length} 件</span></div><div className="mt-5 space-y-3">{activeTodos.length > 0 ? activeTodos.map((todo) => { const mutating = mutatingId === todo.id; return <article key={todo.id} className="rounded-2xl border border-[#f0e5dc] bg-[#fffdfa] p-4 transition hover:border-[#d9a59a] hover:shadow-[0_10px_26px_rgba(112,82,62,0.06)]"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-base font-bold text-[#3b3531]">{todo.title}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(todo.status)}`}>{TODO_STATUS_LABEL[todo.status]}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${priorityClass(todo.priority)}`}>{TODO_PRIORITY_LABEL[todo.priority]}</span>{todo.recurrence !== 'NONE' && <span className="rounded-full bg-[#edf5ea] px-2.5 py-1 text-xs font-bold text-[#5f7f5a]">{RECURRENCE_LABEL[todo.recurrence]}</span>}</div>{todo.description && <p className="mt-2 text-sm leading-6 text-[#8d7f76]">{todo.description}</p>}<p className="mt-2 text-xs font-semibold text-[#b7655a]">{dateLabel(todo.startAt)} · {timeLabel(todo.startAt)}–{timeLabel(todo.endAt)}</p><TagChips tagIds={todo.tagIds} tags={tags} /></div><div className="flex shrink-0 flex-wrap gap-2"><button type="button" onClick={() => beginEdit(todo)} className="rounded-xl border border-[#eaded4] px-3 py-2 text-xs font-bold text-[#776e68] transition hover:border-[#d9a59a] hover:text-[#a85b4e]">編輯</button><button type="button" onClick={() => void handleStatus(todo, 'COMPLETED')} disabled={mutating} className="rounded-xl bg-[#e98a7a] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#d97568] disabled:opacity-50">完成</button></div></div><div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#f0e5dc] pt-3"><div className="flex flex-wrap gap-2">{[5, 15, 30].map((minutes) => <button key={minutes} type="button" onClick={() => void handleDelay(todo, minutes)} disabled={mutating} className="rounded-full border border-[#eaded4] px-3 py-1.5 text-xs font-semibold text-[#9a6a5f] transition hover:border-[#d9a59a] hover:bg-[#fff4ee] disabled:opacity-50">延後 {minutes} 分</button>)}</div><button type="button" onClick={() => void handleDelete(todo)} disabled={mutating} className="text-xs font-bold text-[#a85b4e] transition hover:text-[#7d3e37] disabled:opacity-50">刪除</button></div></article> }) : <div className="rounded-2xl bg-[#f2f6ef] px-5 py-10 text-center"><p className="font-bold text-[#5f7f5a]">目前沒有符合條件的未完成事項</p><p className="mt-2 text-sm text-[#81917c]">換個搜尋條件，或今天先留一點空白。</p></div>}</div></section><aside className="space-y-6"><section className="rounded-[2rem] border border-[#eaded4] bg-[#f8efe8] p-5 sm:p-6"><p className="text-sm font-bold text-[#2e2a28]">今天的安排</p><p className="mt-1 text-sm text-[#8d7f76]">今天開始的待辦會顯示在這裡。</p><div className="mt-5 space-y-2">{todayTodos.length > 0 ? todayTodos.slice(0, 5).map((todo) => <div key={todo.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#fffdfa] px-4 py-3"><span className="truncate text-sm font-semibold text-[#4a413c]">{todo.title}</span><span className="shrink-0 text-xs font-semibold text-[#b7655a]">{timeLabel(todo.startAt)}</span></div>) : <p className="rounded-2xl bg-[#fffdfa]/70 px-4 py-5 text-center text-sm text-[#9a8c83]">今天還沒有安排。</p>}</div></section><section className="rounded-[2rem] border border-[#eaded4] bg-[#fffdfa] p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-[#2e2a28]">已完成</p><span className="text-xs text-[#a79b91]">{completedTodos.length} 件</span></div><div className="mt-4 space-y-2">{completedTodos.length > 0 ? completedTodos.slice(0, 5).map((todo) => <div key={todo.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#f2f6ef] px-4 py-3"><span className="truncate text-sm font-semibold text-[#5f7f5a] line-through">{todo.title}</span><button type="button" onClick={() => void handleStatus(todo, 'NOT_STARTED')} className="shrink-0 text-xs font-bold text-[#81917c] hover:text-[#5f7f5a]">恢復</button></div>) : <p className="rounded-2xl bg-[#faf3ed] px-4 py-5 text-center text-sm text-[#9a8c83]">完成的事項會出現在這裡。</p>}</div></section></aside></div>
      <PersonalToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}
