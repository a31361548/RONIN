'use client'

import { useEffect, useState, type ReactElement } from 'react'
import type { PersonalTag } from '@/types/tag'

type PersonalTagPickerProps = {
  value: string[]
  onChange: (value: string[]) => void
}

export function PersonalTagPicker({ value, onChange }: PersonalTagPickerProps): ReactElement {
  const [tags, setTags] = useState<PersonalTag[]>([])
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/tags')
      .then(async (response) => {
        if (!response.ok) throw new Error('標籤載入失敗')
        return (await response.json()) as { tags: PersonalTag[] }
      })
      .then((data) => { if (active) setTags(data.tags) })
      .catch(() => { if (active) setError('標籤暫時無法載入') })
    return () => { active = false }
  }, [])

  const toggleTag = (id: string) => {
    onChange(value.includes(id) ? value.filter((tagId) => tagId !== id) : [...value, id])
  }

  const createTag = async () => {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    setError(null)
    try {
      const response = await fetch('/api/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      if (!response.ok) throw new Error(await response.text())
      const data = (await response.json()) as { tag: PersonalTag }
      setTags((current) => [...current, data.tag])
      onChange([...value, data.tag.id])
      setNewName('')
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '新增標籤失敗')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mt-2 rounded-2xl border border-[#e5d9cf] bg-[#fffaf6] p-3">
      <div className="flex flex-wrap gap-2">
        {tags.length > 0 ? tags.map((tag) => {
          const selected = value.includes(tag.id)
          return <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)} aria-pressed={selected} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${selected ? 'border-transparent text-white' : 'border-[#eaded4] bg-[#fffdfa] text-[#776e68] hover:border-[#d9a59a]'}`} style={selected ? { backgroundColor: tag.color } : undefined}>{tag.name}</button>
        }) : <span className="text-xs text-[#a79b91]">還沒有標籤，可以直接建立。</span>}
      </div>
      <div className="mt-3 flex gap-2">
        <input value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void createTag() } }} placeholder="建立新標籤" className="h-9 min-w-0 flex-1 rounded-xl border border-[#e5d9cf] bg-[#fffdfa] px-3 text-xs text-[#4a413c] outline-none focus:border-[#d97568] focus:ring-4 focus:ring-[#e98a7a]/15" />
        <button type="button" onClick={() => void createTag()} disabled={creating || !newName.trim()} className="rounded-xl bg-[#f6e5d9] px-3 text-xs font-bold text-[#a85b4e] transition hover:bg-[#f0d9ce] disabled:opacity-50">{creating ? '建立中' : '新增'}</button>
      </div>
      {error && <p className="mt-2 text-xs text-[#a85b4e]" role="status">{error}</p>}
    </div>
  )
}
