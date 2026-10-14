'use client'

import { useEffect, useId, useRef, useSyncExternalStore, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

let scrollLocks = 0
let previousOverflow = ''
const subscribeToClient = (): (() => void) => () => undefined

type Props = { open: boolean; title: string; children: ReactNode; onClose: () => void; busy?: boolean; className?: string; surface?: 'finance' }

export function PersonalModal({ open, title, children, onClose, busy = false, className = 'max-w-2xl', surface }: Props): ReactElement | null {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  const mounted = useSyncExternalStore(subscribeToClient, () => true, () => false)
  useEffect(() => {
    if (!open || !mounted) return
    const previousFocus = document.activeElement
    if (scrollLocks++ === 0) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden' }
    const container = panel.current
    const focusable = (): HTMLElement[] => Array.from(container?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"], [contenteditable="true"]') ?? []).filter((element) => element.getClientRects().length > 0)
    ;(focusable()[0] ?? container)?.focus()
    const isTop = (): boolean => { const modals = document.querySelectorAll('[data-personal-modal]'); return modals[modals.length - 1] === container }
    const handleKey = (event: KeyboardEvent): void => {
      if (!isTop()) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) closeRef.current() }
      if (event.key === 'Tab') {
        const targets = focusable()
        const first = targets[0]
        const last = targets[targets.length - 1]
        if (!first) { event.preventDefault(); container?.focus() }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === container)) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    const handleFocus = (event: FocusEvent): void => {
      if (isTop() && event.target instanceof Node && !container?.contains(event.target)) (focusable()[0] ?? container)?.focus()
    }
    document.addEventListener('keydown', handleKey)
    document.addEventListener('focusin', handleFocus)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('focusin', handleFocus)
      if (--scrollLocks === 0) document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [open, mounted, busy])
  if (!open || !mounted) return null
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#2e2a28]/30 p-4 backdrop-blur-[3px]" onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div ref={panel} data-personal-modal data-finance-surface={surface === 'finance' ? '' : undefined} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`relative max-h-[88dvh] w-full overflow-y-auto rounded-[2rem] border border-[#eaded4] bg-[#fffdfa] p-5 text-[#4a413c] shadow-[0_24px_80px_rgba(74,55,43,0.22)] outline-none sm:p-7 ${className}`}>
        <div className="mb-4 flex items-center justify-between gap-3"><h2 id={titleId} className="text-xl font-bold">{title}</h2><button type="button" onClick={onClose} disabled={busy} aria-label={`關閉${title}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#faf3ed] text-lg text-[#695e57] outline-none hover:bg-[#f6e5d9] focus-visible:ring-2 focus-visible:ring-[#a85b4e] disabled:opacity-50">×</button></div>
        {children}
      </div>
    </div>, document.body,
  )
}
