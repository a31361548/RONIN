'use client'

import { useEffect, useState, type ReactElement } from 'react'
import type { PersonalTag } from '@/types/tag'
import { PersonalToast, type PersonalToastState } from '@/components/ui/PersonalToast'

export function PersonalTagManager(): ReactElement {
  const [tags, setTags] = useState<PersonalTag[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#E98A7A')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<PersonalToastState | null>(null)

  const loadTags = async () => {
    const response = await fetch('/api/tags')
    if (!response.ok) throw new Error('標籤載入失敗')
    const data = (await response.json()) as { tags: PersonalTag[] }
    setTags(data.tags)
  }

  useEffect(() => {
    void loadTags().catch((error: unknown) => setToast({ tone: 'error', message: error instanceof Error ? error.message : '標籤載入失敗' }))
  }, [])

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setColor('#E98A7A')
  }

  const saveTag = async () => {
    if (!name.trim()) {
      setToast({ tone: 'error', message: '請先輸入標籤名稱' })
      return
    }
    setSaving(true)
    setToast(null)
    try {
      const response = await fetch(editingId ? `/api/tags/${editingId}` : '/api/tags', { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), color }) })
      if (!response.ok) throw new Error(await response.text())
      await loadTags()
      resetForm()
      setToast({ tone: 'success', message: editingId ? '標籤已更新' : '標籤已建立' })
    } catch (error) {
      setToast({ tone: 'error', message: error instanceof Error ? error.message : '標籤儲存失敗' })
    } finally {
      setSaving(false)
    }
  }

  const deleteTag = async (tag: PersonalTag) => {
    if (!window.confirm(`刪除前請確認：確定要刪除「${tag.name}」嗎？系統會先說明它目前被哪些內容使用。`)) return
    try {
      const check = await fetch(`/api/tags/${tag.id}`, { method: 'DELETE' })
      if (check.status === 409) {
        const impact = (await check.json()) as { noteCount: number; todoCount: number }
        const confirmed = window.confirm(`「${tag.name}」目前使用於 ${impact.noteCount} 篇筆記、${impact.todoCount} 件待辦。確認刪除後，這些內容會解除標籤。`)
        if (!confirmed) return
        const force = await fetch(`/api/tags/${tag.id}?force=true`, { method: 'DELETE' })
        if (!force.ok) throw new Error('標籤刪除失敗')
      } else if (!check.ok) {
        throw new Error('標籤刪除失敗')
      }
      setTags((current) => current.filter((item) => item.id !== tag.id))
      if (editingId === tag.id) resetForm()
      setToast({ tone: 'success', message: '標籤已刪除' })
    } catch (error) {
      setToast({ tone: 'error', message: error instanceof Error ? error.message : '標籤刪除失敗' })
    }
  }

  return (
    <section className="rounded-[2rem] border border-[#eaded4] bg-[#fffdfa] p-5 shadow-[0_16px_44px_rgba(112,82,62,0.08)] sm:p-7" data-testid="tag-manager">
      <div><p className="text-sm font-bold text-[#2e2a28]">標籤管理</p><p className="mt-1 text-sm leading-6 text-[#8d7f76]">建立自己的分類方式，筆記與待辦都可以共用。刪除前會說明影響範圍。</p></div>
      <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-[#fffaf6] p-4 sm:flex-row sm:items-end"><label className="min-w-0 flex-1 text-sm font-semibold text-[#695e57]">{editingId ? '修改標籤' : '新增標籤'}<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：生活、工作、靈感" className="mt-2 h-11 w-full rounded-xl border border-[#e5d9cf] bg-[#fffdfa] px-3 text-sm font-normal text-[#4a413c] outline-none focus:border-[#d97568] focus:ring-4 focus:ring-[#e98a7a]/15" /></label><label className="text-sm font-semibold text-[#695e57]">色彩<input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="mt-2 block h-11 w-16 cursor-pointer rounded-xl border border-[#e5d9cf] bg-[#fffdfa] p-1" /></label><button type="button" onClick={() => void saveTag()} disabled={saving} className="rounded-xl bg-[#e98a7a] px-4 py-3 text-sm font-bold text-white hover:bg-[#d97568] disabled:opacity-50">{saving ? '儲存中' : editingId ? '儲存' : '新增'}</button>{editingId && <button type="button" onClick={resetForm} className="rounded-xl border border-[#eaded4] px-4 py-3 text-sm font-bold text-[#776e68] hover:bg-[#faf0e8]">取消</button>}</div>
      <div className="mt-5 flex flex-wrap gap-3">{tags.length > 0 ? tags.map((tag) => <div key={tag.id} className="flex items-center gap-2 rounded-full border border-[#eaded4] bg-[#fffaf6] py-1.5 pl-3 pr-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} /><span className="text-sm font-bold text-[#4a413c]">{tag.name}</span><button type="button" onClick={() => { setEditingId(tag.id); setName(tag.name); setColor(tag.color) }} className="rounded-full px-2 py-1 text-xs font-bold text-[#776e68] hover:bg-[#f6e5d9] hover:text-[#a85b4e]">編輯</button><button type="button" onClick={() => void deleteTag(tag)} className="rounded-full px-2 py-1 text-xs font-bold text-[#a85b4e] hover:bg-[#fff0ed]">刪除</button></div>) : <p className="rounded-2xl bg-[#faf3ed] px-4 py-5 text-sm text-[#9a8c83]">還沒有標籤，先建立一個適合你的分類。</p>}</div>
      <PersonalToast toast={toast} onDismiss={() => setToast(null)} />
    </section>
  )
}
