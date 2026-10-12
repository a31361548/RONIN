import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { PersonalCalendarPage } from '@/components/calendar/PersonalCalendarPage'

export const dynamic = 'force-dynamic'

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ entry?: string }> }): Promise<React.ReactElement> {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/')

  const [todos, notes, query, checkIns] = await Promise.all([
    prisma.todo.findMany({ where: { userId: user.id }, orderBy: { startAt: 'asc' } }),
    prisma.note.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' } }),
    searchParams,
    prisma.checkIn.findMany({ where: { userId: user.id }, orderBy: { date: 'desc' }, select: { date: true }, take: 200 }),
  ])

  return (
    <PersonalCalendarPage
      todos={todos.map((todo) => ({
        id: todo.id,
        title: todo.title,
        description: todo.description,
        status: todo.status,
        startAt: todo.startAt.toISOString(),
        endAt: todo.endAt.toISOString(),
      }))}
      initialNoteId={query.entry}
      checkInDates={checkIns.map((checkIn) => checkIn.date)}
      notes={notes.map((note) => ({ id: note.id, title: note.title, content: note.content, tagIds: note.tagIds, noteDate: note.noteDate ?? null, startAt: note.startAt?.toISOString() ?? null, endAt: note.endAt?.toISOString() ?? null, updatedAt: note.updatedAt.toISOString() }))}
    />
  )
}
