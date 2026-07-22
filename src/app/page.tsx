import Image from 'next/image'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { LoginIllustration } from '@/components/LoginIllustration'
import { LoginView } from '@/components/LoginView'
import { authOptions } from '@/lib/authOptions'

export default async function Home() {
  const session = await getServerSession(authOptions)

  if (session) {
    redirect('/dashboard')
  }

  return (
    <main className="relative z-[60] min-h-screen overflow-hidden bg-[#fff9f4] px-5 py-8 text-[#2e2a28] font-sans sm:px-8 lg:px-12">
      <div className="absolute inset-x-0 top-0 h-1 bg-[#e98a7a]" aria-hidden="true" />

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center">
        <div className="grid w-full gap-12 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center lg:gap-24">
          <section className="relative max-w-xl lg:min-h-[530px]">
            <LoginIllustration />

            <div className="relative z-10">
              <div className="mb-8 flex items-center gap-5">
                <Image
                  src="/image/brand/riyu-mark.png"
                  alt="日隅 Logo"
                  width={104}
                  height={104}
                  priority
                  className="h-24 w-24 object-contain sm:h-28 sm:w-28"
                />
                <div>
                  <p className="mb-1 text-sm font-semibold tracking-[0.2em] text-[#8d7f76]">個人記事與提醒</p>
                  <h1 className="text-4xl font-bold tracking-[0.12em] text-[#2e2a28] sm:text-5xl">日隅</h1>
                </div>
              </div>

              <p className="max-w-lg text-3xl font-bold leading-tight tracking-tight text-[#2e2a28] sm:text-5xl">
                把今天的事情，放在一個剛剛好的角落。
              </p>
              <p className="mt-6 max-w-md text-base leading-8 text-[#776e68] sm:text-lg">
                日隅是你的私人記事與提醒工作區。記下想法、整理待辦，讓每一天都更容易開始。
              </p>

              <div className="mt-10 flex flex-wrap gap-3 text-sm font-semibold text-[#695e57]">
                <span className="rounded-full bg-[#f3e7dc] px-4 py-2">記下想法</span>
                <span className="rounded-full bg-[#e5efe2] px-4 py-2">安排今天</span>
                <span className="rounded-full bg-[#e5eef3] px-4 py-2">保留自己的節奏</span>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-[#eaded4] bg-[#fffdfa] p-6 shadow-[0_24px_70px_rgba(112,82,62,0.12)] sm:p-9">
            <div className="mb-8">
              <p className="mb-2 text-sm font-semibold tracking-[0.18em] text-[#c96b61]">歡迎回來</p>
              <h2 className="text-3xl font-bold tracking-tight text-[#2e2a28]">登入你的日隅</h2>
              <p className="mt-3 text-sm leading-6 text-[#776e68]">從今天開始，把重要的事放在心上，也放在這裡。</p>
            </div>
            <LoginView />
          </section>
        </div>
      </div>
    </main>
  )
}
