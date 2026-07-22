'use client'

import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

export function LoginView() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email: username,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('帳號或密碼不正確，請再試一次。')
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('目前無法連線，請稍後再試。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="login-username" className="block text-sm font-semibold text-[#2e2a28]">
          帳號
        </label>
        <input
          id="login-username"
          name="username"
          type="text"
          autoComplete="username"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="輸入你的帳號"
          className="h-12 w-full rounded-2xl border border-[#e5d9cf] bg-[#fffdfa] px-4 text-base text-[#2e2a28] outline-none transition placeholder:text-[#a79b91] focus:border-[#d97568] focus:ring-4 focus:ring-[#e98a7a]/15"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="login-password" className="block text-sm font-semibold text-[#2e2a28]">
          密碼
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="輸入你的密碼"
          className="h-12 w-full rounded-2xl border border-[#e5d9cf] bg-[#fffdfa] px-4 text-base text-[#2e2a28] outline-none transition placeholder:text-[#a79b91] focus:border-[#d97568] focus:ring-4 focus:ring-[#e98a7a]/15"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-2xl border border-[#e1aaa0] bg-[#fff1ee] px-4 py-3 text-sm leading-6 text-[#a84f48]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        className="flex h-12 w-full items-center justify-center rounded-2xl bg-[#e98a7a] px-5 text-base font-bold text-white shadow-[0_12px_24px_rgba(201,107,97,0.22)] transition hover:bg-[#d97568] focus:outline-none focus:ring-4 focus:ring-[#e98a7a]/25 active:translate-y-px disabled:cursor-wait disabled:opacity-60"
      >
        {loading ? '登入中⋯' : '登入日隅'}
      </button>

      <p className="text-center text-xs leading-5 text-[#8e8178]">
        忘記帳號或密碼？請聯絡管理員協助重設。
      </p>
    </form>
  )
}
