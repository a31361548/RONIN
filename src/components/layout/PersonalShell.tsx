'use client'

import gsap from 'gsap'
import Image from 'next/image'
import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type FocusEvent, type ReactElement, type ReactNode } from 'react'

type IconName = 'home' | 'checklist' | 'note' | 'settings' | 'calendar' | 'users' | 'logout'

type NavItem = {
  label: string
  href: string
  icon: IconName
}

const NAV_ITEMS: NavItem[] = [
  { label: '首頁', href: '/dashboard', icon: 'home' },
  { label: '待辦事項', href: '/dashboard/todos', icon: 'checklist' },
  { label: '筆記', href: '/dashboard/notes', icon: 'note' },
  { label: '設定', href: '/dashboard/settings', icon: 'settings' },
]

type Surface = 'cream' | 'sage' | 'sky'

const SURFACE_COLORS: Record<Surface, string> = {
  cream: '#fff9f4',
  sage: '#f3f7f0',
  sky: '#f1f6fb',
}

function SidebarIcon({ name }: { name: IconName }): ReactElement {
  const commonProps = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'shrink-0',
    'aria-hidden': true,
  }

  switch (name) {
    case 'home':
      return (
        <svg {...commonProps}>
          <path d="m3.5 10.5 8.5-7 8.5 7" />
          <path d="M5.5 9.5v10h13v-10M9.5 19.5v-5h5v5" />
        </svg>
      )
    case 'checklist':
      return (
        <svg {...commonProps}>
          <path d="m4 6.5 1.5 1.5L8 5.5M11 7h9M4 12.5l1.5 1.5L8 11.5M11 13h9M4 18.5l1.5 1.5L8 17.5M11 19h9" />
        </svg>
      )
    case 'note':
      return (
        <svg {...commonProps}>
          <path d="M5 3.5h9l5 5v12H5z" />
          <path d="M14 3.5v5h5M8 13h8M8 17h5" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...commonProps}>
          <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
          <path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V4a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2.9Z" />
        </svg>
      )
    case 'calendar':
      return (
        <svg {...commonProps}>
          <rect x="4" y="5.5" width="16" height="15" rx="2" />
          <path d="M8 3.5v4M16 3.5v4M4 10h16M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" />
        </svg>
      )
    case 'users':
      return (
        <svg {...commonProps}>
          <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM16 5.5a3 3 0 0 1 0 5.8M17 15.1a3.5 3.5 0 0 1 3 3.4V20" />
        </svg>
      )
    case 'logout':
      return (
        <svg {...commonProps}>
          <path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10M14 8l4 4-4 4M9 12h9" />
        </svg>
      )
  }
}

function UserAvatar({ name, avatar, size = 'md' }: { name: string; avatar?: string | null; size?: 'sm' | 'md' }) {
  const [imageFailed, setImageFailed] = useState(false)
  const sizeClass = size === 'sm' ? 'h-9 w-9 text-sm' : 'h-11 w-11 text-base'

  useEffect(() => {
    setImageFailed(false)
  }, [avatar])

  if (avatar && !imageFailed) {
    return <img src={avatar} alt="" onError={() => setImageFailed(true)} className={`${sizeClass} rounded-full object-cover`} />
  }

  return (
    <span className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-[#f3d8c8] font-bold text-[#a85b4e]`}>
      {name.slice(0, 1)}
    </span>
  )
}

export function PersonalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const user = session?.user
  const displayName = user?.name || user?.email?.split('@')[0] || '使用者'
  const isAdmin = user?.role === 'ADMIN'
  const sidebarRef = useRef<HTMLElement>(null)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [surface, setSurface] = useState<Surface>('cream')

  useEffect(() => {
    const savedSurface = window.localStorage.getItem('riyu-surface')
    if (savedSurface === 'cream' || savedSurface === 'sage' || savedSurface === 'sky') setSurface(savedSurface)

    const handleSurfaceChange = (event: Event) => {
      const nextSurface = (event as CustomEvent<string>).detail
      if (nextSurface === 'cream' || nextSurface === 'sage' || nextSurface === 'sky') setSurface(nextSurface)
    }
    window.addEventListener('riyu-surface-change', handleSurfaceChange)
    return () => window.removeEventListener('riyu-surface-change', handleSurfaceChange)
  }, [])

  useEffect(() => {
    const sidebar = sidebarRef.current
    if (!sidebar) return

    const context = gsap.context(() => {
      const brandCopy = sidebar.querySelector<HTMLElement>('[data-sidebar-brand-copy]')
      const navLabels = sidebar.querySelectorAll<HTMLElement>('[data-sidebar-label]')
      const actionLabels = sidebar.querySelectorAll<HTMLElement>('[data-sidebar-action-label]')
      const timeline = gsap.timeline({ defaults: { ease: 'power2.out' } })

      timeline
        .addLabel('sidebar')
        .to(sidebar, { width: sidebarExpanded ? '16rem' : '6rem', duration: 0.34 }, 'sidebar')

      if (brandCopy) {
        timeline.to(brandCopy, { autoAlpha: sidebarExpanded ? 1 : 0, maxWidth: sidebarExpanded ? '12rem' : '0rem', x: sidebarExpanded ? 0 : -10, duration: 0.22 }, 'sidebar+=0.06')
      }
      if (navLabels.length > 0) {
        timeline.to(navLabels, { autoAlpha: sidebarExpanded ? 1 : 0, maxWidth: sidebarExpanded ? '10rem' : '0rem', x: sidebarExpanded ? 0 : -8, duration: 0.2, stagger: 0.025 }, '<0.02')
      }
      if (actionLabels.length > 0) {
        timeline.to(actionLabels, { autoAlpha: sidebarExpanded ? 1 : 0, maxWidth: sidebarExpanded ? '12rem' : '0rem', x: sidebarExpanded ? 0 : -8, duration: 0.2, stagger: 0.025 }, '<')
      }
    }, sidebar)

    return () => context.revert()
  }, [sidebarExpanded])

  const handleSidebarFocus = () => setSidebarExpanded(true)
  const handleSidebarBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget)) setSidebarExpanded(false)
  }

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' })
  }

  return (
    <div className="min-h-screen font-sans text-[#2e2a28]" style={{ backgroundColor: SURFACE_COLORS[surface] }}>
      <aside
        ref={sidebarRef}
        data-testid="sidebar"
        data-expanded={sidebarExpanded}
        aria-label="側邊導覽，滑入可展開"
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
        onFocusCapture={handleSidebarFocus}
        onBlurCapture={handleSidebarBlur}
        className="fixed inset-y-0 left-0 z-40 hidden w-24 flex-col overflow-hidden border-r border-[#eaded4] bg-[#fffdfa] px-3 py-6 shadow-[10px_0_32px_rgba(112,82,62,0.06)] will-change-[width] lg:flex"
      >
        <Link href="/dashboard" className={`flex shrink-0 items-center gap-3 ${sidebarExpanded ? 'justify-start' : 'justify-center'}`} aria-label="回到日隅首頁">
          <Image src="/image/brand/riyu-mark.png" alt="日隅" width={48} height={48} className="h-12 w-12 shrink-0 object-contain" priority />
          <span data-sidebar-brand-copy aria-hidden={!sidebarExpanded} className="max-w-0 min-w-0 overflow-hidden whitespace-nowrap opacity-0">
            <span className="block text-xl font-bold tracking-[0.12em]">日隅</span>
            <span className="block text-xs font-medium tracking-[0.12em] text-[#8d7f76]">個人記事與提醒</span>
          </span>
        </Link>

        <nav className="mt-12 space-y-2" aria-label="主要導覽">
          {NAV_ITEMS.map((item) => {
            const active = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} aria-label={item.label} title={item.label} className={`group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition ${sidebarExpanded ? 'justify-start px-4' : 'justify-center'} ${active ? 'bg-[#f6e5d9] text-[#a85b4e]' : 'text-[#776e68] hover:bg-[#faf0e8] hover:text-[#2e2a28]'}`}>
                <SidebarIcon name={item.icon} />
                <span data-sidebar-label aria-hidden={!sidebarExpanded} className="inline-block max-w-0 overflow-hidden whitespace-nowrap opacity-0">{item.label}</span>
              </Link>
            )
          })}
          <Link href="/dashboard/calendar" aria-current={pathname === '/dashboard/calendar' ? 'page' : undefined} title="月曆" aria-label="月曆" className={`group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition ${sidebarExpanded ? 'justify-start px-4' : 'justify-center'} ${pathname === '/dashboard/calendar' ? 'bg-[#f6e5d9] text-[#a85b4e]' : 'text-[#776e68] hover:bg-[#faf0e8] hover:text-[#2e2a28]'}`}>
            <SidebarIcon name="calendar" />
            <span data-sidebar-label aria-hidden={!sidebarExpanded} className="inline-block max-w-0 overflow-hidden whitespace-nowrap opacity-0">月曆</span>
          </Link>
        </nav>

        <div className="mt-auto space-y-4">
          {isAdmin && (
            <Link href="/admin/members" title="會員管理" aria-label="會員管理" className={`flex items-center gap-3 rounded-2xl border border-[#e8c5b7] px-3 py-3 text-sm font-semibold text-[#a85b4e] transition hover:bg-[#fff1eb] ${sidebarExpanded ? 'justify-start px-4' : 'justify-center'}`}>
              <SidebarIcon name="users" />
              <span data-sidebar-action-label aria-hidden={!sidebarExpanded} className="inline-block max-w-0 overflow-hidden whitespace-nowrap opacity-0">會員管理</span>
            </Link>
          )}
          <div className={`flex items-center gap-3 rounded-2xl bg-[#f8efe8] p-3 ${sidebarExpanded ? '' : 'justify-center'}`}>
            <UserAvatar name={displayName} avatar={user?.avatar} size="sm" />
            <div data-sidebar-action-label aria-hidden={!sidebarExpanded} className="min-w-0 max-w-0 overflow-hidden whitespace-nowrap opacity-0">
              <p className="truncate text-sm font-semibold">{displayName}</p>
              <p className="truncate text-xs text-[#8d7f76]">私人工作區</p>
            </div>
          </div>
          <button type="button" onClick={handleSignOut} title="登出" aria-label="登出" className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold text-[#8d7f76] transition hover:bg-[#faf0e8] hover:text-[#a85b4e] ${sidebarExpanded ? 'justify-start px-4' : 'justify-center'}`}>
            <SidebarIcon name="logout" />
            <span data-sidebar-action-label aria-hidden={!sidebarExpanded} className="inline-block max-w-0 overflow-hidden whitespace-nowrap opacity-0">登出</span>
          </button>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-24">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#eaded4]/80 px-5 backdrop-blur sm:px-8 lg:px-10" style={{ backgroundColor: SURFACE_COLORS[surface] }}>
          <div className="flex items-center gap-3 lg:hidden">
            <Image src="/image/brand/riyu-mark.png" alt="日隅" width={38} height={38} className="h-9 w-9 object-contain" />
            <span className="text-lg font-bold tracking-[0.12em]">日隅</span>
          </div>
          <p className="hidden text-sm font-medium text-[#8d7f76] lg:block">滑入左側導覽即可展開。</p>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-semibold text-[#776e68] sm:block">{displayName}</span>
            <UserAvatar name={displayName} avatar={user?.avatar} />
          </div>
        </header>

        <main className="px-5 pb-28 pt-8 sm:px-8 lg:px-10 lg:pb-12">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>

        <nav className="fixed inset-x-4 bottom-4 z-40 grid grid-cols-4 rounded-3xl border border-[#eaded4] bg-[#fffdfa]/95 p-2 shadow-[0_18px_48px_rgba(112,82,62,0.14)] backdrop-blur lg:hidden" aria-label="手機主要導覽">
          {NAV_ITEMS.map((item) => {
            const active = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold transition ${active ? 'bg-[#f6e5d9] text-[#a85b4e]' : 'text-[#8d7f76]'}`}>
                <SidebarIcon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
