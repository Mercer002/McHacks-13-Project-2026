import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { parseISO, format } from 'date-fns'
import { CheckCircle, Circle, Trash2, Plus, Clock, Calendar as CalIcon, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getTasksForDate, saveTasksForDate } from '../lib/taskStore'
import type { Task } from '../lib/taskStore'

export default function DayView() {
    const { date } = useParams()
    const [tasks, setTasks] = useState<Task[]>([])

    const parsedDate = useMemo(() => {
        if (!date) return new Date()
        const parsed = parseISO(date)
        return isNaN(parsed.getTime()) ? new Date() : parsed
    }, [date])

    const displayDate = useMemo(() => format(parsedDate, 'EEEE, MMMM d, yyyy'), [parsedDate])
    const dateKey = useMemo(() => format(parsedDate, 'yyyy-MM-dd'), [parsedDate])

    useEffect(() => {
        setTasks(getTasksForDate(dateKey))
    }, [dateKey])

    // --- CONFIGURATION ---
    const startHour = 0
    const endHour = 23
    const pxPerMinute = 2
    const hourHeight = 60 * pxPerMinute
    const hoursOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
    const minutesOptions = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))
    const durationOptions = [15, 30, 45, 60, 90, 120, 180]
    
    // --- STATE ---
    const [taskName, setTaskName] = useState('')
    const [taskHour, setTaskHour] = useState('09')
    const [taskMinute, setTaskMinute] = useState('00')
    const [taskCategory, setTaskCategory] = useState('Work')
    const [taskDuration, setTaskDuration] = useState(60)
    const [showAdd, setShowAdd] = useState(false)

    // --- ACTIONS ---
    const addTask = (e: React.FormEvent) => {
        e.preventDefault()
        if (!taskName) return
        const composedTime = `${taskHour.padStart(2, '0')}:${taskMinute.padStart(2, '0')}`
        const newTask: Task = {
            id: Date.now(),
            title: taskName,
            completed: false,
            time: composedTime,
            duration: taskDuration,
            category: taskCategory
        }
        const updated = [...tasks, newTask]
        setTasks(updated)
        saveTasksForDate(dateKey, updated)
        setTaskName('')
        setTaskHour('09')
        setTaskMinute('00')
        setTaskDuration(60)
        setShowAdd(false)
    }

    const toggleTask = (id: number) => {
        const updated = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t)
        setTasks(updated)
        saveTasksForDate(dateKey, updated)
    }

    // --- Completion modal flow ---
    const [showCompleteModal, setShowCompleteModal] = useState(false)
    const [modalTask, setModalTask] = useState<Task | null>(null)
    // use string so the input can be fully cleared by the user (empty string)
    const [actualDuration, setActualDuration] = useState<string>('')
    const [completionError, setCompletionError] = useState<string | null>(null)

    const openCompleteModal = (task: Task) => {
        setModalTask(task)
        // Prefill with the estimated duration, but keep as string so user can clear it
        setActualDuration(String(task.duration ?? 0))
        setCompletionError(null)
        setShowCompleteModal(true)
    }

    const cancelComplete = () => {
        setShowCompleteModal(false)
        setModalTask(null)
        setCompletionError(null)
    }

    const confirmComplete = async () => {
        if (!modalTask) return

        // validate actualDuration is a positive integer
        const parsed = parseInt(actualDuration, 10)
        if (isNaN(parsed) || parsed <= 0) {
            setCompletionError('Please enter a positive number of minutes')
            return
        }

        // Prepare record to insert (match requested schema)
        const record = {
            title: modalTask.title,
            category: modalTask.category,
            date: dateKey, // yyyy-MM-dd string
            estimated_time: modalTask.duration,
            actual_time: parsed,
            completed_at: new Date().toISOString(),
        }

        try {
            // Attach authenticated user info (id and email) so records are per-user
            const { data: userData, error: userErr } = await supabase.auth.getUser()
            if (userErr) console.warn('Could not fetch user from supabase.auth.getUser()', userErr)

            const enriched = {
                ...record,
                user_id: userData?.user?.id ?? null,
                user_email: userData?.user?.email ?? null,
            }

            const { error } = await supabase.from('task_completions').insert(enriched)
            if (error) {
                console.error('Supabase insert error', error)
                setCompletionError(error.message || 'Failed to save completion')
                // still mark locally so user sees it as completed
            }
        } catch (err) {
            console.error('Supabase insert exception', err)
            setCompletionError(String(err))
        }

        // Mark the task completed locally and persist
        const updated = tasks.map(t => t.id === modalTask.id ? { ...t, completed: true } : t)
        setTasks(updated)
        saveTasksForDate(dateKey, updated)

        // close modal
        setShowCompleteModal(false)
        setModalTask(null)
    }

    const deleteTask = (id: number) => {
        const updated = tasks.filter(t => t.id !== id)
        setTasks(updated)
        saveTasksForDate(dateKey, updated)
    }

    // --- LAYOUT LOGIC ---
    const getMinutesFromStart = (timeStr: string) => {
        const [h, m] = timeStr.split(':').map(Number)
        return (h - startHour) * 60 + m
    }

    const sortedTasks = [...tasks].sort((a, b) => getMinutesFromStart(a.time) - getMinutesFromStart(b.time))

    // lane placement respects actual duration
    const lanes: Task[][] = []
    const laneEndTimes: number[] = []
    sortedTasks.forEach(task => {
        const start = getMinutesFromStart(task.time)
        const end = start + task.duration
        let placed = false
        for (let i = 0; i < lanes.length; i++) {
            if (laneEndTimes[i] <= start) {
                lanes[i].push(task)
                laneEndTimes[i] = end
                placed = true
                break
            }
        }
        if (!placed) {
            lanes.push([task])
            laneEndTimes.push(end)
        }
    })

    const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => i + startHour)
    const taskColors = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#f97316', '#facc15']
    const getTaskColor = (task: Task) => {
        if (task.completed) {
            return { bg: '#27272a', border: '#3f3f46' }
        }
        const color = taskColors[Math.abs(task.id) % taskColors.length]
        return { bg: color, border: color }
    }

    return (
        // Dark Mode Base: Black Background, White Text
        <div style={{ backgroundColor: '#09090b', color: '#ffffff', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif', width: '100vw' }}>

            {/* Header */}
            <header style={{ borderBottom: '1px solid #27272a', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="flex items-center gap-4">
                    <Link to="/calendar" style={{ textDecoration: 'none' }}>
                        <button
                          className="button"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '10px 14px',
                            background: '#0ea5e9',
                            color: '#0b1020',
                            marginRight: 48,
                            borderRadius: 12,
                          }}
                        >
                          <CalIcon size={18} />
                          Back to Calendar
                        </button>
                    </Link>
                    <h1 className="text-xl font-bold">{displayDate}</h1>
                </div>
                <div style={{ backgroundColor: '#1e3a8a', color: '#93c5fd', padding: '6px 16px', borderRadius: '99px', fontSize: '14px', fontWeight: '500' }}>
                    {tasks.filter(t => t.completed).length} / {tasks.length} Completed
                </div>
            </header>

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden" style={{ width: '100%', maxWidth: '100vw', minHeight: 0 }}>

                {/* --- LEFT: SCHEDULE TIMELINE --- */}
                {/* We set a border-right that is visible (white-ish) */}
                <div
                    className="flex-1 overflow-y-auto relative custom-scrollbar"
                    style={{ borderRight: '2px solid #3f3f46', minWidth: 0, flexBasis: '0%', paddingLeft: '16px', paddingRight: '12px', minHeight: 0, height: '100%' }}
                >
                    
                    <div className="relative w-full" style={{ height: `${hours.length * hourHeight}px` }}>

                        {/* Vertical divider between time labels and tasks */}
                        <div
                            style={{
                                position: 'absolute',
                                top: 0,
                                bottom: 0,
                                left: '72px',
                                width: '1px',
                                background: 'rgba(255,255,255,0.35)',
                                zIndex: 5
                            }}
                        ></div>
                        
                        {/* 1. THE GRID LINES (WHITE LINES ON DARK BG) */}
                        {hours.map((hour) => {
                            const top = (hour - startHour) * hourHeight
                            return (
                                <div 
                                    key={hour} 
                                    style={{ 
                                        position: 'absolute',
                                        left: 0,
                                        right: 0,
                                        top: `${top}px`, 
                                        height: `${hourHeight}px`,
                                        // THIS IS THE FIX: Explicit white/light border
                                        borderTop: '1px solid rgba(255, 255, 255, 0.2)',
                                        borderBottom: '1px solid rgba(255, 255, 255, 0.2)', 
                                        display: 'flex'
                                    }}
                                >
                                    {/* Time Label */}
                                    <div style={{ 
                                        width: '72px', 
                                        textAlign: 'center', 
                                        paddingRight: '8px',
                                        paddingLeft: '8px',
                                        marginTop: '-16px',
                                        color: '#a1a1aa',
                                        fontSize: '12px', 
                                        fontWeight: 'bold',
                                        userSelect: 'none'
                                    }}>
                                        {hour > 12 ? hour - 12 : hour} {hour >= 12 ? 'PM' : 'AM'}
                                    </div>
                                </div>
                            )
                        })}

                        {/* 2. THE TASKS */}
                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '72px', right: '0px' }}>
                            {lanes.map((lane, laneIndex) => (
                                lane.map(task => {
                                    const top = getMinutesFromStart(task.time) * pxPerMinute
                                    const widthPercent = 100 / lanes.length
                                    const leftPercent = laneIndex * widthPercent
                                    const heightPx = task.duration * pxPerMinute
                                    return (
                                        <div
                                            key={task.id}
                                            style={{
                                                position: 'absolute',
                                                top: `${top}px`,
                                                height: `${heightPx}px`,
                                                left: `${leftPercent}%`,
                                                width: `${widthPercent}%`,
                                                padding: '4px',
                                                zIndex: 10
                                            }}
                                        >
                                            {/* Task Card */}
                                            <div style={{ 
                                                height: '100%',
                                                width: '100%', 
                                                borderRadius: '8px', 
                                                backgroundColor: getTaskColor(task).bg,
                                                border: `1px solid ${getTaskColor(task).border}`,
                                                padding: '8px',
                                                color: '#ffffff',
                                                overflow: 'hidden',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'center',
                                                opacity: task.completed ? 0.6 : 1
                                            }}>
                                                <div style={{ fontWeight: 'bold', fontSize: '14px', lineHeight: '1.2', wordBreak: 'break-word' }}>
                                                    {task.title}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', opacity: 0.8, padding: '4px 8px', borderRadius: '999px', backgroundColor: '#111827' }}>
                                                        <Clock size={12} /> {task.time}
                                                    </span>
                                                    <span style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '999px', backgroundColor: '#1d4ed8', color: '#bfdbfe', fontWeight: 600 }}>
                                                        {task.category}
                                                    </span>
                                                    <span style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '999px', backgroundColor: '#0f172a', color: '#e5e7eb', fontWeight: 600 }}>
                                                        {task.duration}m
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            ))}
                        </div>
                    </div>
                </div>

                {/* --- RIGHT: TASK LIST SIDEBAR --- */}
                <div style={{ width: 'clamp(220px, 18vw, 260px)', backgroundColor: '#18181b', borderLeft: '1px solid #3f3f46', padding: '20px', overflowY: 'auto', flexShrink: 0, height: '100%' }}>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold">Tasks</h2>
                        <button
                            onClick={() => setShowAdd(true)}
                            style={{ backgroundColor: '#2563eb', color: 'white', padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
                        >
                            <Plus size={20} />
                        </button>
                    </div>

                    <div className="space-y-3">
                        {sortedTasks.map(task => (
                            <div 
                                key={task.id} 
                                style={{ 
                                    backgroundColor: getTaskColor(task).bg,
                                    padding: '16px', 
                                    borderRadius: '12px', 
                                    border: `1px solid ${getTaskColor(task).border}`,
                                    display: 'grid',
                                    gridTemplateColumns: '24px 1fr 24px',
                                    gap: '10px',
                                    alignItems: 'center',
                                    opacity: task.completed ? 0.35 : 1
                                }}
                            >
                                <button 
                                    onClick={() => task.completed ? toggleTask(task.id) : openCompleteModal(task)}
                                    style={{ color: task.completed ? '#22c55e' : '#e5e5e5', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', justifyContent: 'center' }}
                                >
                                    {task.completed ? <CheckCircle size={20} /> : <Circle size={20} />}
                                </button>
                                
                                <div className="flex-1" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <p style={{ 
                                        fontWeight: '500', 
                                        fontSize: '14px', 
                                        color: task.completed ? '#71717a' : '#ffffff',
                                        textDecoration: task.completed ? 'line-through' : 'none',
                                        margin: 0,
                                        wordBreak: 'break-word'
                                    }}>
                                        {task.title}
                                    </p>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '12px', backgroundColor: '#3f3f46', color: '#d4d4d8', padding: '4px 8px', borderRadius: '6px' }}>
                                            {task.time}
                                        </span>
                                        <span style={{ fontSize: '12px', backgroundColor: '#1e3a8a', color: '#93c5fd', padding: '4px 8px', borderRadius: '6px', fontWeight: '500' }}>
                                            {task.category}
                                        </span>
                                        <span style={{ fontSize: '12px', backgroundColor: '#0f172a', color: '#e5e7eb', padding: '4px 8px', borderRadius: '6px', fontWeight: '500' }}>
                                            {task.duration}m
                                        </span>
                                    </div>
                                </div>

                                <button onClick={() => deleteTask(task.id)} style={{ color: '#e5e5e5', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', justifyContent: 'center' }}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

            {/* MODAL (Dark Mode Compatible) */}
            {showAdd && (
                <div style={{ 
                    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 
                }}>
                    <div style={{ backgroundColor: '#18181b', borderRadius: '16px', width: '100%', maxWidth: '450px', padding: '24px', border: '1px solid #3f3f46' }}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold">New Task</h3>
                            <button onClick={() => setShowAdd(false)} style={{ color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={20} />
                            </button>
                        </div>
                        
                        <form onSubmit={addTask} className="space-y-4">
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#a1a1aa', marginBottom: '4px' }}>Title</label>
                                <input
                                    autoFocus
                                    type="text"
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #3f3f46', backgroundColor: '#27272a', color: '#fff', outline: 'none' }}
                                    placeholder="What needs to be done?"
                                    value={taskName}
                                    onChange={(e) => setTaskName(e.target.value)}
                                />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#a1a1aa', marginBottom: '4px' }}>Time</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <select
                                            style={{ width: '50%', padding: '12px', borderRadius: '8px', border: '1px solid #3f3f46', backgroundColor: '#27272a', color: '#fff', outline: 'none', height: '48px' }}
                                            value={taskHour}
                                            onChange={(e) => {
                                                setTaskHour(e.target.value)
                                            }}
                                        >
                                            {hoursOptions.map(h => (
                                                <option key={h} value={h}>{h}</option>
                                            ))}
                                        </select>
                                        <select
                                            style={{ width: '50%', padding: '12px', borderRadius: '8px', border: '1px solid #3f3f46', backgroundColor: '#27272a', color: '#fff', outline: 'none', height: '48px' }}
                                            value={taskMinute}
                                            onChange={(e) => {
                                                setTaskMinute(e.target.value)
                                            }}
                                        >
                                            {minutesOptions.map(m => (
                                                <option key={m} value={m}>{m}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#a1a1aa', marginBottom: '4px' }}>Category</label>
                                    <select 
                                        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #3f3f46', backgroundColor: '#27272a', color: '#fff', outline: 'none', height: '48px' }}
                                        value={taskCategory}
                                        onChange={(e) => setTaskCategory(e.target.value)}
                                    >
                                        <option>Work</option>
                                        <option>Personal</option>
                                        <option>Urgent</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#a1a1aa', marginBottom: '4px' }}>Duration (minutes)</label>
                                <select
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #3f3f46', backgroundColor: '#27272a', color: '#fff', outline: 'none', height: '48px' }}
                                    value={taskDuration}
                                    onChange={(e) => setTaskDuration(Number(e.target.value))}
                                >
                                    {durationOptions.map(d => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>
                            </div>

                            <button type="submit" style={{ width: '100%', padding: '12px', backgroundColor: '#2563eb', color: 'white', borderRadius: '8px', border: 'none', fontWeight: 'bold', marginTop: '8px', cursor: 'pointer' }}>
                                Create Task
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Completion modal */}
            {showCompleteModal && modalTask && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
                    <div style={{ backgroundColor: '#18181b', borderRadius: '16px', width: '100%', maxWidth: '420px', padding: '20px', border: '1px solid #3f3f46' }}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold">How long did this take?</h3>
                            <button onClick={cancelComplete} style={{ color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <p style={{ color: '#94a3b8', marginBottom: 12 }}>{modalTask.title} — {modalTask.category}</p>

                        <div style={{ marginBottom: 12 }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#a1a1aa', marginBottom: 6 }}>Actual duration (minutes)</label>
                            <input
                                type="number"
                                value={actualDuration}
                                onChange={(e) => setActualDuration(e.target.value)}
                                step={5}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #3f3f46', backgroundColor: '#27272a', color: '#fff' }}
                            />
                        </div>

                        {completionError && <p style={{ color: '#f87171', marginBottom: 8 }}>{completionError}</p>}

                        <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                            <button onClick={confirmComplete} className="button" style={{ flex: 1 }}>Confirm</button>
                            <button onClick={cancelComplete} className="button" style={{ flex: 1, background: '#6b7280', color: '#fff' }}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
