import { prisma } from '@/lib/prisma'
import { verifyPassword } from '@/lib/password'
import type { NextAuthOptions } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import type { MemberStatus, Role } from '@prisma/client'

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: '/' },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = await prisma.user.findUnique({ where: { email: credentials.email } })
        if (!user) return null
        if (user.status !== 'ACTIVE') return null
        const ok = verifyPassword(credentials.password, user.password)
        if (!ok) return null
        return { 
          id: user.id, 
          email: user.email, 
          name: user.name ?? undefined, 
          role: user.role, 
          status: user.status,
          avatar: user.avatar,
          coins: user.coins ?? 0
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = (user as { role: Role }).role ?? 'MEMBER'
        token.status = (user as { status: MemberStatus }).status ?? 'ACTIVE'
        token.avatar = (user as { avatar?: string | null }).avatar
        token.coins = (user as { coins: number }).coins ?? 0
      } else if (token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { role: true, status: true, avatar: true, coins: true }
        })
        if (dbUser) {
          token.role = dbUser.role
          token.status = dbUser.status
          token.avatar = dbUser.avatar
          token.coins = dbUser.coins
        }
      }
      if (trigger === 'update' && session?.avatar) {
        token.avatar = session.avatar
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as Role | undefined) ?? 'MEMBER'
        session.user.status = (token.status as MemberStatus | undefined) ?? 'ACTIVE'
        session.user.avatar = (token.avatar as string | null | undefined)
        session.user.coins = (token.coins as number | undefined) ?? 0
      }
      return session
    }
  }
}
