'use client'

import { useMemo, useState, type ReactElement } from 'react'

type CalendarTodo = {
  id: string
  title: string
  description: string | null
  status: string
  startAt: string
  endAt: string
}

type PersonalCalendarPageProps = {
  todos: CalendarTodo[]
  checkInDates: string[]
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function dateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

function statusLabel(status: string): string {
  if (status === 'COMPLETED') return '已完成'
  if (status === 'IN_PROGRESS') return '進行中'
  if (status === 'FAILED') return '未完成'
  return '待開始'
}

export function PersonalCalendarPage({ todos, checkInDates }: PersonalCalendarPageProps): ReactElement {
  const today = new Date()
  const todayKey = dateKey(today)
  const [monthCursor, setMonthCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey)
  const monthLabel = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long' }).format(monthCursor)
  const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate()
  const firstDay = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1).getDay()
  const calendarCells = Array.from({ length: firstDay + daysInMonth }, (_, index) => index < firstDay ? null : index - firstDay + 1)
  const checkedDates = useMemo(() => new Set(checkInDates), [checkInDates])
  const todosByDate = useMemo(() => {
    const grouped: Record<string, CalendarTodo[]> = {}
    for (const todo of todos) {
      const key = dateKey(new Date(todo.startAt))
      grouped[key] = grouped[key] ? [...grouped[key], todo] : [todo]
    }
    return grouped
  }, [todos])
  const selectedTodos = todosByDate[selectedDateKey] ?? []
  const selectedDate = new Date(`${selectedDateKey}T12:00:00`)
  const selectedLabel = new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' }).format(selectedDate)

  const moveMonth = (offset: number): void => {
    const nextMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + offset, 1)
    setMonthCursor(nextMonth)
    setSelectedDateKey(dateKey(nextMonth))
  }

  return (
    <div className="space-y-6" data-testid="calendar-page">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.14em] text-[#c96b61]">把時間攤開來看</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-[#2e2a28] sm:text-5xl">月曆</h1>
          <p className="mt-3 text-base leading-7 text-[#776e68]">查看每日安排、待辦與替自己留下的小記號。</p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-[#eaded4] bg-[#fffdfa] p-1.5 shadow-[0_10px_26px_rgba(112,82,62,0.06)]">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="上一個月" className="rounded-xl px-3 py-2 text-lg text-[#8d7f76] transition hover:bg-[#faf0e8] hover:text-[#a85b4e]">‹</button>
          <button type="button" onClick={() => { setMonthCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDateKey(todayKey) }} className="rounded-xl px-3 py-2 text-xs font-bold text-[#a85b4e] transition hover:bg-[#fff1eb]">回到今天</button>
          <button type="button" onClick={() => moveMonth(1)} aria-label="下一個月" className="rounded-xl px-3 py-2 text-lg text-[#8d7f76] transition hover:bg-[#faf0e8] hover:text-[#a85b4e]">›</button>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)]">
        <section className="rounded-[2rem] border border-[#eaded4] bg-[#fffdfa] p-5 shadow-[0_16px_44px_rgba(112,82,62,0.08)] sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.14em] text-[#a79b91]">目前檢視</p>
              <h2 data-testid="calendar-title" className="mt-1 text-2xl font-bold text-[#2e2a28]">{monthLabel}</h2>
            </div>
            <div className="flex items-center gap-3 text-xs text-[#8d7f76]">
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#e98a7a]" />待辦</span>
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#91aa86]" />記號</span>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-7 gap-2 text-center text-xs font-bold text-[#a79b91] sm:gap-3">
            {WEEKDAYS.map((weekday) => <span key={weekday} className="py-2">{weekday}</span>)}
            {calendarCells.map((day, index) => {
              if (!day) return <span key={`empty-${index}`} className="min-h-20 rounded-2xl bg-[#fffaf6]/50 sm:min-h-24" aria-hidden />
              const currentDate = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), day)
              const key = dateKey(currentDate)
              const dayTodos = todosByDate[key] ?? []
              const isToday = key === todayKey
              const isSelected = key === selectedDateKey
              const isChecked = checkedDates.has(key)
              return (
                <button key={key} type="button" onClick={() => setSelectedDateKey(key)} className={`flex min-h-20 flex-col items-center rounded-2xl border p-2 text-sm transition sm:min-h-24 ${isSelected ? 'border-[#e98a7a] bg-[#fff0eb] text-[#a85b4e] shadow-[0_8px_20px_rgba(233,138,122,0.12)]' : 'border-transparent bg-[#fffaf6] text-[#4a413c] hover:border-[#eaded4] hover:bg-[#fff4ee]'}`} aria-label={`${monthLabel}${day}日${dayTodos.length > 0 ? `，${dayTodos.length} 件待辦` : ''}`}>
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full font-bold ${isToday ? 'bg-[#e98a7a] text-white' : ''}`}>{day}</span>
                  <span className="mt-auto flex h-4 items-center gap-1">
                    {dayTodos.slice(0, 3).map((todo) => <i key={todo.id} className={`h-1.5 w-1.5 rounded-full ${todo.status === 'COMPLETED' ? 'bg-[#a79b91]' : 'bg-[#e98a7a]'}`} aria-hidden />)}
                    {isChecked && <i className="h-2 w-2 rounded-full bg-[#91aa86]" aria-label="有完成記號" />}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <aside className="rounded-[2rem] border border-[#eaded4] bg-[#fffdfa] p-5 shadow-[0_16px_44px_rgba(112,82,62,0.08)] sm:p-7">
          <p className="text-sm font-semibold tracking-[0.12em] text-[#c96b61]">選取日期</p>
          <h2 className="mt-2 text-2xl font-bold text-[#2e2a28]">{selectedLabel}</h2>
          <p className="mt-2 text-sm leading-6 text-[#8d7f76]">{selectedTodos.length > 0 ? `這天有 ${selectedTodos.length} 件安排。` : '這天還沒有安排，可以保留一點空白。'}</p>
          <div className="mt-6 space-y-3">
            {selectedTodos.map((todo) => <article key={todo.id} className="rounded-2xl border border-[#eaded4] bg-[#fffaf6] p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-[#4a413c]">{todo.title}</h3><p className="mt-1 text-xs text-[#a79b91]">{formatTime(todo.startAt)} – {formatTime(todo.endAt)}</p></div><span className="rounded-full bg-[#f6e5d9] px-2.5 py-1 text-[11px] font-bold text-[#a85b4e]">{statusLabel(todo.status)}</span></div>{todo.description && <p className="mt-3 text-sm leading-6 text-[#776e68]">{todo.description}</p>}</article>)}
            {selectedTodos.length === 0 && <div className="rounded-2xl bg-[#f3f7f0] px-4 py-8 text-center"><p className="font-bold text-[#5f7f5a]">這天沒有待辦</p><p className="mt-2 text-sm leading-6 text-[#7d9477]">從首頁或待辦事項頁新增安排，就會顯示在這裡。</p></div>}
          </div>
          <div className="mt-6 border-t border-[#eaded4] pt-5"><p className="text-xs font-semibold tracking-[0.12em] text-[#a79b91]">本月摘要</p><div className="mt-3 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-[#fff4ee] p-4"><p className="text-2xl font-bold text-[#a85b4e]">{todos.length}</p><p className="mt-1 text-xs text-[#8d7f76]">全部待辦</p></div><div className="rounded-2xl bg-[#f3f7f0] p-4"><p className="text-2xl font-bold text-[#5f7f5a]">{checkInDates.length}</p><p className="mt-1 text-xs text-[#7d9477]">完成記號</p></div></div></div>
        </aside>
      </div>
    </div>
  )
}
