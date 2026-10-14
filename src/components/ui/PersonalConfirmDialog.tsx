'use client'

import { type ReactElement } from 'react'
import { PersonalModal } from '@/components/ui/PersonalModal'

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
  if (!open) return null

  return (
    <PersonalModal open={open} title={title} onClose={onCancel} busy={busy} className="max-w-md">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff0ed] text-[#a85b4e]">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6"><path d="M4 7h16m-10 4v6m4-6v6M9 7V4h6v3m-9 0 1 13h10l1-13" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>
        </div>
        <p id="personal-confirm-description" className="mt-2 text-sm leading-6 text-[#776e68]">{description}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={busy} autoFocus className="rounded-2xl border border-[#eaded4] px-4 py-3 text-sm font-bold text-[#776e68] transition hover:bg-[#faf3ed] disabled:cursor-not-allowed disabled:opacity-50">先不要</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="rounded-2xl bg-[#ad5146] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#934237] disabled:cursor-wait disabled:opacity-60">{busy ? '刪除中⋯' : confirmLabel}</button>
        </div>
    </PersonalModal>
  )
}
