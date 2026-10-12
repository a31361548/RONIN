import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { PersonalFinancePage } from '@/components/finance/PersonalFinancePage'

export const dynamic = 'force-dynamic'
export default async function FinancePage(): Promise<React.ReactElement> {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/')
  return <PersonalFinancePage />
}
