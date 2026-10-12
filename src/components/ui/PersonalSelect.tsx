'use client'

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactElement } from 'react'
import { createPortal } from 'react-dom'

export type PersonalSelectOption<Value extends string> = { value: Value; label: string; description?: string; disabled?: boolean }
type BaseProps<Value extends string> = {
  id?: string
  name?: string
  label?: string
  ariaLabel?: string
  description?: string
  options: ReadonlyArray<PersonalSelectOption<Value>>
  placeholder?: string
  disabled?: boolean
  required?: boolean
  searchable?: boolean
  className?: string
  size?: 'default' | 'compact'
  variant?: 'personal' | 'tech'
}
export type PersonalSelectProps<Value extends string> = BaseProps<Value> & (
  | { multiple?: false; value: Value; onChange: (value: Value) => void }
  | { multiple: true; value: Value[]; onChange: (value: Value[]) => void }
)

export function PersonalSelect<Value extends string>(props: PersonalSelectProps<Value>): ReactElement {
  const { id, name, label, ariaLabel, description, options, placeholder = '請選擇', disabled = false, required = false, searchable, className = '', size = 'default', variant = 'personal' } = props
  const generatedId = useId()
  const selectId = id ?? `personal-select-${generatedId}`
  const listboxId = `${selectId}-listbox`
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const focusOnOpen = useRef<'search' | 'first' | 'last'>('first')
  const typeahead = useRef({ text: '', at: 0 })
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [position, setPosition] = useState<CSSProperties>({})
  const selectedValues = props.multiple ? props.value : [props.value]
  const selected = options.filter((option) => selectedValues.includes(option.value))
  const filtered = options.filter((option) => `${option.label} ${option.description ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const showSearch = searchable ?? (props.multiple || options.length > 8)
  const accessibleLabel = ariaLabel ?? label ?? '選項'
  const tech = variant === 'tech'

  const close = (restoreFocus = false): void => { setOpen(false); if (restoreFocus) buttonRef.current?.focus() }
  const reveal = (focus: 'search' | 'first' | 'last' = showSearch ? 'search' : 'first'): void => {
    if (buttonRef.current?.matches(':disabled')) return
    focusOnOpen.current = focus
    setQuery('')
    // Preserve modal focus boundaries, with fixed positioning outside scrolling content.
    setHost(buttonRef.current?.closest<HTMLElement>('[data-personal-modal]') ?? document.body)
    setOpen(true)
  }
  const focusOption = (index: number, direction = 1): void => {
    for (let step = 0; step < filtered.length; step++) {
      const next = (index + step * direction + filtered.length) % filtered.length
      if (!filtered[next]?.disabled) { optionRefs.current[next]?.focus(); return }
    }
    searchRef.current?.focus()
  }
  const select = (option: PersonalSelectOption<Value>): void => {
    if (option.disabled || buttonRef.current?.matches(':disabled')) return
    setInvalid(false)
    if (props.multiple) props.onChange(props.value.includes(option.value) ? props.value.filter((value) => value !== option.value) : [...props.value, option.value])
    else { props.onChange(option.value); close(true) }
  }

  useEffect(() => {
    if (!open) return
    const place = (): void => {
      const anchor = buttonRef.current
      if (!anchor || anchor.matches(':disabled')) { setOpen(false); return }
      const rect = anchor.getBoundingClientRect()
      const viewport = window.visualViewport
      const leftEdge = viewport?.offsetLeft ?? 0
      const topEdge = viewport?.offsetTop ?? 0
      const width = viewport?.width ?? window.innerWidth
      const height = viewport?.height ?? window.innerHeight
      if (rect.bottom < topEdge || rect.top > topEdge + height) { setOpen(false); return }
      const below = topEdge + height - rect.bottom - 20
      const above = rect.top - topEdge - 20
      const upwards = below < 240 && above > below
      const panelWidth = Math.min(Math.max(rect.width, 240), width - 24)
      setPosition({ left: Math.max(leftEdge + 12, Math.min(rect.left, leftEdge + width - panelWidth - 12)), width: panelWidth, top: upwards ? rect.top - 8 : rect.bottom + 8, transform: upwards ? 'translateY(-100%)' : undefined, maxHeight: Math.max(80, Math.min(380, upwards ? above : below)) })
    }
    place()
    const frame = window.requestAnimationFrame(() => {
      const initial = options.findIndex((option) => selectedValues.includes(option.value) && !option.disabled)
      if (focusOnOpen.current === 'search' && searchRef.current) searchRef.current.focus()
      else if (focusOnOpen.current === 'last') focusOption(filtered.length - 1, -1)
      else focusOption(Math.max(0, initial))
      optionRefs.current[Math.max(0, initial)]?.scrollIntoView({ block: 'nearest' })
    })
    const outside = (event: Event): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false)
    }
    const scroll = (event: Event): void => { if (!(event.target instanceof Node) || !panelRef.current?.contains(event.target)) place() }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', place)
    window.visualViewport?.addEventListener('resize', place)
    window.visualViewport?.addEventListener('scroll', place)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', place)
      window.visualViewport?.removeEventListener('resize', place)
      window.visualViewport?.removeEventListener('scroll', place)
    }
    // Initial selection is read when opening; multiple selection retains focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleKey = (event: KeyboardEvent<HTMLElement>, index?: number): void => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
    if (event.key === 'Tab') { close(true); return }
    const typing = event.target === searchRef.current
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      focusOption(index === undefined ? direction > 0 ? 0 : filtered.length - 1 : index + direction, direction)
    } else if (!typing && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault(); focusOption(event.key === 'Home' ? 0 : filtered.length - 1, event.key === 'Home' ? 1 : -1)
    } else if (!typing && event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now()
      const text = (now - typeahead.current.at < 700 ? typeahead.current.text : '') + event.key.toLocaleLowerCase()
      typeahead.current = { text, at: now }
      const match = filtered.findIndex((option) => !option.disabled && option.label.toLocaleLowerCase().startsWith(text))
      if (match >= 0) { event.preventDefault(); focusOption(match) }
    } else if (typing && event.key === 'Enter') { event.preventDefault(); const option = filtered.find((item) => !item.disabled); if (option) select(option) }
  }

  return <div ref={rootRef} className={`relative min-w-0 ${className}`}>
    {label && <label htmlFor={selectId} className="mb-2 block text-sm font-semibold text-[#695e57]">{label}</label>}
    <button ref={buttonRef} id={selectId} type="button" role="combobox" aria-label={ariaLabel ?? label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listboxId : undefined} aria-required={required || undefined} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${selectId}-error` : description ? `${selectId}-description` : undefined} disabled={disabled} onClick={() => open ? close() : reveal()} onKeyDown={(event) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); if (!open) reveal(event.key === 'ArrowUp' ? 'last' : event.key === 'ArrowDown' ? 'first' : showSearch ? 'search' : 'first') }
      else if (open) handleKey(event)
    }} className={`flex w-full items-center justify-between gap-2 rounded-2xl border px-3 text-left text-sm font-medium outline-none transition disabled:cursor-not-allowed disabled:opacity-50 ${size === 'compact' ? 'min-h-10 py-2' : 'min-h-11 py-2.5'} ${tech ? 'border-samurai-blue/30 bg-samurai-dark font-tech text-samurai-blue focus:ring-2 focus:ring-samurai-blue/30' : `bg-[#fffdfa] text-[#695e57] hover:border-[#d9a59a] focus:border-[#d97568] focus:ring-4 focus:ring-[#e98a7a]/15 ${open || invalid ? 'border-[#d97568]' : 'border-[#e5d9cf]'}`}`}>
      {props.multiple && selected.length ? <span className="flex min-w-0 flex-wrap items-center gap-1.5">{selected.slice(0, 2).map((option) => <span key={option.value} className={`max-w-36 truncate rounded-lg px-2 py-0.5 text-xs font-semibold ${tech ? 'bg-samurai-blue/15' : 'bg-[#f6e5d9] text-[#a85b4e]'}`}>{option.label}</span>)}{selected.length > 2 && <span className="text-xs">＋{selected.length - 2}</span>}</span> : <span className={`truncate ${!selected.length ? 'opacity-60' : ''}`}>{selected[0]?.label ?? placeholder}</span>}
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-4 w-4 shrink-0 opacity-70 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>
    </button>
    {description && <p id={`${selectId}-description`} className="mt-1 text-xs font-normal text-[#8d7f76]">{description}</p>}
    {invalid && <p id={`${selectId}-error`} role="alert" className="mt-1 text-xs text-[#a85b4e]">請選擇至少一個選項。</p>}
    {name && selectedValues.map((value) => <input key={value} type="hidden" name={name} value={value} disabled={disabled} />)}
    {required && <input aria-hidden="true" tabIndex={-1} required disabled={disabled} value={selected.length ? 'selected' : ''} onChange={() => undefined} onInvalid={(event) => { event.preventDefault(); setInvalid(true); buttonRef.current?.focus() }} className="pointer-events-none absolute h-px w-px opacity-0" />}
    {open && host && createPortal(<div ref={panelRef} style={position} onKeyDown={(event) => handleKey(event)} className={`fixed z-[110] flex flex-col overflow-hidden rounded-2xl border p-1.5 shadow-[0_16px_48px_rgba(74,55,43,0.18)] ${tech ? 'border-samurai-blue/40 bg-samurai-dark text-samurai-blue' : 'border-[#eaded4] bg-[#fffdfa] text-[#695e57]'}`}>
      {showSearch && <div className="shrink-0 p-1.5"><input ref={searchRef} type="search" aria-label={`搜尋${accessibleLabel}`} placeholder="搜尋選項⋯" value={query} onChange={(event) => { event.stopPropagation(); setQuery(event.target.value) }} className={`h-10 w-full rounded-xl border px-3 text-sm font-normal outline-none focus:border-[#d97568] ${tech ? 'border-samurai-blue/30 bg-samurai-blue/5' : 'border-[#eaded4] bg-[#faf6f1]'}`} /></div>}
      <div id={listboxId} role="listbox" aria-label={accessibleLabel} aria-multiselectable={props.multiple || undefined} className="min-h-0 overflow-y-auto overscroll-contain p-0.5">
        {filtered.map((option, index) => {
          const isSelected = selectedValues.includes(option.value)
          return <button ref={(element) => { optionRefs.current[index] = element }} key={option.value} type="button" role="option" tabIndex={-1} disabled={option.disabled} aria-selected={isSelected} onClick={() => select(option)} onKeyDown={(event) => { handleKey(event, index); event.stopPropagation() }} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-40 ${tech ? 'hover:bg-samurai-blue/10 focus:bg-samurai-blue/20' : isSelected ? 'bg-[#f6e5d9] text-[#a85b4e] focus:ring-2 focus:ring-inset focus:ring-[#d9a59a]' : 'hover:bg-[#faf3ed] focus:bg-[#faf3ed] focus:ring-2 focus:ring-inset focus:ring-[#eaded4]'}`}>
            {props.multiple && <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isSelected ? tech ? 'border-samurai-blue bg-samurai-blue text-white' : 'border-[#d97568] bg-[#d97568] text-white' : 'border-current opacity-40'}`}>{isSelected && <svg viewBox="0 0 24 24" className="h-3 w-3"><path d="m5 12 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="2.5" /></svg>}</span>}
            <span className="min-w-0 flex-1"><span className="block break-words font-medium">{option.label}</span>{option.description && <span className="mt-0.5 block text-xs opacity-70">{option.description}</span>}</span>
            {!props.multiple && isSelected && <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0"><path d="m5 12 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>}
          </button>
        })}
        {!filtered.length && <p role="status" className="px-3 py-6 text-center text-sm opacity-60">{options.length ? '找不到符合的選項' : '目前沒有選項'}</p>}
      </div>
      {props.multiple && <div className={`mt-1 flex shrink-0 items-center justify-between gap-3 border-t px-2 pt-2 pb-1 text-xs ${tech ? 'border-samurai-blue/20' : 'border-[#eaded4]'}`}><button type="button" disabled={disabled || !props.value.length} onClick={() => { if (!buttonRef.current?.matches(':disabled')) { props.onChange([]); setInvalid(false) } }} className="rounded-lg px-2 py-2 font-medium opacity-70 hover:opacity-100 disabled:opacity-30">清除選取</button><span aria-live="polite">已選 {selected.length} 項</span><button type="button" onClick={() => close(true)} className={`rounded-lg px-3 py-2 font-semibold ${tech ? 'bg-samurai-blue/15' : 'bg-[#f6e5d9] text-[#a85b4e]'}`}>完成</button></div>}
    </div>, host)}
  </div>
}
