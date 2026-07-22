'use client'

import { useEffect, type ReactElement } from 'react'

type PersonalConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function PersonalConfirmDialog({ open, title, description, confirmLabel = '確認刪除', busy = false, onCancel, onConfirm }: PersonalConfirmDialogProps): ReactElement | null {
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [busy, onCancel, open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="personal-confirm-title" aria-describedby="personal-confirm-description">
      <button type="button" aria-label="關閉確認視窗" onClick={onCancel} disabled={busy} className="absolute inset-0 cursor-default bg-[#2e2a28]/25 backdrop-blur-[2px] disabled:cursor-wait" />
      <div className="relative w-full max-w-md rounded-[2rem] border border-[#eaded4] bg-[#fffdfa] p-6 shadow-[0_24px_80px_rgba(74,55,43,0.2)] sm:p-7">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff0ed] text-[#a85b4e]">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6"><path d="M4 7h16m-10 4v6m4-6v6M9 7V4h6v3m-9 0 1 13h10l1-13" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>
        </div>
        <h2 id="personal-confirm-title" className="mt-5 text-xl font-bold text-[#2e2a28]">{title}</h2>
        <p id="personal-confirm-description" className="mt-2 text-sm leading-6 text-[#776e68]">{description}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={busy} autoFocus className="rounded-2xl border border-[#eaded4] px-4 py-3 text-sm font-bold text-[#776e68] transition hover:bg-[#faf3ed] disabled:cursor-not-allowed disabled:opacity-50">先不要</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="rounded-2xl bg-[#d97568] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#bf5d52] disabled:cursor-wait disabled:opacity-60">{busy ? '刪除中⋯' : confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
