'use client'

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { PersonalSelect } from './PersonalSelect'
import { calendarDays, parsePickerValue, pickerLabel, pickerValue, shiftPickerMonth, utcDate, type DatePickerMode } from '@/lib/date-picker'
import { taipeiDate } from '@/lib/finance/money'

type Props = { value: string; onChange: (value: string) => void; mode?: DatePickerMode; label?: string; ariaLabel?: string; name?: string; required?: boolean; disabled?: boolean; placeholder?: string; className?: string; size?: 'default' | 'compact'; min?: string; max?: string }
const weekdays = ['日', '一', '二', '三', '四', '五', '六']

export function PersonalDatePicker({ value, onChange, mode = 'date', label, ariaLabel, name, required = false, disabled = false, placeholder, className = '', size = 'default', min, max }: Props): ReactElement {
  const id = `personal-date-${useId()}`
  const accessibleLabel = ariaLabel ?? label ?? (mode === 'date' ? '日期' : '月份')
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const focusAfterRender = useRef(false)
  const [open, setOpen] = useState(false)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [position, setPosition] = useState<CSSProperties>({})
  const [view, setView] = useState(() => parsePickerValue(value, mode) ?? parsePickerValue(taipeiDate(), 'date') ?? new Date())
  const [focused, setFocused] = useState(pickerValue(view, mode))
  const [invalid, setInvalid] = useState(false)
  const today = taipeiDate().slice(0, mode === 'month' ? 7 : 10)
  const allowed = (key: string): boolean => Boolean(parsePickerValue(key, mode)) && (!min || key >= min) && (!max || key <= max)
  const currentValid = allowed(value)
  const close = (restore = false): void => { setOpen(false); if (restore) trigger.current?.focus() }
  const commit = (key: string): void => {
    if (trigger.current?.matches(':disabled') || key && !allowed(key) || !key && required) return
    onChange(key); setInvalid(false); close(true)
  }
  const reveal = (): void => {
    if (trigger.current?.matches(':disabled')) return
    const date = parsePickerValue(value, mode) ?? parsePickerValue(today, mode) ?? view
    setView(date); setFocused(pickerValue(date, mode))
    setHost(trigger.current?.closest<HTMLElement>('[data-personal-modal]') ?? document.body)
    focusAfterRender.current = true
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const place = (): void => {
      const anchor = trigger.current
      if (!anchor || anchor.matches(':disabled')) { setOpen(false); return }
      const rect = anchor.getBoundingClientRect()
      const viewport = window.visualViewport
      const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0
      const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight
      if (rect.bottom < top || rect.top > top + height) { setOpen(false); return }
      const below = top + height - rect.bottom - 20, above = rect.top - top - 20
      const panelHeight = panel.current?.offsetHeight || 380
      const upwards = below < panelHeight && above > below
      const maximumHeight = Math.max(120, Math.min(440, upwards ? above : below))
      const actualHeight = Math.min(panelHeight, maximumHeight)
      const panelWidth = Math.min(340, width - 24)
      setPosition({ left: Math.max(left + 12, Math.min(rect.left, left + width - panelWidth - 12)), top: upwards ? Math.max(top + 12, rect.top - actualHeight - 8) : rect.bottom + 8, width: panelWidth, maxHeight: maximumHeight })
    }
    place()
    const frame = window.requestAnimationFrame(place)
    const observer = new ResizeObserver(place)
    if (panel.current) observer.observe(panel.current)
    const outside = (event: Event): void => { if (event.target instanceof Node && !root.current?.contains(event.target) && !panel.current?.contains(event.target)) close() }
    const scroll = (event: Event): void => { if (!(event.target instanceof Node) || !panel.current?.contains(event.target)) place() }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', place)
    window.visualViewport?.addEventListener('resize', place)
    window.visualViewport?.addEventListener('scroll', place)
    return () => {
      window.cancelAnimationFrame(frame); observer.disconnect()
      document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside)
      window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', place)
      window.visualViewport?.removeEventListener('resize', place); window.visualViewport?.removeEventListener('scroll', place)
    }
  }, [open, disabled])

  useEffect(() => {
    if (!open || !focusAfterRender.current) return
    const frame = window.requestAnimationFrame(() => {
      const targets = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('[data-date-value]') ?? [])
      ;(targets.find((button) => button.dataset.dateValue === focused && !button.disabled) ?? targets.find((button) => !button.disabled) ?? panel.current)?.focus()
      focusAfterRender.current = false
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, focused, view])

  const browse = (date: Date, focus = false): void => {
    if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return
    setView(date); setFocused(pickerValue(date, mode)); focusAfterRender.current = focus
  }
  const gridKey = (event: KeyboardEvent<HTMLButtonElement>, date: Date): void => {
    let next: Date | undefined
    const offsets: Record<string, number> = mode === 'date' ? { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } : { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }
    if (event.key in offsets) next = mode === 'date' ? utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + offsets[event.key]) : shiftPickerMonth(date, offsets[event.key])
    if (event.key === 'Home') next = mode === 'date' ? utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - date.getUTCDay()) : utcDate(date.getUTCFullYear(), 0)
    if (event.key === 'End') next = mode === 'date' ? utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 6 - date.getUTCDay()) : utcDate(date.getUTCFullYear(), 11)
    if (event.key === 'PageUp' || event.key === 'PageDown') next = shiftPickerMonth(date, (event.key === 'PageUp' ? -1 : 1) * (mode === 'month' || event.shiftKey ? 12 : 1))
    if (next) { event.preventDefault(); event.stopPropagation(); if (allowed(pickerValue(next, mode))) browse(next, true) }
  }
  const year = view.getUTCFullYear(), month = view.getUTCMonth()
  const years = [...new Set([...Array.from({ length: 201 }, (_, index) => String(1900 + index)), String(year)])].sort((a, b) => Number(a) - Number(b))

  return <div ref={root} className={`relative min-w-0 ${className}`}>
    {label && <label htmlFor={id} className="mb-2 block text-sm font-semibold text-[#695e57]">{label}</label>}
    <button ref={trigger} id={id} type="button" aria-label={accessibleLabel} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-panel` : undefined} aria-describedby={invalid ? `${id}-error` : undefined} disabled={disabled} onClick={() => open ? close() : reveal()} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); reveal() } }} className={`flex w-full items-center justify-between gap-3 rounded-2xl border bg-[#fffdfa] px-3 text-left text-sm font-medium text-[#695e57] outline-none transition hover:border-[#d9a59a] focus:border-[#d97568] focus:ring-4 focus:ring-[#e98a7a]/15 disabled:cursor-not-allowed disabled:opacity-50 ${size === 'compact' ? 'min-h-10 py-2' : 'min-h-11 py-2.5'} ${open || invalid ? 'border-[#d97568]' : 'border-[#e5d9cf]'}`}><span className={`truncate ${!currentValid ? 'text-[#a99a91]' : ''}`}>{pickerLabel(value, mode) || placeholder || (mode === 'date' ? '選擇日期' : '選擇月份')}</span><svg aria-hidden="true" className="h-4 w-4 shrink-0 text-[#b7655a]" viewBox="0 0 24 24"><path d="M8 3v4m8-4v4M4 10h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M8 14h2m4 0h2m-8 3h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button>
    {name && <input type="hidden" name={name} value={value} disabled={disabled} />}
    {required && <input aria-hidden="true" tabIndex={-1} required disabled={disabled} value={currentValid ? 'selected' : ''} onChange={() => undefined} onInvalid={(event) => { event.preventDefault(); setInvalid(true); trigger.current?.focus() }} className="pointer-events-none absolute h-px w-px opacity-0" />}
    {invalid && <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-[#a85b4e]">請選擇{mode === 'date' ? '有效日期' : '有效月份'}。</p>}
    {open && host && createPortal(<div ref={panel} id={`${id}-panel`} data-personal-picker role="dialog" aria-label={`${accessibleLabel}選擇器`} tabIndex={-1} style={position} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) } else if (event.key === 'Tab') { const targets = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []).filter((element) => element.tabIndex >= 0); if (event.shiftKey && document.activeElement === targets[0] || !event.shiftKey && document.activeElement === targets[targets.length - 1]) close(true) } }} className="fixed z-[105] overflow-y-auto overscroll-contain rounded-3xl border border-[#eaded4] bg-[#fffdfa] p-4 text-[#695e57] shadow-[0_18px_60px_rgba(74,55,43,0.2)] outline-none">
      <div className="mb-3 flex items-center justify-between gap-2"><p className="text-xs font-semibold tracking-wide text-[#a85b4e]">{mode === 'month' ? '挑選月份' : '挑選日期'}</p><button type="button" aria-label={`關閉${accessibleLabel}選擇器`} onClick={() => close(true)} className="flex h-7 w-7 items-center justify-center rounded-full bg-[#faf3ed] text-[#8d7f76]">×</button></div>
      <div className="flex items-center gap-1.5"><button type="button" aria-label={mode === 'month' ? '上一年' : '上一月'} disabled={year === 1 && (mode === 'month' || month === 0)} onClick={() => browse(shiftPickerMonth(view, mode === 'month' ? -12 : -1))} className="h-9 w-8 shrink-0 rounded-xl bg-[#faf3ed] text-xl hover:bg-[#f6e5d9] disabled:opacity-30">‹</button><PersonalSelect ariaLabel="選擇年份" size="compact" className="min-w-0 flex-1" searchable value={String(year)} onChange={(key) => browse(utcDate(Number(key), month))} options={years.map((key) => ({ value: key, label: `${key}年` }))} />{mode === 'date' && <PersonalSelect ariaLabel="選擇月份" size="compact" className="w-24" value={String(month)} onChange={(key) => browse(utcDate(year, Number(key)))} options={Array.from({ length: 12 }, (_, index) => ({ value: String(index), label: `${index + 1}月` }))} />}<button type="button" aria-label={mode === 'month' ? '下一年' : '下一月'} disabled={year === 9999 && (mode === 'month' || month === 11)} onClick={() => browse(shiftPickerMonth(view, mode === 'month' ? 12 : 1))} className="h-9 w-8 shrink-0 rounded-xl bg-[#faf3ed] text-xl hover:bg-[#f6e5d9] disabled:opacity-30">›</button></div>
      {mode === 'month' ? <div role="grid" aria-label={`${year}年月份`} className="mt-4 space-y-2">{Array.from({ length: 4 }, (_, row) => <div key={row} role="row" className="grid grid-cols-3 gap-2">{Array.from({ length: 3 }, (_, column) => { const date = utcDate(year, row * 3 + column); const key = pickerValue(date, mode); return <div role="gridcell" aria-selected={value === key} key={key}><button type="button" data-date-value={key} tabIndex={focused === key ? 0 : -1} disabled={!allowed(key)} aria-label={pickerLabel(key, mode)} onClick={() => commit(key)} onKeyDown={(event) => gridKey(event, date)} className={`h-12 w-full rounded-2xl text-sm font-semibold outline-none focus:ring-2 focus:ring-[#d97568] disabled:opacity-30 ${value === key ? 'bg-[#e98a7a] text-white' : today === key ? 'bg-[#f6e5d9] text-[#a85b4e]' : 'bg-[#faf6f1] hover:bg-[#f6e5d9]'}`}>{date.getUTCMonth() + 1}月</button></div> })}</div>)}</div> : <div role="grid" aria-label={`${year}年${month + 1}月日期`} className="mt-4"><div role="row" className="mb-1 grid grid-cols-7">{weekdays.map((day) => <span role="columnheader" key={day} className="py-1 text-center text-xs text-[#a99a91]">{day}</span>)}</div>{Array.from({ length: 6 }, (_, row) => <div key={row} role="row" className="grid grid-cols-7 gap-1">{calendarDays(year, month).slice(row * 7, row * 7 + 7).map((date) => { const key = pickerValue(date, mode); return <div role="gridcell" aria-selected={value === key} key={key}><button type="button" data-date-value={key} tabIndex={focused === key ? 0 : -1} disabled={date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999 || !allowed(key)} aria-label={`${pickerLabel(key, mode)}星期${weekdays[date.getUTCDay()]}`} aria-current={today === key ? 'date' : undefined} onClick={() => commit(key)} onKeyDown={(event) => gridKey(event, date)} className={`aspect-square w-full rounded-xl text-sm outline-none focus:ring-2 focus:ring-inset focus:ring-[#d97568] disabled:opacity-20 ${value === key ? 'bg-[#e98a7a] font-bold text-white' : today === key ? 'bg-[#f6e5d9] font-bold text-[#a85b4e]' : date.getUTCMonth() !== month ? 'text-[#c6bcb5] hover:bg-[#faf3ed]' : 'text-[#695e57] hover:bg-[#faf3ed]'}`}>{date.getUTCDate()}</button></div> })}</div>)}</div>}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#eaded4] pt-3"><button type="button" disabled={!allowed(today)} onClick={() => commit(today)} className="rounded-xl bg-[#f6e5d9] px-3 py-2 text-xs font-bold text-[#a85b4e] disabled:opacity-30">{mode === 'month' ? '選擇本月' : '選擇今天'}</button>{!required && <button type="button" onClick={() => commit('')} className="rounded-xl px-3 py-2 text-xs text-[#8d7f76]">清除{mode === 'month' ? '月份' : '日期'}</button>}</div>
    </div>, host)}
  </div>
}
