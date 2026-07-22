import { ReactNode } from 'react'
import { PersonalShell } from '@/components/layout/PersonalShell'

export default function DashboardRootLayout({ children }: { children: ReactNode }) {
  return <PersonalShell>{children}</PersonalShell>
}
