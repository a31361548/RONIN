'use client'

import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from 'react'
import { PersonalConfirmDialog } from '@/components/ui/PersonalConfirmDialog'
import { PersonalRichTextEditor } from '@/components/ui/PersonalRichTextEditor'
import { PersonalTagPicker } from '@/components/ui/PersonalTagPicker'
import { PersonalToast, type PersonalToastState } from '@/components/ui/PersonalToast'
import type { PersonalTag } from '@/types/tag'

export type PersonalNote = { id: string; title: string; content: string; tagIds: string[]; updatedAt: string }
type PersonalNotesProps = { initialNotes: PersonalNote[] }

function noteDate(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric' }).format(new Date(value))
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ')
}

function NoteTagChips({ tagIds, tags }: { tagIds: string[]; tags: PersonalTag[] }): ReactElement | null {
  const selected = tagIds.map((id) => tags.find((tag) => tag.id === id)).filter((tag): tag is PersonalTag => Boolean(tag))
  if (selected.length === 0) return null
  return <div className="mt-2 flex flex-wrap gap-1.5">{selected.map((tag) => <span key={tag.id} className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: `${tag.color}22`, color: tag.color }}>{tag.name}</span>)}</div>
}

export function PersonalNotesPage({ initialNotes }: PersonalNotesProps): ReactElement {
  const [notes, setNotes] = useState(initialNotes)
  const [tags, setTags] = useState<PersonalTag[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(initialNotes[0]?.id ?? null)
  const [title, setTitle] = useState(initialNotes[0]?.title ?? '')
  const [content, setContent] = useState(initialNotes[0]?.content ?? '')
  const [tagIds, setTagIds] = useState<string[]>(initialNotes[0]?.tagIds ?? [])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<PersonalToastState | null>(null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

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

  const loadNotes = async (preferredId?: string | null) => {
    const response = await fetch('/api/notes')
    if (!response.ok) throw new Error('無法取得筆記')
    const data = (await response.json()) as { notes: PersonalNote[] }
    setNotes(data.notes)
    const nextId = preferredId ?? data.notes[0]?.id ?? null
    setSelectedNoteId(nextId)
    const nextNote = data.notes.find((note) => note.id === nextId)
    setTitle(nextNote?.title ?? '')
    setContent(nextNote?.content ?? '')
    setTagIds(nextNote?.tagIds ?? [])
  }

  const openNote = (note: PersonalNote) => {
    setSelectedNoteId(note.id)
    setTitle(note.title)
    setContent(note.content)
    setTagIds(note.tagIds)
    setToast(null)
  }

  const openNewNote = () => {
    setSelectedNoteId(null)
    setTitle('')
    setContent('')
    setTagIds([])
    setToast(null)
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim()) {
      setToast({ tone: 'error', message: '請先輸入筆記標題' })
      return
    }
    setSaving(true)
    setToast(null)
    try {
      const endpoint = selectedNoteId ? `/api/notes/${selectedNoteId}` : '/api/notes'
      const response = await fetch(endpoint, { method: selectedNoteId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), content, tagIds }) })
      if (!response.ok) throw new Error(await response.text())
      const created = selectedNoteId ? null : (await response.json()) as { id: string }
      await loadNotes(created?.id ?? selectedNoteId)
      setToast({ tone: 'success', message: selectedNoteId ? '筆記已更新' : '筆記已建立' })
    } catch (error) {
      setToast({ tone: 'error', message: error instanceof Error ? error.message : '儲存失敗' })
    } finally {
      setSaving(false)
    }
  }

  const requestDelete = () => {
    if (!selectedNoteId) return
    setConfirmDeleteOpen(true)
  }

  const handleDelete = async () => {
    if (!selectedNoteId) return
    setLoading(true)
    try {
      const response = await fetch(`/api/notes/${selectedNoteId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('刪除失敗')
      const remaining = notes.filter((note) => note.id !== selectedNoteId)
      const nextNote = remaining[0]
      setNotes(remaining)
      setSelectedNoteId(nextNote?.id ?? null)
      setTitle(nextNote?.title ?? '')
      setContent(nextNote?.content ?? '')
      setTagIds(nextNote?.tagIds ?? [])
      setToast({ tone: 'success', message: '筆記已刪除' })
    } catch (error) {
      setToast({ tone: 'error', message: error instanceof Error ? error.message : '刪除失敗' })
    } finally {
      setLoading(false)
      setConfirmDeleteOpen(false)
    }
  }

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return notes
    return notes.filter((note) => `${note.title} ${stripHtml(note.content)}`.toLowerCase().includes(query))
  }, [notes, search])

  return (
    <div className="space-y-6" data-testid="notes-page">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[#c96b61]">把想法留在一個找得到的地方</p><h1 className="mt-2 text-4xl font-bold tracking-tight text-[#2e2a28] sm:text-5xl">筆記</h1><p className="mt-3 text-base leading-7 text-[#776e68]">不必寫得完整，先把現在想到的留下來。</p></div><button type="button" onClick={openNewNote} className="self-start rounded-2xl bg-[#e98a7a] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#d97568] sm:self-auto">新增筆記</button></header>
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]"><aside className="rounded-[2rem] border border-[#eaded4] bg-[#fffdfa] p-4 shadow-[0_16px_44px_rgba(112,82,62,0.08)]"><div className="flex items-center justify-between px-2 pb-3"><p className="text-sm font-bold text-[#2e2a28]">最近筆記</p><span className="text-xs font-semibold text-[#a79b91]">{filteredNotes.length}/{notes.length} 篇</span></div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋標題或內容" className="mb-3 h-10 w-full rounded-xl border border-[#e5d9cf] bg-[#fffaf6] px-3 text-xs text-[#4a413c] outline-none focus:border-[#d97568] focus:ring-4 focus:ring-[#e98a7a]/15"/><div className="space-y-2">{filteredNotes.length > 0 ? filteredNotes.map((note) => <button key={note.id} type="button" onClick={() => openNote(note)} className={`w-full rounded-2xl px-3 py-3 text-left transition ${selectedNoteId === note.id ? 'bg-[#f6e5d9]' : 'hover:bg-[#faf3ed]'}`}><p className={`truncate text-sm font-bold ${selectedNoteId === note.id ? 'text-[#a85b4e]' : 'text-[#4a413c]'}`}>{note.title}</p><p className="mt-1 text-xs text-[#a79b91]">{noteDate(note.updatedAt)}</p><NoteTagChips tagIds={note.tagIds} tags={tags}/></button>) : <p className="rounded-2xl bg-[#faf3ed] px-4 py-6 text-center text-sm text-[#9a8c83]">{search ? '找不到符合的筆記' : '還沒有筆記'}</p>}</div></aside>
        <section className="rounded-[2rem] border border-[#eaded4] bg-[#fffdfa] p-5 shadow-[0_16px_44px_rgba(112,82,62,0.08)] sm:p-7"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-bold text-[#2e2a28]">{selectedNoteId ? '編輯筆記' : '新增筆記'}</p><p className="mt-1 text-sm text-[#8d7f76]">內容會儲存在你的私人工作區。</p></div>{selectedNoteId && <button type="button" onClick={requestDelete} disabled={loading} className="text-sm font-bold text-[#a85b4e] hover:text-[#7d3e37] disabled:opacity-50">刪除</button>}</div><form onSubmit={handleSave} className="mt-6 space-y-4"><label className="block text-sm font-semibold text-[#695e57]">標題<input data-testid="note-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="今天想記住什麼？" className="mt-2 h-14 w-full rounded-2xl border border-[#e5d9cf] bg-[#fffdfa] px-4 text-xl font-bold text-[#2e2a28] outline-none placeholder:text-[#c5b8ae] focus:border-[#d97568] focus:ring-4 focus:ring-[#e98a7a]/15" /></label><div><p className="text-sm font-semibold text-[#695e57]">內容</p><div className="mt-2"><PersonalRichTextEditor content={content} onChange={setContent}/></div></div><div><p className="text-sm font-semibold text-[#695e57]">標籤</p><PersonalTagPicker value={tagIds} onChange={setTagIds}/></div><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[#a79b91]">支援標題、粗體、清單、引用與復原。</p><button type="submit" disabled={saving} className="rounded-2xl bg-[#e98a7a] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#d97568] disabled:cursor-wait disabled:opacity-60">{saving ? '儲存中⋯' : '儲存筆記'}</button></div></form></section></div>
      <PersonalToast toast={toast} onDismiss={() => setToast(null)} />
      <PersonalConfirmDialog open={confirmDeleteOpen} title="刪除這篇筆記？" description="刪除後筆記內容與標籤都會永久移除，這個動作無法復原。" busy={loading} onCancel={() => setConfirmDeleteOpen(false)} onConfirm={() => void handleDelete()} />
    </div>
  )
}
