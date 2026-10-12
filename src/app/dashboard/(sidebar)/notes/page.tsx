import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function NotesPage(): Promise<React.ReactElement> {
  redirect('/dashboard/calendar')
}
