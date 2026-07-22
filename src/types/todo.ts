export type TodoStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
export type TodoPriority = 'LOW' | 'MEDIUM' | 'HIGH'
export type RecurrenceType = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM'
export type TodoPhase = 'UPCOMING' | 'ACTIVE' | 'OVERDUE' | 'DONE'

export type Todo = {
  id: string
  title: string
  description: string | null
  status: TodoStatus
  priority: TodoPriority
  recurrence: RecurrenceType
  recurrenceInterval: number
  recurrenceEndAt: string | null
  tagIds: string[]
  startAt: string
  endAt: string
  createdAt: string
  updatedAt: string
}

export const TODO_STATUS_LABEL: Record<TodoStatus, string> = {
  NOT_STARTED: '尚未開始',
  IN_PROGRESS: '進行中',
  COMPLETED: '已完成',
  FAILED: '未完成',
}

export const TODO_STATUS_TONE: Record<TodoStatus, string> = {
  NOT_STARTED: 'border-[#eaded4] text-[#9a6a5f]',
  IN_PROGRESS: 'border-[#d9e5d5] text-[#5f7f5a]',
  COMPLETED: 'border-[#d9e5d5] text-[#5f7f5a]',
  FAILED: 'border-[#f0c9c2] text-[#a85b4e]',
}

export const TODO_STATUS_OPTIONS = (Object.keys(TODO_STATUS_LABEL) as TodoStatus[]).map((value) => ({
  value,
  label: TODO_STATUS_LABEL[value],
}))

export const TODO_PRIORITY_LABEL: Record<TodoPriority, string> = {
  LOW: '低優先',
  MEDIUM: '一般',
  HIGH: '重要',
}

export const TODO_PRIORITY_OPTIONS = (Object.keys(TODO_PRIORITY_LABEL) as TodoPriority[]).map((value) => ({
  value,
  label: TODO_PRIORITY_LABEL[value],
}))

export const RECURRENCE_LABEL: Record<RecurrenceType, string> = {
  NONE: '一次性',
  DAILY: '每日',
  WEEKLY: '每週',
  MONTHLY: '每月',
  CUSTOM: '自訂間隔',
}

export const RECURRENCE_OPTIONS = (Object.keys(RECURRENCE_LABEL) as RecurrenceType[]).map((value) => ({
  value,
  label: RECURRENCE_LABEL[value],
}))

export const TODO_PHASE_LABEL: Record<TodoPhase, string> = {
  UPCOMING: '待啟動',
  ACTIVE: '進行中',
  OVERDUE: '超時',
  DONE: '已結束',
}
