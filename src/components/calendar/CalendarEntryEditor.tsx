'use client'

import dynamic from 'next/dynamic'
import { useState, type FormEvent, type ReactElement } from 'react'
import { PersonalModal } from '@/components/ui/PersonalModal'
import { PersonalConfirmDialog } from '@/components/ui/PersonalConfirmDialog'
import { PersonalTagPicker } from '@/components/ui/PersonalTagPicker'
import type { CalendarNote } from '@/types/calendar'

const PersonalRichTextEditor = dynamic(() => import('@/components/ui/PersonalRichTextEditor').then((module) => module.PersonalRichTextEditor), { ssr: false })

export type CalendarTodo = {
  id: string
  title: string
  description: string | null
  status: string
  startAt: string
  endAt: string
}

export type CalendarDraft =
  | { kind: 'note'; date: string; note?: CalendarNote; hour?: number }
  | { kind: 'todo'; date: string; todo?: CalendarTodo }

type Props = {
  draft: CalendarDraft
  onNoteSaved: (note: CalendarNote) => void
  onTodoSaved: (todo: CalendarTodo) => void
  onCancel: () => void
  onDirty: () => void
  onDeleted: (kind: CalendarDraft['kind'], id: string) => void
}

function localDateTime(value: string): string {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function CalendarEntryEditor({ draft, onNoteSaved, onTodoSaved, onCancel, onDirty, onDeleted }: Props): ReactElement {
  const note = draft.kind === 'note' ? draft.note : undefined
  const todo = draft.kind === 'todo' ? draft.todo : undefined
  const [title, setTitle] = useState(note?.title ?? todo?.title ?? '')
  const [content, setContent] = useState(note?.content ?? todo?.description ?? '')
  const [noteDate, setNoteDate] = useState(note ? note.noteDate ?? '' : draft.date)
  const [allDay, setAllDay] = useState(Boolean(note && !note.startAt))
  const [tagIds, setTagIds] = useState(note?.tagIds ?? [])
  const defaultHour = String(draft.kind === 'note' ? draft.hour ?? 9 : 9).padStart(2, '0')
  const [startAt, setStartAt] = useState(todo ? localDateTime(todo.startAt) : note?.startAt ? localDateTime(note.startAt) : `${note?.noteDate ?? draft.date}T${defaultHour}:00`)
  const [endAt, setEndAt] = useState(todo ? localDateTime(todo.endAt) : note?.endAt ? localDateTime(note.endAt) : `${note?.noteDate ?? draft.date}T${defaultHour}:30`)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const editing = Boolean(note || todo)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const inputClass = 'mt-2 w-full min-w-0 rounded-xl border border-[#e5d9cf] bg-[#fffdfa] px-3 py-3 text-sm text-[#4a413c] outline-none focus:border-[#d97568] focus:ring-4 focus:ring-[#e98a7a]/15'

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!title.trim()) { setError('請輸入標題'); return }
    const start = new Date(startAt)
    const end = new Date(endAt)
    if (!allDay && (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start)) {
      setError('結束時間必須晚於開始時間')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (draft.kind === 'note') {
        const response = await fetch(note ? `/api/notes/${note.id}` : '/api/notes', {
          method: note ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim(), content, tagIds, noteDate: allDay ? noteDate || null : startAt.slice(0, 10), startAt: allDay ? null : start.toISOString(), endAt: allDay ? null : end.toISOString() }),
        })
        if (!response.ok) throw new Error(await response.text())
        const result = await response.json() as { note: CalendarNote }
        onNoteSaved(result.note)
      } else {
        const response = await fetch(todo ? `/api/todos/${todo.id}` : '/api/todos', {
          method: todo ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim(), description: content, startAt: start.toISOString(), endAt: end.toISOString() }),
        })
        if (!response.ok) throw new Error(await response.text())
        const result = await response.json() as { todo: CalendarTodo }
        onTodoSaved(result.todo)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '儲存失敗，請再試一次')
    } finally {
      setSaving(false)
    }
  }

  const deleteEntry = async (): Promise<void> => {
    const id = note?.id ?? todo?.id
    if (!id) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/${draft.kind === 'note' ? 'notes' : 'todos'}/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(await response.text())
      onDeleted(draft.kind, id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '刪除失敗')
    } finally { setSaving(false) }
  }

  return (
    <PersonalModal open title={editing ? '編輯行程' : '新增行程'} onClose={onCancel} busy={saving}>
      <form onSubmit={save} onChange={onDirty} className="mt-4">
        <fieldset disabled={saving} className="min-w-0 space-y-4 disabled:opacity-60">
          <label className="block text-sm font-semibold text-[#695e57]">標題<input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} /></label>
          {draft.kind === 'note' && <div><p className="text-sm font-semibold text-[#695e57]">標籤</p><PersonalTagPicker value={tagIds} onChange={(value) => { setTagIds(value); onDirty() }} /></div>}
          {draft.kind === 'note' && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={allDay} onChange={(event) => {
            const checked = event.target.checked
            setAllDay(checked)
            if (checked) setNoteDate(startAt.slice(0, 10))
            else if (noteDate) {
              const nextStart = `${noteDate}T${startAt.slice(11)}`
              const duration = new Date(endAt).getTime() - new Date(startAt).getTime()
              setStartAt(nextStart)
              if (Number.isFinite(duration) && duration > 0) setEndAt(localDateTime(new Date(new Date(nextStart).getTime() + duration).toISOString()))
            }
          }} />整日</label>}
          {allDay ? <label className="block text-sm font-semibold text-[#695e57]">日期<input type="date" value={noteDate} onChange={(event) => setNoteDate(event.target.value)} className={inputClass} /><span className="mt-1 block text-xs font-normal text-[#8d7f76]">留白會放到行事曆的「未排程」。</span></label> : <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-[#695e57]">開始時間<input required type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} className={inputClass} /></label>
            <label className="block text-sm font-semibold text-[#695e57]">結束時間<input required type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} className={inputClass} /></label>
          </div>}
          <div><p className="mb-2 text-sm font-semibold text-[#695e57]">筆記與詳細內容</p>{draft.kind === 'note' ? <PersonalRichTextEditor content={content} onChange={(value) => { setContent(value); onDirty() }} /> : <textarea rows={5} value={content} onChange={(event) => setContent(event.target.value)} className={inputClass} />}</div>
          {error && <p role="alert" className="text-sm text-[#a85b4e]">{error}</p>}
          <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-[#eaded4] bg-[#fffdfa] py-3">
            {editing && <button type="button" onClick={() => setConfirmDelete(true)} className="mr-auto text-sm font-semibold text-[#a85b4e]">刪除行程</button>}
            <button type="button" onClick={onCancel} className="rounded-xl px-3 py-2 text-sm font-semibold text-[#8d7f76]">取消</button>
            <button type="submit" className="rounded-xl bg-[#e98a7a] px-4 py-2 text-sm font-bold text-white hover:bg-[#d97568]">{saving ? '儲存中⋯' : '儲存'}</button>
          </div>
        </fieldset>
      </form>
      <PersonalConfirmDialog open={confirmDelete} title="刪除行程？" description="這個行程及其筆記內容會永久刪除，無法復原。" busy={saving} onCancel={() => setConfirmDelete(false)} onConfirm={() => void deleteEntry()} />
    </PersonalModal>
  )
}
