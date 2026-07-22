import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { PersonalNotesPage, type PersonalNote } from '@/components/notes/PersonalNotesPage'

export const dynamic = 'force-dynamic'

export default async function NotesPage(): Promise<React.ReactElement> {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/')

  const notes = await prisma.note.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' } })
  const serializedNotes: PersonalNote[] = notes.map((note) => ({
    id: note.id,
    title: note.title,
    content: note.content,
    tagIds: note.tagIds,
    updatedAt: note.updatedAt.toISOString(),
  }))

  return <PersonalNotesPage initialNotes={serializedNotes} />
}
