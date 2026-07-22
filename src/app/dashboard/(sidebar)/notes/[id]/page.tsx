import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { PersonalNoteDetailPage } from '@/components/notes/PersonalNoteDetailPage'

export const dynamic = 'force-dynamic'

type PageProps = { params: Promise<{ id: string }> }

export default async function NoteDetailPage({ params }: PageProps): Promise<React.ReactElement> {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/')
  const { id } = await params
  const note = await prisma.note.findFirst({ where: { id, userId: user.id } })
  if (!note) notFound()
  return <PersonalNoteDetailPage initialNote={{ id: note.id, title: note.title, content: note.content, tagIds: note.tagIds }} />
}
