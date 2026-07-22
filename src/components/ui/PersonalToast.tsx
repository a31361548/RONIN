'use client'

import { useEffect, useRef, type ReactElement } from 'react'

export type PersonalToastTone = 'success' | 'error' | 'info'

export type PersonalToastState = {
  tone: PersonalToastTone
  message: string
}

type PersonalToastProps = {
  toast: PersonalToastState | null
  onDismiss: () => void
  duration?: number
}

function ToastIcon({ tone }: { tone: PersonalToastTone }): ReactElement {
  if (tone === 'error') {
    return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><path d="M12 8v4m0 4h.01M10.3 3.8 2.7 18a2 2 0 0 0 1.75 3h15.1a2 2 0 0 0 1.75-3L13.7 3.8a2 2 0 0 0-3.4 0Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>
  }

  if (tone === 'info') {
    return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 10v6m0-9h.01" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>
  }

  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5"><path d="m5 12 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
}

export function PersonalToast({ toast, onDismiss, duration = 3600 }: PersonalToastProps): ReactElement | null {
  const dismissRef = useRef(onDismiss)

  useEffect(() => {
    dismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (!toast) return
    const timeoutId = window.setTimeout(() => dismissRef.current(), duration)
    return () => window.clearTimeout(timeoutId)
  }, [duration, toast])

  if (!toast) return null

  const toneClass = toast.tone === 'success'
    ? 'border-[#d8e8d3] bg-[#f2f8ef] text-[#5f7f5a]'
    : toast.tone === 'error'
      ? 'border-[#f0c9c2] bg-[#fff2ef] text-[#a85b4e]'
      : 'border-[#d8e4ec] bg-[#f1f6fb] text-[#5b7486]'

  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[70] flex justify-center sm:inset-x-auto sm:right-6 sm:top-6 sm:w-[min(25rem,calc(100vw-3rem))]" aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}>
      <div data-testid="personal-toast" role={toast.tone === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 shadow-[0_16px_38px_rgba(112,82,62,0.12)] backdrop-blur-sm ${toneClass}`}>
        <span className="mt-0.5 shrink-0"><ToastIcon tone={toast.tone} /></span>
        <p className="min-w-0 flex-1 text-sm font-semibold leading-6">{toast.message}</p>
        <button type="button" onClick={onDismiss} aria-label="關閉通知" className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-current/60 transition hover:bg-black/5 hover:text-current focus:outline-none focus:ring-4 focus:ring-current/15">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4"><path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>
        </button>
      </div>
    </div>
  )
}
