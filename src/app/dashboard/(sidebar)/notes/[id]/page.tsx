import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ id: string }> }

export default async function NoteDetailPage({ params }: PageProps): Promise<React.ReactElement> {
  const { id } = await params
  redirect(`/dashboard/calendar?entry=${encodeURIComponent(id)}`)
}
