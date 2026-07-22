import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { PersonalCalendarPage } from '@/components/calendar/PersonalCalendarPage'

export const dynamic = 'force-dynamic'

export default async function CalendarPage(): Promise<React.ReactElement> {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/')

  const [todos, checkIns] = await Promise.all([
    prisma.todo.findMany({ where: { userId: user.id }, orderBy: { startAt: 'asc' }, take: 200 }),
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
      checkInDates={checkIns.map((checkIn) => checkIn.date)}
    />
  )
}
