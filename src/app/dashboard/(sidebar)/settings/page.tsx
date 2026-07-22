import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { PersonalSettingsPage } from '@/components/settings/PersonalSettingsPage'

export const dynamic = 'force-dynamic'

export default async function SettingsPage(): Promise<React.ReactElement> {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/')

  return (
    <PersonalSettingsPage
      user={{
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        coins: user.coins,
      }}
    />
  )
}
