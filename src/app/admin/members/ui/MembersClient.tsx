'use client'

import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { PersonalSelect } from '@/components/ui/PersonalSelect'
import { PersonalToast, type PersonalToastState } from '@/components/ui/PersonalToast'

type MemberStatus = 'ACTIVE' | 'INACTIVE'

type Member = {
  id: string
  email: string
  name: string | null
  status: MemberStatus
  note: string | null
  role: string
  createdAt: string
}

type MembersResponse = {
  members: Member[]
  total: number
  page: number
  pageSize: number
}

type ModalState = { type: 'create' } | { type: 'edit'; member: Member } | { type: 'reset'; member: Member } | null
type MemberForm = { email: string; name: string; status: MemberStatus; note: string; password: string }

const STATUS_LABEL: Record<MemberStatus, string> = {
  ACTIVE: '啟用中',
  INACTIVE: '已停用',
}

const STATUS_OPTIONS: Array<{ value: MemberStatus; label: string }> = [
  { value: 'ACTIVE', label: '啟用中' },
  { value: 'INACTIVE', label: '已停用' },
]

const PAGE_SIZE = 10

export default function MembersClient(): ReactElement {
  const [members, setMembers] = useState<Member[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [form, setForm] = useState<MemberForm>({ email: '', name: '', status: 'ACTIVE', note: '', password: '' })
  const [modalError, setModalError] = useState<string | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [toast, setToast] = useState<PersonalToastState | null>(null)

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total])

  const fetchMembers = useCallback(async (pageValue: number, searchValue: string): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const safePage = Math.max(1, pageValue)
      const params = new URLSearchParams({ page: String(safePage), pageSize: String(PAGE_SIZE) })
      if (searchValue) params.set('search', searchValue)
      const response = await fetch(`/api/admin/members?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('讀取會員失敗')
      const data = (await response.json()) as MembersResponse
      setMembers(data.members)
      setTotal(data.total)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '讀取會員失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchMembers(page, search)
  }, [fetchMembers, page, search])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setPage(1)
      setSearch(searchInput.trim())
    }, 350)
    return () => window.clearTimeout(handle)
  }, [searchInput])

  const openCreate = (): void => {
    setForm({ email: '', name: '', status: 'ACTIVE', note: '', password: '' })
    setModalError(null)
    setModal({ type: 'create' })
  }

  const openEdit = (member: Member): void => {
    setForm({ email: member.email, name: member.name ?? '', status: member.status, note: member.note ?? '', password: '' })
    setModalError(null)
    setModal({ type: 'edit', member })
  }

  const openReset = (member: Member): void => {
    setForm({ email: member.email, name: member.name ?? '', status: member.status, note: member.note ?? '', password: '' })
    setModalError(null)
    setModal({ type: 'reset', member })
  }

  const closeModal = (): void => {
    if (modalLoading) return
    setModal(null)
    setModalError(null)
  }

  const submitMember = async (): Promise<void> => {
    if (!modal) return
    setModalLoading(true)
    setModalError(null)
    try {
      if (modal.type === 'create') {
        if (!form.email || !form.password || form.password.length < 6) throw new Error('請填寫有效 Email，且初始密碼至少 6 字')
        const response = await fetch('/api/admin/members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email, name: form.name || undefined, password: form.password, note: form.note || undefined, status: form.status }),
        })
        if (!response.ok) throw new Error(response.status === 409 ? 'Email 已存在' : '建立會員失敗')
        setToast({ tone: 'success', message: '會員帳號已建立' })
      } else if (modal.type === 'edit') {
        const response = await fetch(`/api/admin/members/${modal.member.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email, name: form.name || undefined, note: form.note || null, status: form.status }),
        })
        if (!response.ok) throw new Error('會員資料更新失敗')
        setToast({ tone: 'success', message: '會員資料已更新' })
      } else {
        if (!form.password || form.password.length < 6) throw new Error('新密碼至少 6 字')
        const response = await fetch(`/api/admin/members/${modal.member.id}/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: form.password }),
        })
        if (!response.ok) throw new Error('密碼重設失敗')
        setToast({ tone: 'success', message: '會員密碼已重設' })
      }
      setModal(null)
      await fetchMembers(page, search)
    } catch (submitError) {
      setModalError(submitError instanceof Error ? submitError.message : '操作失敗')
    } finally {
      setModalLoading(false)
    }
  }

  return (
    <div className="space-y-5" data-testid="members-client">
      <section className="rounded-[2rem] border border-[#eaded4] bg-[#fffdfa] p-5 shadow-[0_16px_44px_rgba(112,82,62,0.08)] sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold text-[#2e2a28]">帳號名冊</p>
            <p className="mt-1 text-sm leading-6 text-[#8d7f76]">目前共 {total} 位成員，只有管理員可以建立與調整帳號。</p>
          </div>
          <button data-testid="member-create" type="button" onClick={openCreate} className="rounded-2xl bg-[#e98a7a] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#d97568]">新增會員</button>
        </div>
        <label className="mt-5 block">
          <span className="mb-2 block text-xs font-bold tracking-[0.12em] text-[#a79b91]">搜尋會員</span>
          <input data-testid="members-search" className="w-full rounded-2xl border border-[#eaded4] bg-[#fffaf6] px-4 py-3 text-sm text-[#4a413c] outline-none transition placeholder:text-[#b8aaa0] focus:border-[#d9a59a]" placeholder="搜尋 Email 或顯示名稱" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
        </label>
      </section>

      <section className="rounded-[2rem] border border-[#eaded4] bg-[#fffdfa] p-3 shadow-[0_16px_44px_rgba(112,82,62,0.08)] sm:p-5">
        <div className="overflow-x-auto">
          <table data-testid="members-table" className="min-w-[760px] w-full text-left text-sm">
            <thead><tr className="border-b border-[#eaded4] text-xs font-bold tracking-[0.08em] text-[#a79b91]"><th className="px-4 py-4">會員</th><th className="px-4 py-4">狀態</th><th className="px-4 py-4">備註</th><th className="px-4 py-4">建立時間</th><th className="px-4 py-4 text-right">操作</th></tr></thead>
            <tbody>
              {loading ? <tr><td className="px-4 py-10 text-center text-[#a79b91]" colSpan={5}>正在整理會員名冊⋯</td></tr> : members.length === 0 ? <tr><td className="px-4 py-10 text-center text-[#a79b91]" colSpan={5}>目前沒有符合條件的會員。</td></tr> : members.map((member) => <tr key={member.id} className="border-b border-[#f0e6df] last:border-0"><td className="px-4 py-5"><p className="font-bold text-[#4a413c]">{member.name || '未設定名稱'}</p><p className="mt-1 text-xs text-[#9a8c83]">{member.email}</p></td><td className="px-4 py-5"><span className={`rounded-full px-3 py-1 text-xs font-bold ${member.status === 'ACTIVE' ? 'bg-[#edf5ea] text-[#5f7f5a]' : 'bg-[#fff0ed] text-[#a85b4e]'}`}>{STATUS_LABEL[member.status]}</span></td><td className="max-w-[220px] px-4 py-5 text-sm text-[#776e68]">{member.note || '—'}</td><td className="px-4 py-5 text-xs text-[#9a8c83]">{new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium' }).format(new Date(member.createdAt))}</td><td className="px-4 py-5"><div className="flex justify-end gap-2"><button type="button" onClick={() => openEdit(member)} className="rounded-xl border border-[#eaded4] px-3 py-2 text-xs font-bold text-[#a85b4e] transition hover:border-[#d9a59a] hover:bg-[#fff1eb]">編輯</button><button type="button" onClick={() => openReset(member)} className="rounded-xl border border-[#eaded4] px-3 py-2 text-xs font-bold text-[#776e68] transition hover:border-[#d9a59a] hover:bg-[#faf0e8]">重設密碼</button></div></td></tr>)}
            </tbody>
          </table>
        </div>
        {error && <p role="alert" className="px-4 py-4 text-sm font-semibold text-[#a85b4e]">{error}</p>}
      </section>

      <div className="flex flex-col gap-3 px-1 text-sm text-[#8d7f76] sm:flex-row sm:items-center sm:justify-between"><span>第 {page} / {totalPages} 頁</span><div className="flex gap-2"><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} className="rounded-xl border border-[#eaded4] px-3 py-2 text-xs font-bold transition hover:bg-[#fff1eb] disabled:cursor-not-allowed disabled:opacity-40">上一頁</button><button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loading} className="rounded-xl border border-[#eaded4] px-3 py-2 text-xs font-bold transition hover:bg-[#fff1eb] disabled:cursor-not-allowed disabled:opacity-40">下一頁</button></div></div>
      <PersonalToast toast={toast} onDismiss={() => setToast(null)} />

      {modal && <MemberModal title={modal.type === 'create' ? '新增會員' : modal.type === 'edit' ? '編輯會員' : '重設密碼'} onClose={closeModal}>
        {modal.type !== 'reset' && <>
          <Field label="Email"><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="member@example.com" /></Field>
          <Field label="顯示名稱"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：小日" /></Field>
          <Field label="狀態"><PersonalSelect value={form.status} options={STATUS_OPTIONS} onChange={(status) => setForm({ ...form, status })} /></Field>
          <Field label="備註"><textarea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="可留給管理員看的備註" /></Field>
        </>}
        <Field label={modal.type === 'reset' ? '新密碼' : '初始密碼'}><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="至少 6 個字元" /></Field>
        {modalError && <p role="alert" className="text-sm font-semibold text-[#a85b4e]">{modalError}</p>}
        <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={closeModal} disabled={modalLoading} className="rounded-2xl border border-[#eaded4] px-5 py-3 text-sm font-bold text-[#776e68] transition hover:bg-[#faf0e8] disabled:opacity-50">取消</button><button type="button" onClick={() => void submitMember()} disabled={modalLoading} className="rounded-2xl bg-[#e98a7a] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#d97568] disabled:opacity-50">{modalLoading ? '處理中⋯' : '儲存'}</button></div>
      </MemberModal>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return <label className="block space-y-2 text-sm font-semibold text-[#776e68]"><span>{label}</span><span className="block [&>input]:w-full [&>input]:rounded-2xl [&>input]:border [&>input]:border-[#eaded4] [&>input]:bg-[#fffaf6] [&>input]:px-4 [&>input]:py-3 [&>input]:text-[#4a413c] [&>input]:outline-none [&>input]:focus:border-[#d9a59a] [&>textarea]:w-full [&>textarea]:rounded-2xl [&>textarea]:border [&>textarea]:border-[#eaded4] [&>textarea]:bg-[#fffaf6] [&>textarea]:px-4 [&>textarea]:py-3 [&>textarea]:text-[#4a413c] [&>textarea]:outline-none [&>textarea]:focus:border-[#d9a59a]">{children}</span></label>
}

function MemberModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }): ReactElement {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2e2a28]/55 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="member-modal-title"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[2rem] border border-[#eaded4] bg-[#fffdfa] p-5 shadow-[0_24px_80px_rgba(46,42,40,0.24)] sm:p-7"><div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-sm font-semibold tracking-[0.12em] text-[#c96b61]">會員資料</p><h2 id="member-modal-title" className="mt-1 text-2xl font-bold text-[#2e2a28]">{title}</h2></div><button type="button" onClick={onClose} aria-label="關閉視窗" className="rounded-full px-3 py-2 text-xl text-[#8d7f76] transition hover:bg-[#faf0e8] hover:text-[#a85b4e]">×</button></div><div className="space-y-4">{children}</div></div></div>
}
