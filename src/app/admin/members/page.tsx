import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/currentUser'
import MembersClient from './ui/MembersClient'

export default async function AdminMembersPage(): Promise<React.ReactElement> {
  const admin = await getAuthenticatedUser({ requireAdmin: true })
  if (!admin) redirect('/dashboard')

  return (
    <div className="space-y-6" data-testid="members-page">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.14em] text-[#c96b61]">只給管理員的工作區</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-[#2e2a28] sm:text-5xl">會員管理</h1>
          <p className="mt-3 text-base leading-7 text-[#776e68]">建立帳號、調整會員資料，或在忘記密碼時協助重設。</p>
        </div>
        <Link href="/dashboard" className="inline-flex items-center justify-center rounded-2xl border border-[#eaded4] bg-[#fffdfa] px-4 py-3 text-sm font-bold text-[#a85b4e] transition hover:border-[#d9a59a] hover:bg-[#fff1eb]">返回首頁</Link>
      </header>
      <MembersClient />
    </div>
  )
}
