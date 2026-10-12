'use client'

import { useMemo, useState, type ReactElement } from 'react'
import { CalendarEntryEditor, type CalendarDraft, type CalendarTodo } from '@/components/calendar/CalendarEntryEditor'
import { PersonalToast, type PersonalToastState } from '@/components/ui/PersonalToast'
import { PersonalConfirmDialog } from '@/components/ui/PersonalConfirmDialog'
import { PersonalSelect } from '@/components/ui/PersonalSelect'
import type { CalendarNote } from '@/types/calendar'

type Props = { todos: CalendarTodo[]; notes: CalendarNote[]; checkInDates: string[]; initialNoteId?: string }
type View = 'month' | 'week' | 'day'
type CalendarItem = { key: string; title: string; content: string; date: string | null; startAt: string | null; endAt: string | null; completed: boolean; draft: CalendarDraft }
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function parseDay(value: string): Date { return new Date(`${value}T12:00:00`) }
function shiftDay(value: string, offset: number): string {
  const date = parseDay(value)
  date.setDate(date.getDate() + offset)
  return dateKey(date)
}
function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}
function onDate(item: CalendarItem, key: string): boolean {
  if (!item.startAt || !item.endAt) return item.date === key
  const start = new Date(`${key}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return new Date(item.startAt) < end && new Date(item.endAt) > start
}
function itemTime(item: CalendarItem): string {
  if (!item.date) return '未排程'
  if (!item.startAt || !item.endAt) return '整日'
  const crossesDay = dateKey(new Date(item.startAt)) !== dateKey(new Date(item.endAt))
  return `${formatTime(item.startAt)}–${crossesDay ? `${dateKey(new Date(item.endAt))} ` : ''}${formatTime(item.endAt)}`
}
function EventChip({ item, onOpen }: { item: CalendarItem; onOpen: (draft: CalendarDraft) => void }): ReactElement {
  return <button type="button" onClick={() => onOpen(item.draft)} title={`${item.title} · ${itemTime(item)}`} className={`block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] font-semibold ${item.completed ? 'bg-[#eee7e0] text-[#8d7f76]' : 'bg-[#f6e5d9] text-[#a85b4e] hover:bg-[#efd5c7]'}`}><span className="mr-1 font-normal">{item.startAt ? formatTime(item.startAt) : '整日'}</span>{item.title}</button>
}

export function PersonalCalendarPage({ todos: initialTodos, notes: initialNotes, checkInDates, initialNoteId }: Props): ReactElement {
  const initialNote = initialNotes.find((note) => note.id === initialNoteId)
  const todayKey = dateKey(new Date())
  const [todos, setTodos] = useState(initialTodos)
  const [notes, setNotes] = useState(initialNotes)
  const [selectedDateKey, setSelectedDateKey] = useState(initialNote?.noteDate ?? todayKey)
  const [view, setView] = useState<View>('month')
  const [unplanned, setUnplanned] = useState(false)
  const [draft, setDraft] = useState<CalendarDraft | null>(initialNote ? { kind: 'note', date: initialNote.noteDate ?? todayKey, note: initialNote } : null)
  const [editorVersion, setEditorVersion] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<PersonalToastState | null>(null)
  const checkedDates = useMemo(() => new Set(checkInDates), [checkInDates])
  const selectedDate = parseDay(selectedDateKey)
  const monthLabel = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long' }).format(selectedDate)
  const selectedLabel = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(selectedDate)
  const yearOptions = Array.from({ length: 201 }, (_, index) => Math.max(100, Math.min(9799, selectedDate.getFullYear() - 100)) + index)
  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate()
  const firstDay = monthStart.getDay()
  const cellCount = Math.ceil((firstDay + daysInMonth) / 7) * 7
  const monthDays = Array.from({ length: cellCount }, (_, index) => index >= firstDay && index < firstDay + daysInMonth ? dateKey(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), index - firstDay + 1)) : null)
  const weekStart = shiftDay(selectedDateKey, -selectedDate.getDay())
  const visibleDays = view === 'day' ? [selectedDateKey] : Array.from({ length: 7 }, (_, index) => shiftDay(weekStart, index))
  const items = useMemo<CalendarItem[]>(() => [
    ...notes.map((note): CalendarItem => ({ key: `note:${note.id}`, title: note.title, content: note.content.replace(/<[^>]*>/g, ' '), date: note.noteDate ?? null, startAt: note.startAt ?? null, endAt: note.endAt ?? null, completed: false, draft: { kind: 'note', date: note.noteDate ?? todayKey, note } })),
    ...todos.map((todo): CalendarItem => ({ key: `todo:${todo.id}`, title: todo.title, content: todo.description ?? '', date: dateKey(new Date(todo.startAt)), startAt: todo.startAt, endAt: todo.endAt, completed: todo.status === 'COMPLETED', draft: { kind: 'todo', date: dateKey(new Date(todo.startAt)), todo } })),
  ].sort((a, b) => (a.startAt ?? '').localeCompare(b.startAt ?? '')), [notes, todos, todayKey])
  const query = search.trim().toLowerCase()
  const matches = (item: CalendarItem): boolean => !query || `${item.title} ${item.content}`.toLowerCase().includes(query)
  const dayItems = (key: string): CalendarItem[] => items.filter((item) => onDate(item, key) && matches(item))
  const unplannedCount = items.filter((item) => !item.date).length
  const selectedItems = query ? items.filter(matches) : unplanned ? items.filter((item) => !item.date) : dayItems(selectedDateKey)

  const afterDiscard = (action: () => void): void => {
    const proceed = (): void => { setDraft(null); setDirty(false); action() }
    if (dirty) setPendingAction(() => proceed)
    else proceed()
  }
  const openDraft = (next: CalendarDraft): void => {
    afterDiscard(() => {
      setDraft(next)
      setEditorVersion((version) => version + 1)
    })
  }
  const selectDate = (key: string): void => {
    afterDiscard(() => {
      setSelectedDateKey(key)
      setUnplanned(false)
      setSearch('')
    })
  }
  const move = (offset: number): void => {
    afterDiscard(() => {
    if (view === 'month') {
      setSelectedDateKey(dateKey(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + offset, 1)))
    } else { setSelectedDateKey(shiftDay(selectedDateKey, offset * (view === 'week' ? 7 : 1))) }
    setUnplanned(false)
    setSearch('')
    })
  }
  const selectPeriod = (year: number, month: number): void => {
    const lastDay = new Date(year, month + 1, 0).getDate()
    selectDate(dateKey(new Date(year, month, Math.min(selectedDate.getDate(), lastDay))))
  }
  const noteSaved = (note: CalendarNote): void => {
    setNotes((current) => [note, ...current.filter((item) => item.id !== note.id)])
    if (note.noteDate) setSelectedDateKey(note.noteDate)
    setUnplanned(!note.noteDate)
    setDraft(null)
    setDirty(false)
    setSearch('')
    setToast({ tone: 'success', message: '行程已儲存' })
  }
  const todoSaved = (todo: CalendarTodo): void => {
    setTodos((current) => [...current.filter((item) => item.id !== todo.id), todo])
    setSelectedDateKey(dateKey(new Date(todo.startAt)))
    setUnplanned(false)
    setDraft(null)
    setDirty(false)
    setSearch('')
    setToast({ tone: 'success', message: '行程已儲存' })
  }
  const deleted = (kind: CalendarDraft['kind'], id: string): void => {
    if (kind === 'note') setNotes((current) => current.filter((item) => item.id !== id))
    else setTodos((current) => current.filter((item) => item.id !== id))
    setDraft(null)
    setDirty(false)
    setToast({ tone: 'success', message: '行程已刪除' })
  }

  return (
    <div className="space-y-5" data-testid="calendar-page">
      <header className="space-y-5 pb-2">
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.4rem] border border-[#efd2c5] bg-gradient-to-br from-[#fff4eb] to-[#f6dfd4] text-[#b7655a] shadow-[0_8px_20px_rgba(112,82,62,0.06)]">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="3" /><path d="M7.5 3v4M16.5 3v4M3.5 10h17M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" /></svg>
          </span>
          <div><p className="text-xs font-semibold tracking-[0.16em] text-[#b7655a]">把生活記在時間裡</p><h1 className="mt-2 text-4xl font-bold tracking-[0.12em] text-[#3f3530] sm:text-5xl">行事曆</h1><div aria-hidden="true" className="mt-3 h-1 w-10 rounded-full bg-[#dfa08e]" /></div>
        </div>
        <button type="button" onClick={() => openDraft({ kind: 'note', date: selectedDateKey })} className="rounded-2xl bg-[#e98a7a] px-5 py-3 text-sm font-bold text-white shadow-[0_6px_16px_rgba(233,138,122,0.16)] transition hover:bg-[#d97568]">＋新增行程</button>
      </header>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div data-testid="calendar-toolbar" className="flex min-w-0 flex-wrap items-center justify-between gap-3 xl:col-start-1">
        <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => move(-1)} aria-label="上一頁日期" className="rounded-xl bg-[#fffdfa] px-3 py-2 text-lg text-[#8d7f76]">‹</button><button type="button" onClick={() => selectDate(todayKey)} className="rounded-xl bg-[#fffdfa] px-3 py-2 text-sm font-semibold text-[#a85b4e]">今天</button><button type="button" onClick={() => move(1)} aria-label="下一頁日期" className="rounded-xl bg-[#fffdfa] px-3 py-2 text-lg text-[#8d7f76]">›</button>
          <h2 data-testid="calendar-title" className="sr-only">{monthLabel}</h2>
          <PersonalSelect ariaLabel="選擇年份" size="compact" className="w-28" value={String(selectedDate.getFullYear())} onChange={(value) => selectPeriod(Number(value), selectedDate.getMonth())} options={yearOptions.map((year) => ({ value: String(year), label: `${year}年` }))} />
          <PersonalSelect ariaLabel="選擇月份" size="compact" className="w-24" value={String(selectedDate.getMonth())} onChange={(value) => selectPeriod(selectedDate.getFullYear(), Number(value))} options={Array.from({ length: 12 }, (_, month) => ({ value: String(month), label: `${month + 1}月` }))} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-[#eaded4] bg-[#fffdfa] p-1" aria-label="行事曆檢視">{([{ value: 'month', label: '月' }, { value: 'week', label: '週' }, { value: 'day', label: '日' }] as const).map((option) => <button key={option.value} type="button" aria-pressed={view === option.value} onClick={() => setView(option.value)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${view === option.value ? 'bg-[#f6e5d9] text-[#a85b4e]' : 'text-[#8d7f76]'}`}>{option.label}</button>)}</div>
          <label><span className="sr-only">搜尋行程與內容</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋行程與內容" className="h-10 w-44 rounded-xl border border-[#e5d9cf] bg-[#fffdfa] px-3 text-sm outline-none focus:border-[#d97568] sm:w-52" /></label>
        </div>
      </div>
        <section data-testid="calendar-grid" className="min-w-0 overflow-hidden rounded-3xl border border-[#eaded4] bg-[#fffdfa] shadow-[0_16px_44px_rgba(112,82,62,0.06)] xl:col-start-1">
          {view === 'month' ? <>
            <div className="grid grid-cols-7 border-b border-[#eaded4] bg-[#fffaf6]">{WEEKDAYS.map((day) => <span key={day} className="py-3 text-center text-xs font-semibold text-[#8d7f76]">{day}</span>)}</div>
            <div className="grid grid-cols-7">{monthDays.map((key, index) => {
              if (!key) return <div key={`empty:${index}`} className="min-h-24 border-b border-r border-[#f0e5dc] bg-[#fffaf6]/50 sm:min-h-36" />
              const entries = dayItems(key)
              return <div key={key} onDoubleClick={() => openDraft({ kind: 'note', date: key })} className={`min-h-24 min-w-0 border-b border-r border-[#f0e5dc] p-1 sm:min-h-36 sm:p-2 ${key === selectedDateKey ? 'bg-[#fff0eb]' : ''}`}>
                <button type="button" onClick={() => selectDate(key)} aria-pressed={key === selectedDateKey} aria-label={`${key}，${entries.length} 個行程${checkedDates.has(key) ? '，有完成記號' : ''}`} className={`relative mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${key === todayKey ? 'bg-[#e98a7a] text-white' : 'text-[#4a413c] hover:bg-[#f6e5d9]'}`}>{parseDay(key).getDate()}{checkedDates.has(key) && <span aria-hidden className="absolute -right-1 top-0 h-1.5 w-1.5 rounded-full bg-[#91aa86]" />}</button>
                <div className="space-y-1">{entries.slice(0, 3).map((item) => <EventChip key={item.key} item={item} onOpen={openDraft} />)}{entries.length > 3 && <button type="button" onClick={() => selectDate(key)} className="text-[10px] font-semibold text-[#8d7f76]">＋{entries.length - 3} 個</button>}</div>
              </div>
            })}</div>
          </> : <div className="overflow-x-auto"><div className={view === 'week' ? 'min-w-[700px]' : ''}>
            <div className="grid border-b border-[#eaded4] bg-[#fffaf6]" style={{ gridTemplateColumns: `48px repeat(${visibleDays.length}, minmax(0, 1fr))` }}><span />{visibleDays.map((key) => <button key={key} type="button" onClick={() => selectDate(key)} className={`py-3 text-center text-xs font-semibold ${key === selectedDateKey ? 'text-[#a85b4e]' : 'text-[#8d7f76]'}`}>{WEEKDAYS[parseDay(key).getDay()]} {parseDay(key).getMonth() + 1}/{parseDay(key).getDate()}</button>)}</div>
            <div className="grid border-b border-[#eaded4]" style={{ gridTemplateColumns: `48px repeat(${visibleDays.length}, minmax(0, 1fr))` }}><span className="p-2 text-[10px] text-[#8d7f76]">整日</span>{visibleDays.map((key) => <div key={key} className="space-y-1 border-l border-[#f0e5dc] p-1">{dayItems(key).filter((item) => !item.startAt).map((item) => <EventChip key={item.key} item={item} onOpen={openDraft} />)}</div>)}</div>
            <div className="max-h-[600px] overflow-y-auto">{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="grid min-h-14 border-b border-[#f0e5dc]" style={{ gridTemplateColumns: `48px repeat(${visibleDays.length}, minmax(0, 1fr))` }}><span className="px-1 py-2 text-right text-[10px] text-[#a79b91]">{String(hour).padStart(2, '0')}:00</span>{visibleDays.map((key) => <div key={key} className="space-y-1 border-l border-[#f0e5dc] p-1" onDoubleClick={() => openDraft({ kind: 'note', date: key })}>{dayItems(key).filter((item) => item.startAt && (dateKey(new Date(item.startAt)) === key ? new Date(item.startAt).getHours() === hour : hour === 0)).map((item) => <EventChip key={item.key} item={item} onOpen={openDraft} />)}<button type="button" aria-label={`${key} ${hour}:00 新增行程`} onClick={() => openDraft({ kind: 'note', date: key, hour })} className="block h-5 w-full rounded text-xs text-transparent hover:bg-[#fff0eb] hover:text-[#a85b4e] focus:bg-[#fff0eb] focus:text-[#a85b4e]">＋</button></div>)}</div>)}</div>
          </div></div>}
          <p className="border-t border-[#eaded4] px-4 py-3 text-xs text-[#8d7f76]">點日期查看行程，點行程編輯內容；按兩下日期可新增。</p>
        </section>
        <aside className="rounded-3xl border border-[#eaded4] bg-[#fffdfa] p-5 xl:col-start-2 xl:row-start-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-bold text-[#4a413c]">{query ? '搜尋結果' : unplanned ? '未排程' : selectedLabel}</h2><button type="button" aria-pressed={unplanned} onClick={() => { setUnplanned((value) => !value); setSearch('') }} className="shrink-0 rounded-lg bg-[#faf3ed] px-2 py-1.5 text-[11px] font-semibold text-[#8d7f76]">{unplanned ? '返回日期' : `未排程 ${unplannedCount}`}</button></div>
          <div className="mt-4 space-y-2">{selectedItems.map((item) => <button key={item.key} type="button" onClick={() => openDraft(item.draft)} className="block w-full rounded-2xl border border-[#f0e5dc] bg-[#fffaf6] p-3 text-left hover:border-[#d9a59a]"><p className="text-xs font-semibold text-[#a85b4e]">{query && item.date ? `${item.date} · ` : ''}{itemTime(item)}</p><h3 className="mt-1 break-words text-sm font-bold text-[#4a413c]">{item.title}</h3><p className="mt-1 line-clamp-2 text-xs leading-5 text-[#8d7f76]">{item.content.trim() || '點擊加入筆記與詳細內容'}</p></button>)}{selectedItems.length === 0 && <p className="py-6 text-sm leading-6 text-[#8d7f76]">{query ? '找不到符合的行程。' : unplanned ? '目前沒有未排程內容。' : '這天還沒有行程，留一點空白也很好。'}</p>}</div>
        </aside>
      </div>
      {draft && <CalendarEntryEditor key={editorVersion} draft={draft} onDirty={() => setDirty(true)} onCancel={() => afterDiscard(() => {})} onNoteSaved={noteSaved} onTodoSaved={todoSaved} onDeleted={deleted} />}
      <PersonalConfirmDialog open={Boolean(pendingAction)} title="放棄尚未儲存的修改？" description="關閉後，這次尚未儲存的內容會遺失。" confirmLabel="放棄修改" onCancel={() => setPendingAction(null)} onConfirm={() => { pendingAction?.(); setPendingAction(null) }} />
      <PersonalToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}
