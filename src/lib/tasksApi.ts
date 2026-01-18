import { supabase } from './supabase'

export interface Task {
  id: number
  title: string
  completed: boolean
  time: string // "HH:mm"
  duration: number
  category: string
  actual_duration: number | null
  location: string | null
  is_travel: boolean
  travel_minutes: number | null
  day: string
}

/**
 * Fetch tasks for a specific day (YYYY-MM-DD) for the current user.
 */
export async function fetchTasksForMonth(startDay: string, endDay: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id,title,completed,time,duration,category,actual_duration,location,is_travel,travel_minutes,day')
    .gte('day', startDay)
    .lte('day', endDay)
    .order('day', { ascending: true })
    .order('time', { ascending: true })

  if (error) throw error
  return (data ?? []) as Task[]
}

export async function fetchTasksForDate(dayKey: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id,title,completed,time,duration,category,actual_duration,location,is_travel,travel_minutes,day')
    .eq('day', dayKey)
    .order('time', { ascending: true })

  if (error) throw error
  return (data ?? []) as Task[]
}

/**
 * Create a task for the current user.
 */
export async function createTask(input: {
  day: string
  title: string
  time: string
  duration: number
  category: string
  location?: string | null
  is_travel?: boolean
  travel_minutes?: number | null
}) {
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) throw new Error('Not logged in')

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: user.id,
      day: input.day,
      title: input.title,
      time: input.time,
      duration: input.duration,
      category: input.category,
      location: input.location ?? null,
      is_travel: input.is_travel ?? false,
      travel_minutes: input.travel_minutes ?? null,
      completed: false,
      actual_duration: null,
    })
    .select('id,title,completed,time,duration,category,actual_duration,location,is_travel,travel_minutes,day')
    .single()

  if (error) throw error
  return data as Task
}

/**
 * Toggle completed
 */
export async function setTaskCompleted(id: number, completed: boolean) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ completed })
    .eq('id', id)
    .select('id,title,completed,time,duration,category,actual_duration,location,is_travel,travel_minutes,day')
    .single()

  if (error) throw error
  return data as Task
}

/**
 * Delete a task
 */
export async function deleteTaskById(id: number) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

/**
 * Update actual duration after user types it in
 */
export async function setTaskActualDuration(id: number, actual_duration: number | null) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ actual_duration })
    .eq('id', id)
    .select('id,title,completed,time,duration,category,actual_duration,location,is_travel,travel_minutes,day')
    .single()

  if (error) throw error
  return data as Task
}
