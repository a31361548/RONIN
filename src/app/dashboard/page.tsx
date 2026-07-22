import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/currentUser'
import { PersonalDashboard, type DashboardNote, type DashboardTodo, type DashboardUser } from '@/components/dashboard/PersonalDashboard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage(): Promise<React.ReactElement> {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/')

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const [todos, notes, checkIns, completedToday] = await Promise.all([
    prisma.todo.findMany({
      where: { userId: user.id, status: { not: 'COMPLETED' } },
      orderBy: [{ startAt: 'asc' }, { createdAt: 'desc' }],
      take: 30,
    }),
    prisma.note.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, updatedAt: true },
      take: 4,
    }),
    prisma.checkIn.findMany({
      where: { userId: user.id },
      orderBy: { date: 'desc' },
      select: { date: true },
      take: 60,
    }),
    prisma.todo.count({
      where: { userId: user.id, status: 'COMPLETED', updatedAt: { gte: startOfDay } },
    }),
  ])

  const dashboardUser: DashboardUser = {
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    coins: user.coins,
    role: user.role,
  }

  const dashboardTodos: DashboardTodo[] = todos.map((todo) => ({
    id: todo.id,
    title: todo.title,
    description: todo.description,
    status: todo.status,
    priority: todo.priority,
    recurrence: todo.recurrence,
    tagIds: todo.tagIds,
    startAt: todo.startAt.toISOString(),
    endAt: todo.endAt.toISOString(),
  }))

  const dashboardNotes: DashboardNote[] = notes.map((note) => ({
    id: note.id,
    title: note.title,
    updatedAt: note.updatedAt.toISOString(),
  }))

  return <PersonalDashboard user={dashboardUser} todos={dashboardTodos} notes={dashboardNotes} checkInDates={checkIns.map((checkIn) => checkIn.date)} completedToday={completedToday} />
}
