import type { ReactNode } from 'react'
import { PersonalShell } from '@/components/layout/PersonalShell'

export default function AdminLayout({ children }: { children: ReactNode }): React.ReactElement {
  return <PersonalShell>{children}</PersonalShell>
}
