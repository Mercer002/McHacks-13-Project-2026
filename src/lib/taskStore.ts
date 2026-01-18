export interface Task {
  id: string
  title: string
  completed: boolean
  time: string // HH:mm
  duration: number // minutes
  category: string
  dateKey: string
  location?: string
  travelMinutes?: number
  travelMode?: 'driving' | 'walking' | 'transit' | 'bicycling'
}

const STORAGE_PREFIX = 'timepilotTasks:'

type TaskMap = Record<string, Task[]> // key: dateKey

const isBrowser = typeof window !== 'undefined'

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`
}

function readStore(userId: string): TaskMap {
  if (!isBrowser || !userId) return {}
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(userId: string, data: TaskMap) {
  if (!isBrowser || !userId) return
  window.localStorage.setItem(storageKey(userId), JSON.stringify(data))
}

export function getTasksForDate(userId: string, dateKey: string): Task[] {
  const store = readStore(userId)
  return store[dateKey] ? [...store[dateKey]] : []
}

export function saveTasksForDate(userId: string, dateKey: string, tasks: Task[]) {
  const store = readStore(userId)
  store[dateKey] = tasks
  writeStore(userId, store)
}

export function getDatesWithTasks(userId: string): Set<string> {
  const store = readStore(userId)
  return new Set(Object.keys(store).filter(key => store[key]?.length))
}
