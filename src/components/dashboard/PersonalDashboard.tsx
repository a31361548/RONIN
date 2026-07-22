'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode } from 'react'
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { updateTodoStatus } from '@/lib/todoActions'
import { PersonalSelect } from '@/components/ui/PersonalSelect'
import { PersonalToast, type PersonalToastState } from '@/components/ui/PersonalToast'
import type { RecurrenceType, TodoPriority, TodoStatus } from '@/types/todo'
import { RECURRENCE_LABEL } from '@/types/todo'

export type DashboardTodo = {
  id: string
  title: string
  description: string | null
  status: TodoStatus
  priority: TodoPriority
  recurrence: RecurrenceType
  tagIds: string[]
  startAt: string
  endAt: string
}

export type DashboardNote = {
  id: string
  title: string
  updatedAt: string
}

export type DashboardUser = {
  name: string | null
  email: string
  avatar: string | null
  coins: number
  role: 'ADMIN' | 'MEMBER'
}

type PersonalDashboardProps = {
  user: DashboardUser
  todos: DashboardTodo[]
  notes: DashboardNote[]
  checkInDates: string[]
  completedToday: number
}

type WidgetId = 'quickAdd' | 'today' | 'unfinished' | 'notes' | 'reminders' | 'calendar' | 'quote'
type WidgetSize = 'small' | 'medium' | 'large'
type WidgetHeight = 'auto' | 'compact' | 'tall'
type WidgetConfig = { id: WidgetId; label: string; visible: boolean; size: WidgetSize; height: WidgetHeight }
type ResizeState = { id: WidgetId; startX: number; startY: number; startSize: WidgetSize; startHeight: WidgetHeight; pointerId: number }

const LAYOUT_STORAGE_KEY = 'riyu-dashboard-layout-v1'
const weekdays = ['日', '一', '二', '三', '四', '五', '六']
const sizeOrder: WidgetSize[] = ['small', 'medium', 'large']
const heightOrder: WidgetHeight[] = ['compact', 'auto', 'tall']

const DEFAULT_LAYOUT: WidgetConfig[] = [
  { id: 'quickAdd', label: '快速新增', visible: true, size: 'large', height: 'auto' },
  { id: 'today', label: '今日待辦', visible: true, size: 'medium', height: 'auto' },
  { id: 'reminders', label: '今日提醒', visible: true, size: 'small', height: 'auto' },
  { id: 'unfinished', label: '未完成事項', visible: true, size: 'medium', height: 'auto' },
  { id: 'calendar', label: '月曆', visible: true, size: 'small', height: 'auto' },
  { id: 'notes', label: '最近筆記', visible: true, size: 'medium', height: 'auto' },
  { id: 'quote', label: '自訂文字區塊', visible: true, size: 'small', height: 'auto' },
]

function dateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isToday(value: string): boolean {
  return dateKey(new Date(value)) === dateKey(new Date())
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric' }).format(new Date(value))
}

function formatLongDate(value: Date): string {
  return new Intl.DateTimeFormat('zh-TW', { weekday: 'long', month: 'long', day: 'numeric' }).format(value)
}

function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === 'string' && DEFAULT_LAYOUT.some((widget) => widget.id === value)
}

function isWidgetSize(value: unknown): value is WidgetSize {
  return value === 'small' || value === 'medium' || value === 'large'
}

function isWidgetHeight(value: unknown): value is WidgetHeight {
  return value === 'auto' || value === 'compact' || value === 'tall'
}

function sizeLabel(size: WidgetSize): string {
  if (size === 'small') return '4 欄'
  if (size === 'medium') return '8 欄'
  return '滿版'
}

function heightLabel(height: WidgetHeight): string {
  if (height === 'compact') return '較矮'
  if (height === 'tall') return '較高'
  return '自適應'
}

function widgetHeightClass(height: WidgetHeight): string {
  if (height === 'compact') return 'lg:h-[9rem]'
  if (height === 'tall') return 'lg:h-[26rem]'
  return ''
}

function sizeFromDrag(startSize: WidgetSize, deltaX: number): WidgetSize {
  const startIndex = sizeOrder.indexOf(startSize)
  const deltaSteps = Math.round(deltaX / 80)
  const nextIndex = Math.max(0, Math.min(sizeOrder.length - 1, startIndex + deltaSteps))
  return sizeOrder[nextIndex]
}

function heightFromDrag(startHeight: WidgetHeight, deltaY: number): WidgetHeight {
  const startIndex = heightOrder.indexOf(startHeight)
  const deltaSteps = Math.round(deltaY / 48)
  const nextIndex = Math.max(0, Math.min(heightOrder.length - 1, startIndex + deltaSteps))
  return heightOrder[nextIndex]
}

function normalizeLayout(value: unknown): WidgetConfig[] {
  if (!Array.isArray(value)) return DEFAULT_LAYOUT
  const candidate = value.filter((item): item is Partial<WidgetConfig> => typeof item === 'object' && item !== null)
  const byId = new Map<WidgetId, Partial<WidgetConfig>>()
  candidate.forEach((item) => {
    if (isWidgetId(item.id)) byId.set(item.id, item)
  })
  const storedOrder = candidate.map((item) => item.id).filter(isWidgetId)
  const orderedIds = [...storedOrder, ...DEFAULT_LAYOUT.map((widget) => widget.id).filter((id) => !storedOrder.includes(id))]
  return orderedIds.map((id) => {
    const fallback = DEFAULT_LAYOUT.find((widget) => widget.id === id) ?? DEFAULT_LAYOUT[0]
    const stored = byId.get(id)
    return {
      ...fallback,
      visible: typeof stored?.visible === 'boolean' ? stored.visible : fallback.visible,
      size: isWidgetSize(stored?.size) ? stored.size : fallback.size,
      height: isWidgetHeight(stored?.height) ? stored.height : fallback.height,
    }
  })
}

function widgetSpan(size: WidgetSize): string {
  if (size === 'small') return 'lg:col-span-4'
  if (size === 'medium') return 'lg:col-span-8'
  return 'lg:col-span-12'
}

function GripIcon(): ReactElement {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function ResizeIcon(): ReactElement {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m7 17 10-10M12 19l7-7M5 12l7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function WidgetDragPreview({ widget }: { widget: WidgetConfig }): ReactElement {
  return <div className="flex min-w-[220px] items-center gap-3 rounded-2xl border border-[#d9a59a] bg-[#fffdfa] px-4 py-3 text-sm font-bold text-[#4a413c] shadow-[0_18px_42px_rgba(112,82,62,0.18)]"><span className="text-[#b7655a]"><GripIcon /></span><span className="truncate">{widget.label}</span><span className="ml-auto shrink-0 rounded-full bg-[#f3e7dc] px-2 py-1 text-xs font-semibold text-[#9a6a5f]">{sizeLabel(widget.size)}</span></div>
}

type SortableWidgetProps = {
  widget: WidgetConfig
  editing: boolean
  children: ReactNode
  onToggleVisibility: (id: WidgetId) => void
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>, id: WidgetId, startSize: WidgetSize, startHeight: WidgetHeight) => void
}

function SortableWidget({ widget, editing, children, onToggleVisibility, onResizeStart }: SortableWidgetProps): ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id, disabled: !editing })
  const dragTransform = transform ? { ...transform, scaleX: 1, scaleY: 1 } : null
  const style: CSSProperties = {
    transform: CSS.Transform.toString(dragTransform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  }

  return (
    <motion.div ref={setNodeRef} style={style} layout transition={{ layout: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }} className={`relative min-w-0 ${widgetSpan(widget.size)} ${editing ? 'touch-none' : ''} ${isDragging ? 'z-20' : ''}`} data-widget-id={widget.id} {...(editing ? attributes : {})} {...(editing ? listeners : {})} aria-label={editing ? `拖曳排序${widget.label}` : undefined}>
      {editing && <div className="mb-2 flex min-w-0 items-center gap-2 rounded-2xl border border-[#eaded4] bg-[#fffaf6] px-3 py-2 text-xs text-[#9a8c83] shadow-[0_6px_16px_rgba(112,82,62,0.05)]"><span className="shrink-0 text-[#b7655a]"><GripIcon /></span><span className="min-w-0 truncate font-bold text-[#4a413c]">{widget.label}</span><span className="shrink-0 rounded-xl bg-[#f3e7dc] px-2 py-1 font-semibold text-[#9a6a5f]">{sizeLabel(widget.size)}</span><span className="shrink-0 rounded-xl bg-[#f8efe8] px-2 py-1 font-semibold text-[#9a6a5f]">{heightLabel(widget.height)}</span><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onToggleVisibility(widget.id) }} className="ml-auto shrink-0 rounded-xl px-2 py-1 font-bold text-[#a85b4e] transition hover:bg-[#fff0eb]">隱藏</button></div>}
      <div className={`relative min-w-0 ${editing ? 'rounded-[2.15rem] ring-2 ring-[#e8c5bb] ring-offset-2 ring-offset-[#fcf7f2]' : ''}`}>
        {children}
        {editing && <button type="button" data-resize-handle="true" onPointerDown={(event) => onResizeStart(event, widget.id, widget.size, widget.height)} onClick={(event) => event.stopPropagation()} className="absolute bottom-3 right-3 z-20 hidden h-9 w-9 cursor-se-resize items-center justify-center rounded-xl border border-[#eaded4] bg-[#fffdfa] text-[#b7655a] shadow-sm transition hover:border-[#d9a59a] hover:bg-[#fff0eb] lg:flex" aria-label={`拖曳調整${widget.label}大小`} title="拖曳調整寬度與高度"><ResizeIcon /></button>}
      </div>
    </motion.div>
  )
}

type DashboardCardProps = {
  children: ReactNode
  className?: string
  allowOverflow?: boolean
  fixedHeight?: WidgetHeight
}

function DashboardCard({ children, className = '', allowOverflow = false, fixedHeight = 'auto' }: DashboardCardProps): ReactElement {
  const overflowClass = allowOverflow ? 'overflow-visible' : fixedHeight === 'auto' ? 'overflow-hidden' : 'dashboard-card-scroll overflow-y-auto overflow-x-hidden overscroll-contain'
  return <section className={`min-w-0 ${overflowClass} rounded-[2rem] border border-[#eaded4] bg-[#fffdfa] p-5 shadow-[0_16px_44px_rgba(112,82,62,0.08)] sm:p-7 ${className}`}>{children}</section>
}

function TodoRow({ todo, onComplete }: { todo: DashboardTodo; onComplete: (id: string) => Promise<void> }): ReactElement {
  const [updating, setUpdating] = useState(false)

  const handleComplete = async () => {
    setUpdating(true)
    try {
      await onComplete(todo.id)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-[#f0e5dc] py-4 last:border-b-0">
      <button type="button" onClick={handleComplete} disabled={updating} aria-label={`完成 ${todo.title}`} className="h-5 w-5 shrink-0 rounded-full border-2 border-[#d9a59a] transition hover:bg-[#e98a7a] disabled:cursor-wait disabled:opacity-50" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold text-[#3b3531]">{todo.title}</p>
          {todo.priority === 'HIGH' && <span className="shrink-0 rounded-full bg-[#fff0ed] px-2 py-0.5 text-[10px] font-bold text-[#a85b4e]">重要</span>}
        </div>
        <p className="mt-1 truncate text-xs text-[#9a8c83]">{todo.description || (isToday(todo.startAt) ? `今天 ${formatTime(todo.startAt)}` : formatDate(todo.startAt))}</p>
      </div>
      <span className="shrink-0 rounded-full bg-[#f8efe8] px-3 py-1 text-xs font-semibold text-[#9a6a5f]">{todo.recurrence === 'NONE' ? '待辦' : RECURRENCE_LABEL[todo.recurrence]}</span>
    </div>
  )
}

export function PersonalDashboard({ user, todos: initialTodos, notes, checkInDates, completedToday }: PersonalDashboardProps): ReactElement {
  const router = useRouter()
  const [todos, setTodos] = useState(initialTodos)
  const [quickType, setQuickType] = useState<'todo' | 'note'>('todo')
  const [quickTitle, setQuickTitle] = useState('')
  const [quickSaving, setQuickSaving] = useState(false)
  const [toast, setToast] = useState<PersonalToastState | null>(null)
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()))
  const [customText, setCustomText] = useState('今天只做一件最重要的事。')
  const [editingText, setEditingText] = useState(false)
  const [layout, setLayout] = useState<WidgetConfig[]>(DEFAULT_LAYOUT)
  const [layoutReady, setLayoutReady] = useState(false)
  const [editingLayout, setEditingLayout] = useState(false)
  const [activeWidgetId, setActiveWidgetId] = useState<WidgetId | null>(null)
  const [resizeState, setResizeState] = useState<ResizeState | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    const savedText = window.localStorage.getItem('riyu-dashboard-text')
    if (savedText) setCustomText(savedText)
    const savedLayout = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (savedLayout) {
      try {
        setLayout(normalizeLayout(JSON.parse(savedLayout) as unknown))
      } catch {
        setLayout(DEFAULT_LAYOUT)
      }
    }
    setLayoutReady(true)
  }, [])

  useEffect(() => {
    if (layoutReady) window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  }, [layout, layoutReady])

  useEffect(() => {
    if (!resizeState) return
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== resizeState.pointerId) return
      const nextSize = sizeFromDrag(resizeState.startSize, event.clientX - resizeState.startX)
      const nextHeight = heightFromDrag(resizeState.startHeight, event.clientY - resizeState.startY)
      setLayout((current) => current.map((widget) => widget.id === resizeState.id ? { ...widget, size: nextSize, height: nextHeight } : widget))
    }
    const handlePointerEnd = (event: globalThis.PointerEvent) => {
      if (event.pointerId === resizeState.pointerId) setResizeState(null)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerEnd)
    window.addEventListener('pointercancel', handlePointerEnd)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
    }
  }, [resizeState])

  const todayTodos = useMemo(() => todos.filter((todo) => todo.status !== 'COMPLETED' && isToday(todo.startAt)).slice(0, 5), [todos])
  const unfinishedTodos = useMemo(() => todos.filter((todo) => todo.status !== 'COMPLETED').slice(0, 6), [todos])
  const scheduledDays = useMemo(() => new Set([...todos.map((todo) => dateKey(new Date(todo.startAt))), ...checkInDates]), [checkInDates, todos])
  const displayName = user.name || user.email.split('@')[0]
  const now = new Date()
  const monthLabel = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long' }).format(now)
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const calendarCells = Array.from({ length: firstDay + daysInMonth }, (_, index) => index < firstDay ? null : index - firstDay + 1)
  const visibleWidgets = layout.filter((widget) => widget.visible)
  const hiddenWidgets = layout.filter((widget) => !widget.visible)
  const activeWidget = activeWidgetId ? layout.find((widget) => widget.id === activeWidgetId) ?? null : null

  const handleComplete = async (id: string) => {
    await updateTodoStatus(id, 'COMPLETED')
    setTodos((current) => current.filter((todo) => todo.id !== id))
    router.refresh()
  }

  const handleQuickAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!quickTitle.trim()) {
      setToast({ tone: 'error', message: '請先輸入想新增的內容' })
      return
    }
    setQuickSaving(true)
    setToast(null)
    try {
      const endpoint = quickType === 'todo' ? '/api/todos' : '/api/notes'
      const nowValue = new Date()
      const payload = quickType === 'todo'
        ? { title: quickTitle.trim(), startAt: nowValue.toISOString(), endAt: new Date(nowValue.getTime() + 30 * 60 * 1000).toISOString() }
        : { title: quickTitle.trim(), content: '' }
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!response.ok) throw new Error('建立失敗')
      setQuickTitle('')
      setToast({ tone: 'success', message: quickType === 'todo' ? '已加入今日待辦' : '已建立新筆記' })
      router.refresh()
    } catch (error) {
      setToast({ tone: 'error', message: error instanceof Error ? error.message : '建立失敗，請稍後再試' })
    } finally {
      setQuickSaving(false)
    }
  }

  const handleSaveCustomText = () => {
    window.localStorage.setItem('riyu-dashboard-text', customText)
    setEditingText(false)
    setToast({ tone: 'success', message: '給自己的話已儲存' })
  }

  const updateWidget = (id: WidgetId, update: Partial<WidgetConfig>) => {
    setLayout((current) => current.map((widget) => widget.id === id ? { ...widget, ...update } : widget))
  }

  const reorderWidgets = (sourceId: WidgetId, targetId: WidgetId) => {
    setLayout((current) => {
      const sourceIndex = current.findIndex((widget) => widget.id === sourceId)
      const targetIndex = current.findIndex((widget) => widget.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return current
      return arrayMove(current, sourceIndex, targetIndex)
    })
  }

  const handleDragStart = ({ active }: DragStartEvent) => {
    if (isWidgetId(active.id)) setActiveWidgetId(active.id)
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && isWidgetId(active.id) && isWidgetId(over.id)) reorderWidgets(active.id, over.id)
    setActiveWidgetId(null)
  }

  const handleDragCancel = () => setActiveWidgetId(null)

  const handleResizeStart = (event: ReactPointerEvent<HTMLButtonElement>, id: WidgetId, startSize: WidgetSize, startHeight: WidgetHeight) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setResizeState({ id, startX: event.clientX, startY: event.clientY, startSize, startHeight, pointerId: event.pointerId })
  }

  const resetLayout = () => {
    setLayout(DEFAULT_LAYOUT)
    setToast({ tone: 'success', message: '首頁配置已重設' })
  }

  const renderWidget = (widget: WidgetConfig): ReactElement | null => {
    if (!widget.visible) return null
    const wrapperClass = 'min-w-0'
    const cardHeightClass = widgetHeightClass(widget.height)

    if (widget.id === 'quickAdd') {
      return (
        <div key={widget.id} className={wrapperClass}>
          <DashboardCard allowOverflow fixedHeight={widget.height} className={`${cardHeightClass} sm:p-6`}>
            <div className="flex min-w-0 flex-col gap-4">
              <div className="min-w-0"><p className="text-sm font-bold text-[#2e2a28]">快速新增</p><p className="mt-1 text-sm text-[#8d7f76]">想到就先放進來，之後再慢慢整理。</p></div>
              <form onSubmit={handleQuickAdd} className="flex min-w-0 w-full flex-col gap-3 sm:flex-row">
                <PersonalSelect value={quickType} onChange={setQuickType} options={[{ value: 'todo', label: '待辦事項' }, { value: 'note', label: '筆記' }]} className="sm:w-32 sm:shrink-0" />
                <input value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} placeholder={quickType === 'todo' ? '例如：晚上記得澆花' : '例如：今天的想法'} className="h-12 min-w-0 flex-1 rounded-2xl border border-[#e5d9cf] bg-[#fffdfa] px-4 text-sm text-[#2e2a28] outline-none placeholder:text-[#a79b91] focus:border-[#d97568] focus:ring-4 focus:ring-[#e98a7a]/15" />
                <button type="submit" disabled={quickSaving} className="h-12 shrink-0 rounded-2xl bg-[#e98a7a] px-6 text-sm font-bold text-white transition hover:bg-[#d97568] disabled:cursor-wait disabled:opacity-60">{quickSaving ? '建立中⋯' : '新增'}</button>
              </form>
            </div>
          </DashboardCard>
        </div>
      )
    }

    if (widget.id === 'today') {
      return <div key={widget.id} className={wrapperClass}><DashboardCard fixedHeight={widget.height} className={cardHeightClass}><div className="flex min-w-0 items-start justify-between gap-4"><div className="min-w-0"><p className="text-sm font-bold text-[#2e2a28]">今日待辦</p><p className="mt-1 text-sm text-[#8d7f76]">完成一件，就替今天留下一個小記號。</p></div><Link href="/dashboard/todos" className="shrink-0 text-sm font-semibold text-[#b7655a] hover:text-[#8f4d45]">查看全部</Link></div><div className="mt-4">{todayTodos.length > 0 ? todayTodos.map((todo) => <TodoRow key={todo.id} todo={todo} onComplete={handleComplete} />) : <div className="rounded-2xl bg-[#faf3ed] px-5 py-8 text-center"><p className="text-base font-bold text-[#695e57]">今天還沒有待辦</p><p className="mt-2 text-sm text-[#9a8c83]">可以從上方快速新增，或讓今天保持輕盈。</p></div>}</div></DashboardCard></div>
    }

    if (widget.id === 'unfinished') {
      return <div key={widget.id} className={wrapperClass}><DashboardCard fixedHeight={widget.height} className={cardHeightClass}><div className="flex min-w-0 items-start justify-between gap-4"><div className="min-w-0"><p className="text-sm font-bold text-[#2e2a28]">未完成事項</p><p className="mt-1 text-sm text-[#8d7f76]">目前還放在你手上的事情。</p></div><span className="shrink-0 rounded-full bg-[#f3e7dc] px-3 py-1 text-xs font-bold text-[#a85b4e]">{unfinishedTodos.length} 件</span></div><div className="mt-4">{unfinishedTodos.length > 0 ? unfinishedTodos.map((todo) => <TodoRow key={todo.id} todo={todo} onComplete={handleComplete} />) : <div className="rounded-2xl bg-[#f2f6ef] px-5 py-8 text-center"><p className="text-base font-bold text-[#5f7f5a]">目前沒有未完成事項</p><p className="mt-2 text-sm text-[#81917c]">做得很好，這裡可以先留白。</p></div>}</div></DashboardCard></div>
    }

    if (widget.id === 'notes') {
      return <div key={widget.id} className={wrapperClass}><DashboardCard fixedHeight={widget.height} className={cardHeightClass}><div className="flex min-w-0 items-start justify-between gap-4"><div className="min-w-0"><p className="text-sm font-bold text-[#2e2a28]">最近筆記</p><p className="mt-1 text-sm text-[#8d7f76]">讓剛剛寫下的想法容易被找回來。</p></div><Link href="/dashboard/notes" className="shrink-0 text-sm font-semibold text-[#b7655a] hover:text-[#8f4d45]">查看筆記</Link></div><div className="mt-4 space-y-1">{notes.length > 0 ? notes.map((note) => <Link key={note.id} href={`/dashboard/notes/${note.id}`} className="flex min-w-0 items-center justify-between gap-4 rounded-2xl px-4 py-3 transition hover:bg-[#faf3ed]"><span className="min-w-0 truncate text-sm font-semibold text-[#4a413c]">{note.title}</span><span className="shrink-0 text-xs text-[#a79b91]">{formatDate(note.updatedAt)}</span></Link>) : <div className="rounded-2xl bg-[#faf3ed] px-5 py-8 text-center"><p className="text-base font-bold text-[#695e57]">還沒有筆記</p><p className="mt-2 text-sm text-[#9a8c83]">把一個念頭寫下來，日隅會替你留著。</p></div>}</div></DashboardCard></div>
    }

    if (widget.id === 'reminders') {
      return <div key={widget.id} className={wrapperClass}><DashboardCard fixedHeight={widget.height} className={`${cardHeightClass} border-[#f0d9ce] bg-[#fff4ee] sm:p-6`}><div className="flex min-w-0 items-start justify-between gap-4"><div className="min-w-0"><p className="text-sm font-bold text-[#2e2a28]">今日提醒</p><p className="mt-1 text-sm text-[#8d7f76]">今天有時間安排的事項。</p></div><span className="shrink-0 text-2xl font-bold text-[#b7655a]">{todayTodos.length}</span></div><div className="mt-5 space-y-3">{todayTodos.length > 0 ? todayTodos.slice(0, 3).map((todo) => <div key={todo.id} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl bg-[#fffdfa] px-4 py-3"><span className="min-w-0 truncate text-sm font-semibold text-[#4a413c]">{todo.title}</span><span className="shrink-0 text-xs font-semibold text-[#b7655a]">{formatTime(todo.startAt)}</span></div>) : <p className="rounded-2xl bg-[#fffdfa]/70 px-4 py-5 text-center text-sm text-[#9a8c83]">今天還沒有安排提醒。</p>}</div></DashboardCard></div>
    }

    if (widget.id === 'calendar') {
      return <div key={widget.id} className={wrapperClass}><DashboardCard fixedHeight={widget.height} className={`${cardHeightClass} sm:p-6`}><div className="flex min-w-0 items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm font-bold text-[#2e2a28]">月曆</p><p className="mt-1 truncate text-sm text-[#8d7f76]">{monthLabel}</p></div><span className="shrink-0 rounded-full bg-[#e5efe2] px-3 py-1 text-xs font-bold text-[#5f7f5a]">{completedToday} 完成</span></div><div className="mt-5 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[#a79b91]">{weekdays.map((weekday) => <span key={weekday} className="py-2">{weekday}</span>)}{calendarCells.map((day, index) => { if (!day) return <span key={`empty-${index}`} className="h-9" aria-hidden="true" />; const key = dateKey(new Date(now.getFullYear(), now.getMonth(), day)); const active = key === selectedDate; const marked = scheduledDays.has(key); return <button key={key} type="button" onClick={() => setSelectedDate(key)} className={`relative flex h-9 items-center justify-center rounded-xl text-sm transition ${active ? 'bg-[#e98a7a] font-bold text-white' : 'text-[#695e57] hover:bg-[#faf0e8]'}`}>{day}{marked && !active && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#d97568]" />}</button> })}</div><p className="mt-4 break-words rounded-2xl bg-[#faf3ed] px-4 py-3 text-sm text-[#776e68]">已選擇 {selectedDate}</p></DashboardCard></div>
    }

    return <div key={widget.id} className={wrapperClass}><DashboardCard fixedHeight={widget.height} className={`${cardHeightClass} sm:p-6`}><div className="flex min-w-0 items-center justify-between gap-3"><p className="min-w-0 text-sm font-bold text-[#2e2a28]">給自己的話</p><button type="button" onClick={() => editingText ? handleSaveCustomText() : setEditingText(true)} className="shrink-0 text-xs font-bold text-[#b7655a] hover:text-[#8f4d45]">{editingText ? '儲存' : '編輯'}</button></div>{editingText ? <textarea value={customText} onChange={(event) => setCustomText(event.target.value)} rows={4} className="mt-4 w-full resize-none rounded-2xl border border-[#e5d9cf] bg-[#fffdfa] p-4 text-sm leading-6 text-[#4a413c] outline-none focus:border-[#d97568] focus:ring-4 focus:ring-[#e98a7a]/15" /> : <p className="mt-4 break-words rounded-2xl bg-[#fff4e6] px-4 py-5 text-base font-semibold leading-7 text-[#725d4e]">{customText}</p>}</DashboardCard></div>
  }

  const handleToggleEditing = () => {
    setEditingLayout((current) => !current)
    setActiveWidgetId(null)
  }

  return (
    <div className="min-w-0 space-y-6" data-testid="dashboard-page">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><p className="text-sm font-semibold tracking-[0.14em] text-[#c96b61]">{formatLongDate(now)}</p><h1 className="mt-2 text-4xl font-bold tracking-tight text-[#2e2a28] sm:text-5xl">早安，{displayName}</h1><p className="mt-3 text-base leading-7 text-[#776e68]">今天想先照顧哪一件事？</p></div>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end"><div className="rounded-2xl bg-[#f8efe8] px-4 py-3 text-sm font-semibold text-[#776e68]"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#7b9b76]" />私人工作區已同步</div><button type="button" onClick={handleToggleEditing} className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${editingLayout ? 'border-[#d9a59a] bg-[#fff0eb] text-[#a85b4e]' : 'border-[#eaded4] bg-[#fffdfa] text-[#776e68] hover:border-[#d9a59a] hover:text-[#a85b4e]'}`}>{editingLayout ? '完成調整' : '調整首頁'}</button></div>
      </header>

      {editingLayout && <div className="flex flex-col gap-3 rounded-2xl border border-[#eaded4] bg-[#fffaf6] px-4 py-3 text-sm text-[#8d7f76] shadow-[0_8px_24px_rgba(112,82,62,0.06)] sm:flex-row sm:items-center sm:justify-between" data-testid="dashboard-layout-toolbar"><div className="flex min-w-0 items-center gap-3"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#e98a7a] shadow-[0_0_0_5px_rgba(233,138,122,0.12)]" /><div className="min-w-0"><p className="font-bold text-[#4a413c]">版面編輯中</p><p className="mt-0.5 truncate text-xs">拖曳組件本身排序，右下角拖曳調整寬度與高度。</p></div></div><div className="flex flex-wrap items-center gap-2">{hiddenWidgets.length > 0 && <span className="text-xs text-[#a79b91]">已隱藏：</span>}{hiddenWidgets.map((widget) => <button key={widget.id} type="button" onClick={() => updateWidget(widget.id, { visible: true })} className="rounded-xl border border-[#eaded4] bg-[#fffdfa] px-3 py-2 text-xs font-bold text-[#a85b4e] transition hover:border-[#d9a59a] hover:bg-[#fff0eb]">顯示{widget.label}</button>)}<button type="button" onClick={resetLayout} className="rounded-xl border border-[#eaded4] bg-[#fffdfa] px-3 py-2 text-xs font-bold text-[#a85b4e] transition hover:border-[#d9a59a] hover:bg-[#fff0eb]">重設</button></div></div>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
        <SortableContext items={visibleWidgets.map((widget) => widget.id)} strategy={rectSortingStrategy}>
          <div className="grid min-w-0 grid-cols-12 gap-6" data-testid="dashboard-widget-grid">{visibleWidgets.map((widget) => <SortableWidget key={widget.id} widget={widget} editing={editingLayout} onToggleVisibility={(id) => updateWidget(id, { visible: false })} onResizeStart={handleResizeStart}>{renderWidget(widget)}</SortableWidget>)}</div>
        </SortableContext>
        <DragOverlay adjustScale={false} dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>{activeWidget ? <WidgetDragPreview widget={activeWidget} /> : null}</DragOverlay>
      </DndContext>

      {!layout.some((widget) => widget.visible) && <div className="rounded-[2rem] border border-dashed border-[#d9a59a] bg-[#fffaf6] px-5 py-10 text-center"><p className="font-bold text-[#a85b4e]">首頁目前是空的</p><p className="mt-2 text-sm text-[#8d7f76]">開啟「調整首頁」，重新顯示你想使用的組件。</p></div>}
      <PersonalToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}
