'use client'

import Link from 'next/link'
import { useState, type FormEvent, type ReactElement } from 'react'
import { PersonalRichTextEditor } from '@/components/ui/PersonalRichTextEditor'
import { PersonalTagPicker } from '@/components/ui/PersonalTagPicker'
import { PersonalToast, type PersonalToastState } from '@/components/ui/PersonalToast'

type PersonalNoteDetail = { id: string; title: string; content: string; tagIds: string[] }

export function PersonalNoteDetailPage({ initialNote }: { initialNote: PersonalNoteDetail }): ReactElement {
  const [title, setTitle] = useState(initialNote.title)
  const [content, setContent] = useState(initialNote.content)
  const [tagIds, setTagIds] = useState(initialNote.tagIds)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<PersonalToastState | null>(null)

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim()) { setToast({ tone: 'error', message: '請先輸入筆記標題' }); return }
    setSaving(true)
    try {
      const response = await fetch(`/api/notes/${initialNote.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), content, tagIds }) })
      if (!response.ok) throw new Error(await response.text())
      setToast({ tone: 'success', message: '筆記已更新' })
    } catch (error) { setToast({ tone: 'error', message: error instanceof Error ? error.message : '儲存失敗' }) } finally { setSaving(false) }
  }

  const deleteNote = async () => {
    if (!window.confirm('刪除前請確認：確定要刪除這篇筆記嗎？此動作無法復原。')) return
    const response = await fetch(`/api/notes/${initialNote.id}`, { method: 'DELETE' })
    if (response.ok) window.location.href = '/dashboard/notes'
    else setToast({ tone: 'error', message: '刪除失敗' })
  }

  return <div className="mx-auto max-w-4xl space-y-6" data-testid="note-detail-page"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold tracking-[0.14em] text-[#c96b61]">把想法整理成自己的樣子</p><h1 className="mt-2 text-4xl font-bold text-[#2e2a28]">編輯筆記</h1></div><div className="flex gap-2"><Link href="/dashboard/notes" className="rounded-2xl border border-[#eaded4] px-4 py-3 text-sm font-bold text-[#776e68] hover:bg-[#faf0e8]">返回筆記</Link><button type="button" onClick={() => void deleteNote()} className="rounded-2xl border border-[#f0c9c2] px-4 py-3 text-sm font-bold text-[#a85b4e] hover:bg-[#fff0ed]">刪除</button></div></div><form onSubmit={save} className="rounded-[2rem] border border-[#eaded4] bg-[#fffdfa] p-5 shadow-[0_16px_44px_rgba(112,82,62,0.08)] sm:p-7"><label className="block text-sm font-semibold text-[#695e57]">標題<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 h-14 w-full rounded-2xl border border-[#e5d9cf] bg-[#fffdfa] px-4 text-2xl font-bold text-[#2e2a28] outline-none focus:border-[#d97568] focus:ring-4 focus:ring-[#e98a7a]/15" /></label><div className="mt-5"><p className="text-sm font-semibold text-[#695e57]">內容</p><div className="mt-2"><PersonalRichTextEditor content={content} onChange={setContent}/></div></div><div className="mt-5"><p className="text-sm font-semibold text-[#695e57]">標籤</p><PersonalTagPicker value={tagIds} onChange={setTagIds}/></div><div className="mt-6 flex justify-end"><button type="submit" disabled={saving} className="rounded-2xl bg-[#e98a7a] px-6 py-3 text-sm font-bold text-white hover:bg-[#d97568] disabled:opacity-60">{saving ? '儲存中⋯' : '儲存變更'}</button></div></form><PersonalToast toast={toast} onDismiss={() => setToast(null)}/></div>
}
