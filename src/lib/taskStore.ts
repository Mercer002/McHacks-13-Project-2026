export interface Task {
  id: number
  title: string
  completed: boolean
  time: string // HH:mm
  duration: number // minutes
  category: string
}

const STORAGE_KEY = 'timepilotTasks'

type TaskMap = Record<string, Task[]>

const isBrowser = typeof window !== 'undefined'

function readStore(): TaskMap {
  if (!isBrowser) return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(data: TaskMap) {
  if (!isBrowser) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function getTasksForDate(dateKey: string): Task[] {
  const store = readStore()
  return store[dateKey] ? [...store[dateKey]] : []
}

export function saveTasksForDate(dateKey: string, tasks: Task[]) {
  const store = readStore()
  store[dateKey] = tasks
  writeStore(store)
}

export function getDatesWithTasks(): Set<string> {
  const store = readStore()
  return new Set(Object.keys(store).filter(key => store[key]?.length))
}
