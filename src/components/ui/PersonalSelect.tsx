'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'

export type PersonalSelectOption<Value extends string> = {
  value: Value
  label: string
}

type PersonalSelectProps<Value extends string> = {
  id?: string
  label?: string
  value: Value
  options: Array<PersonalSelectOption<Value>>
  onChange: (value: Value) => void
  className?: string
}

export function PersonalSelect<Value extends string>({ id, label, value, options, onChange, className = '' }: PersonalSelectProps<Value>): ReactElement {
  const generatedId = useId()
  const selectId = id ?? `personal-select-${generatedId}`
  const listboxId = `${selectId}-listbox`
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [open, setOpen] = useState(false)
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const selectedOption = options[selectedIndex] ?? options[0]

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  const focusOption = (index: number): void => {
    const nextIndex = (index + options.length) % options.length
    optionRefs.current[nextIndex]?.focus()
  }

  const handleButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(true)
      window.setTimeout(() => focusOption(selectedIndex), 0)
    }
  }

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusOption(index + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusOption(index - 1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onChange(options[index].value)
      setOpen(false)
      buttonRef.current?.focus()
    }
  }

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      {label && <label htmlFor={selectId} className="mb-2 block text-sm font-semibold text-[#695e57]">{label}</label>}
      <button ref={buttonRef} id={selectId} type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={listboxId} onClick={() => setOpen((current) => !current)} onKeyDown={handleButtonKeyDown} className="flex h-12 w-full items-center justify-between gap-3 rounded-2xl border border-[#e5d9cf] bg-[#fffdfa] px-4 text-left text-sm font-semibold text-[#695e57] outline-none transition hover:border-[#d9a59a] focus:border-[#d97568] focus:ring-4 focus:ring-[#e98a7a]/15">
        <span className="truncate">{selectedOption?.label ?? '請選擇'}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-4 w-4 shrink-0 text-[#b7655a] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>
      </button>
      {open && (
        <div id={listboxId} role="listbox" aria-label={label ?? '選項'} className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 overflow-hidden rounded-2xl border border-[#eaded4] bg-[#fffdfa] p-1.5 shadow-[0_18px_44px_rgba(112,82,62,0.16)]">
          {options.map((option, index) => <button ref={(element) => { optionRefs.current[index] = element }} key={option.value} type="button" role="option" aria-selected={option.value === value} onClick={() => { onChange(option.value); setOpen(false); buttonRef.current?.focus() }} onKeyDown={(event) => handleOptionKeyDown(event, index)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${option.value === value ? 'bg-[#f6e5d9] text-[#a85b4e]' : 'text-[#695e57] hover:bg-[#faf3ed] hover:text-[#a85b4e]'}`}>
            <span>{option.label}</span>
            {option.value === value && <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4"><path d="m5 12 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>}
          </button>)}
        </div>
      )}
    </div>
  )
}
