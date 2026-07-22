import { ReactNode } from 'react'
import type { Metadata } from 'next'
import './globals.css'
import './personal-overrides.css'
import { Providers } from '@/components/Providers'

const brandIcon = '/image/brand/riyu-mark.png?v=2'

export const metadata: Metadata = {
  title: '日隅｜個人記事與提醒',
  description: '整理今天，也留住想法的私人記事與提醒工作區。',
  icons: {
    icon: [{ url: brandIcon, type: 'image/png' }],
    shortcut: [brandIcon],
  },
}

export default function RootLayout({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <html lang="zh-Hant">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&family=Quicksand:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-[#fff9f4] text-[#2e2a28] font-sans overflow-x-hidden">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
