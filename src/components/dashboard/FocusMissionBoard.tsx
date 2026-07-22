'use client'

import { useMemo, useCallback, useRef, type ReactElement } from 'react'
import Link from 'next/link'
import type { Todo } from '@/types/todo'
import { TechButton } from '@/components/ui/TechButton'
import { useTodosCountdown } from '@/hooks/useTodosCountdown'
import { formatDuration, type CountdownPhase } from '@/lib/todoTime'
import { updateTodoStatus } from '@/lib/todoActions'
import { useAuxiliary } from '@/context/AuxiliaryContext'
import { CheckInCalendar } from '@/components/CheckInCalendar'

type FocusMissionBoardProps = {
  todos: Todo[]
  user: {
    name: string | null
    coins: number | null
  }
  completedCount?: number
}

export function FocusMissionBoard({ todos, user, completedCount = 0 }: FocusMissionBoardProps): ReactElement {
  const { toggleView } = useAuxiliary()
  const autoStatusRef = useRef<Set<string>>(new Set())

  // Handle auto-start logic
  const handlePhaseChange = useCallback((todo: Todo, phase: CountdownPhase) => {
    if (phase === 'ACTIVE' && todo.status === 'NOT_STARTED' && !autoStatusRef.current.has(todo.id)) {
      autoStatusRef.current.add(todo.id)
      updateTodoStatus(todo.id, 'IN_PROGRESS').finally(() => {
        autoStatusRef.current.delete(todo.id)
      })
    }
  }, [])

  const countdownEntries = useTodosCountdown(todos, { onPhaseChange: handlePhaseChange })
  const countdownMap = useMemo(() => new Map(countdownEntries.map((entry) => [entry.todo.id, entry])), [countdownEntries])

  // Filter tasks
  const activeTask = todos.find(t => t.status === 'IN_PROGRESS')
  const activeCountdown = activeTask ? countdownMap.get(activeTask.id) : null
  
  const upcomingTasks = todos.filter(t => t.status === 'NOT_STARTED').slice(0, 5) // Limit to 5
  // const completedCount = todos.filter(t => t.status === 'COMPLETED').length

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* HUD Header */}
      <header className="flex items-center justify-between border-b border-samurai-blue/20 pb-4">
        <div>
          <h1 className="font-pixel text-2xl text-samurai-blue tracking-widest uppercase">
            任務中樞
          </h1>
          <p className="font-tech text-xs text-samurai-text/50 tracking-[0.3em]">
            操作者：{user.name || '未知'} ／／ 代幣：{user.coins ?? 0}
          </p>
        </div>
        <div className="flex gap-2">
           <TechButton variant="ghost" className="!px-3 !py-1 text-xs" onClick={() => toggleView('SYSTEM_STATUS')}>
             系統面板
           </TechButton>
           <Link href="/dashboard/todos">
             <TechButton variant="secondary" className="!px-3 !py-1 text-xs">
               全部任務
             </TechButton>
           </Link>
        </div>
      </header>

      {/* Three-Column Layout: Mission | Queue | Status+CheckIn */}
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr_1fr]">
        {/* Column 1: Active Mission Focus */}
        <section className="lg:row-span-2">
          {activeTask && activeCountdown ? (
            <div className="relative overflow-hidden rounded-[32px] border-2 border-samurai-red/50 bg-gradient-to-br from-samurai-red/10 to-samurai-dim p-8 shadow-[0_0_50px_rgba(244,63,94,0.15)] group h-full">
               {/* Background Effects */}
               <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(244,63,94,0.1),transparent_70%)] opacity-50" />
               <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-100 transition-opacity text-samurai-red">
                  <span className="text-4xl">⚔</span>
               </div>

               <div className="relative z-10 flex flex-col items-center justify-center text-center space-y-6 h-full">
                  <div className="space-y-2">
                      <span className="inline-block rounded-full bg-samurai-red/20 px-3 py-1 text-xs font-bold text-samurai-red animate-pulse">
                        進行中
                      </span>
                    <h2 className="font-heading text-2xl lg:text-4xl text-white drop-shadow-[0_0_10px_rgba(244,63,94,0.5)] leading-tight">
                      {activeTask.title}
                    </h2>
                    {activeTask.description && (
                      <p className="text-samurai-text/70 max-w-md mx-auto text-sm">{activeTask.description}</p>
                    )}
                  </div>

                  {/* Big Countdown */}
                  <div className="font-mono text-5xl lg:text-7xl text-white tracking-wider tabular-nums text-shadow-red">
                    {formatDuration(activeCountdown.endsIn)}
                  </div>
                  
                  <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-samurai-red shadow-[0_0_10px_rgba(244,63,94,0.7)] animate-pulse w-full" />
                  </div>

                  <div className="flex gap-4 pt-4">
                     <TechButton variant="secondary" onClick={() => updateTodoStatus(activeTask.id, 'COMPLETED')}>
                       完成任務
                     </TechButton>
                     <TechButton variant="danger" onClick={() => toggleView('QUICK_NOTE', activeTask)}>
                       記錄備註
                     </TechButton>
                  </div>
               </div>
            </div>
          ) : (
            <div className="relative flex flex-col items-center justify-center rounded-[32px] border border-dashed border-white/20 bg-white/5 p-12 text-center h-full min-h-[400px]">
              <div className="text-6xl mb-4 opacity-50 grayscale">💤</div>
              <h2 className="font-pixel text-xl text-white/80 uppercase tracking-widest">待命狀態</h2>
              <p className="mt-2 text-white/50 mb-8 text-sm">目前沒有進行中的任務。</p>
              {upcomingTasks.length > 0 ? (
                <TechButton variant="primary" onClick={() => updateTodoStatus(upcomingTasks[0].id, 'IN_PROGRESS')}>
                  啟動下一個任務
                </TechButton>
              ) : (
                <Link href="/dashboard/todos">
                  <TechButton variant="ghost">建立新任務</TechButton>
                </Link>
              )}
            </div>
          )}
        </section>

        {/* Column 2: Upcoming Queue */}
        <section className="space-y-4 lg:col-span-2 lg:col-start-2 lg:row-start-1">
            <div className="flex items-center justify-between">
              <h3 className="font-pixel text-sm text-white/80 uppercase tracking-widest">即將開始</h3>
              <span className="text-xs font-tech text-white/40 tracking-[0.2em]">{upcomingTasks.length} 筆待命</span>
           </div>

           <div className="grid gap-2 lg:grid-cols-2">
             {upcomingTasks.length > 0 ? (
               upcomingTasks.map(task => {
                 const cd = countdownMap.get(task.id)
                 return (
                   <div key={task.id} className="group relative rounded-xl border border-white/10 bg-black/40 p-3 transition-all hover:border-samurai-blue/50 hover:bg-samurai-blue/5">
                     <div className="flex justify-between items-start">
                       <div className="min-w-0 flex-1">
                         <h4 className="font-medium text-white group-hover:text-samurai-blue transition-colors text-sm truncate">
                           {task.title}
                         </h4>
                         <p className="text-xs text-white/40 font-mono mt-1">
                           {cd ? formatDuration(cd.startsIn) : '--:--:--'}
                         </p>
                       </div>
                       <button 
                         className="opacity-0 group-hover:opacity-100 p-1 hover:text-samurai-blue transition-all flex-shrink-0"
                         onClick={() => updateTodoStatus(task.id, 'IN_PROGRESS')}
                          title="立即開始"
                        >
                          ▶
                       </button>
                     </div>
                   </div>
                 )
               })
             ) : (
                <div className="text-center py-6 text-white/30 text-sm font-tech tracking-widest lg:col-span-2">
                  目前沒有待命任務
                </div>
             )}
           </div>
        </section>

        {/* Column 3: PILOT STATUS Panel */}
        <section className="lg:col-start-2 lg:row-start-2">
           <div className="relative h-full overflow-hidden rounded-[28px] border border-samurai-blue/20 bg-samurai-dark/50 p-4">
              {/* Decorative Header Line */}
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-samurai-blue/50 to-transparent" />
              
              <div className="relative z-10">
                 <div className="flex items-center justify-between mb-3">
                     <div className="font-tech text-xs uppercase tracking-widest text-samurai-blue/70">
                        操作狀態
                     </div>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-samurai-success/10 p-3 text-center border border-samurai-success/20">
                       <div className="text-xl font-mono text-samurai-success">{completedCount}</div>
                       <div className="text-[10px] uppercase tracking-widest text-samurai-success/60">已完成</div>
                     </div>
                     <div className="rounded-lg bg-samurai-yellow/10 p-3 text-center border border-samurai-yellow/20">
                        <div className="text-xl font-mono text-samurai-yellow">{user.coins ?? 0}</div>
                        <div className="text-[10px] uppercase tracking-widest text-samurai-yellow/60">代幣</div>
                     </div>
                 </div>
              </div>
           </div>
        </section>

        {/* Column 4: Check-In Calendar */}
        <section className="lg:col-start-3 lg:row-start-2">
           <CheckInCalendar />
        </section>
      </div>
    </div>
  )
}
