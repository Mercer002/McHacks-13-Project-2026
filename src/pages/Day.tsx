import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { parseISO, format } from 'date-fns'
import { CheckCircle, Circle, Trash2, Plus, Clock, Calendar as CalIcon, X } from 'lucide-react'
import { fetchTasksForDate, createTask, setTaskCompleted, deleteTaskById } from '../lib/tasksApi'
import type { Task } from '../lib/tasksApi'
import { supabase } from '../lib/supabase'

function getCurrentLatLng(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    )
  })
}


const hhmmToMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}
const minutesToHHMM = (mins: number) => {
  mins = Math.max(0, mins)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

type TravelMode = "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT"

const travelModeOptions: { value: TravelMode; label: string }[] = [
  { value: "DRIVE", label: "Car" },
  { value: "WALK", label: "Walk" },
  { value: "BICYCLE", label: "Bike" },
  { value: "TRANSIT", label: "Transit" },
]


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
    fetchTasksForDate(dateKey)
        .then(setTasks)
        .catch((e) => console.error('fetchTasksForDate error', e))
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
    const [aiText, setAiText] = useState("")
    const [aiLoading, setAiLoading] = useState(false)
    const [taskName, setTaskName] = useState('')
    const [taskHour, setTaskHour] = useState('09')
    const [taskMinute, setTaskMinute] = useState('00')
    const [taskCategory, setTaskCategory] = useState('Work')
    const [taskDuration, setTaskDuration] = useState(60)
    const [showAdd, setShowAdd] = useState(false)
    const [taskLocation, setTaskLocation] = useState("")
    const [includeTravel, setIncludeTravel] = useState(true) // optional toggle
    const [travelMode, setTravelMode] = useState<TravelMode>("DRIVE")



    // --- ACTIONS ---
    const addTask = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!taskName) return

        const composedTime = `${taskHour.padStart(2, '0')}:${taskMinute.padStart(2, '0')}`

        try {
            const locationText = taskLocation.trim() ? taskLocation.trim() : null

            // ✅ If no location, create normal task (same as before)
            if (!locationText) {
                const created = await createTask({
                day: dateKey,
                title: taskName,
                time: composedTime,
                duration: taskDuration,
                category: taskCategory,
                location: null,
                })
                setTasks(prev => [...prev, created])
            } else {
                // ✅ If location exists, compute travel time + create travel + event

                const { data: sessionData } = await supabase.auth.getSession()
                const token = sessionData.session?.access_token
                if (!token) throw new Error("No session token")

                let origin: { lat: number; lng: number } | null = null
                    try {
                    origin = await getCurrentLatLng()
                } catch (e) {
                    console.warn("Geolocation failed (manual add) — creating task without travel", e)
                }
                if (!origin) {
                    // GPS failed → create the event only (no travel)
                    const created = await createTask({
                        day: dateKey,
                        title: taskName,
                        time: composedTime,
                        duration: taskDuration,
                        category: taskCategory,
                        location: locationText,
                    })
                    setTasks(prev => [...prev, created])
                    // reset UI state
                    setTaskName('')
                    setTaskHour('09')
                    setTaskMinute('00')
                    setTaskDuration(60)
                    setTaskLocation("")
                    setShowAdd(false)
                    return
                }


                const travelUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/travel-time`
                const travelRes = await fetch(travelUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                    "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({
                    originLat: origin.lat,
                    originLng: origin.lng,
                    destinationText: locationText,
                    travelMode,
                }),
                })

                const travelData = await travelRes.json().catch(() => ({}))

                // fallback: if Google fails, create event only
                if (!travelRes.ok || !travelData?.travelMinutes) {
                console.error("travel-time failed", travelRes.status, travelData)
                const created = await createTask({
                    day: dateKey,
                    title: taskName,
                    time: composedTime,
                    duration: taskDuration,
                    category: taskCategory,
                    location: locationText,
                })
                setTasks(prev => [...prev, created])
                } else {
                const travelMinutes = travelData.travelMinutes as number
                const resolvedLoc = travelData.resolvedAddress ?? locationText

                const eventStart = hhmmToMinutes(composedTime)
                const travelTime = minutesToHHMM(eventStart - travelMinutes)

                // ✅ create travel block
                const travelTask = await createTask({
                    day: dateKey,
                    title: `Travel to ${taskName}`,
                    time: travelTime,
                    duration: travelMinutes,
                    category: taskCategory,
                    location: resolvedLoc,
                    is_travel: true,
                    travel_minutes: travelMinutes,
                })

                // ✅ create the actual event
                const eventTask = await createTask({
                    day: dateKey,
                    title: taskName,
                    time: composedTime,
                    duration: taskDuration,
                    category: taskCategory,
                    location: resolvedLoc,
                    is_travel: false,
                    travel_minutes: null,
                })

                setTasks(prev => [...prev, travelTask, eventTask])
                }
            }

            // reset UI state
            setTaskName('')
            setTaskHour('09')
            setTaskMinute('00')
            setTaskDuration(60)
            setTaskLocation("")
            setShowAdd(false)
        } catch (e) {
            console.error('createTask error', e)
            alert('Failed to create task (check console)')
        }

    }


    const toggleTask = async (id: number) => {
        const current = tasks.find(t => t.id === id)
        if (!current) return

        try {
            const updated = await setTaskCompleted(id, !current.completed)
            setTasks((prev) => prev.map(t => (t.id === id ? updated : t)))
        } catch (e) {
            console.error('setTaskCompleted error', e)
            alert('Failed to update task (check console)')
        }
    }
    const runAiCommand = async () => {
        if (!aiText.trim()) return
        setAiLoading(true)
        const { data: sessionData } = await supabase.auth.getSession()
        console.log("SESSION", sessionData)

        const token = sessionData.session?.access_token
        console.log("TOKEN EXISTS?", !!token)

        if (token) {
        const payload = JSON.parse(atob(token.split(".")[1]))
        console.log("JWT iss:", payload.iss)
        console.log("JWT aud:", payload.aud)
        }
        console.log("ENV URL:", import.meta.env.VITE_SUPABASE_URL)
        console.log("ENV REF:", import.meta.env.VITE_SUPABASE_URL?.split("//")[1]?.split(".")[0])

        try {
            const { data: sessionData } = await supabase.auth.getSession()
            const token = sessionData.session?.access_token
            if (!token) throw new Error("No session token")
            
            let origin: { lat: number; lng: number } | null = null
                try {
                origin = await getCurrentLatLng()
            } catch (e) {
                console.warn("Geolocation failed — continuing without travel time", e)
                // optional: show user message once
                // alert("Couldn't get your location. I'll add events without travel time.")
            }


            const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-command`

            const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // ✅ this is what fixes the 401
                "Authorization": `Bearer ${token}`,
                // also include apikey for safety
                "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ text: aiText, dayKey: dateKey }),
            })

            const data = await res.json().catch(() => ({}))

            if (!res.ok) {
                console.error("edge error", res.status, data)
                alert(`AI command failed: ${res.status}\n${data?.error ?? ""}`)
                return
            }

            if (data?.error) {
            console.error("function returned error", data)
            alert(data.error)
            return
            }

            const tasksFromAi = data?.tasks ?? []

            for (const t of tasksFromAi) {
                const day = t.day ?? dateKey

                // If no location → normal event task
                if (!t.location) {
                    const created = await createTask({
                    day,
                    title: t.title,
                    time: t.time,
                    duration: t.duration,
                    category: t.category,
                    location: null,
                    })
                    setTasks(prev => [...prev, created])
                    continue
                }
                // no origin (geoloc failed) → create event only
                if (!origin) {
                    // GPS failed → create event only (no travel)
                    const created = await createTask({
                    day,
                    title: t.title,
                    time: t.time,
                    duration: t.duration,
                    category: t.category,
                    location: t.location,
                    })
                    setTasks(prev => [...prev, created])
                    continue
                }

                // Call travel-time function
                const travelUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/travel-time`
                const travelRes = await fetch(travelUrl, {
                    method: "POST",
                    headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                    "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
                    },
                    body: JSON.stringify({
                    originLat: origin.lat,
                    originLng: origin.lng,
                    destinationText: t.location,
                    travelMode,
                    }),
                })
                const travelData = await travelRes.json()

                // If travel compute fails → create event only
                if (!travelRes.ok) {
                    console.error("travel-time failed", travelRes.status, travelData)
                    const created = await createTask({
                    day,
                    title: t.title,
                    time: t.time,
                    duration: t.duration,
                    category: t.category,
                    location: t.location,
                    })
                    setTasks(prev => [...prev, created])
                    continue
                }

                const travelMinutes = travelData.travelMinutes as number
                const resolvedLoc = travelData.resolvedAddress ?? t.location

                // compute travel start
                const eventStart = hhmmToMinutes(t.time)
                const travelStart = eventStart - travelMinutes
                const travelTime = minutesToHHMM(travelStart)

                // Create travel block first
                const travelTask = await createTask({
                    day,
                    title: `Travel to ${t.title}`,
                    time: travelTime,
                    duration: travelMinutes,
                    category: t.category,     // keep same category OR set to "Personal"
                    location: resolvedLoc,
                    is_travel: true,
                    travel_minutes: travelMinutes,
                })

                // Create the actual event
                const eventTask = await createTask({
                    day,
                    title: t.title,
                    time: t.time,
                    duration: t.duration,
                    category: t.category,
                    location: resolvedLoc,
                    is_travel: false,
                    travel_minutes: null,
                })

                setTasks(prev => [...prev, travelTask, eventTask])
            }


            setAiText("")
        } catch (e) {
            console.error(e)
            alert("AI command failed (exception). Check console.")
        } finally {
            setAiLoading(false)
        }
    }


    const deleteTask = async (id: number) => {
        try {
            await deleteTaskById(id)
            setTasks((prev) => prev.filter(t => t.id !== id))
        } catch (e) {
            console.error('deleteTaskById error', e)
            alert('Failed to delete task (check console)')
        }
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
        if (task.is_travel) {
            return { bg: "#0f172a", border: "#38bdf8" } // travel color
        }

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
                            marginRight: 12,
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
                                                    {task.location && (
                                                    <span style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '6px', backgroundColor: '#3f3f46', color: '#d4d4d8' }}>
                                                        {task.location}
                                                    </span>
                                                    )}

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
                <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>AI assistant</div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <input
                        value={aiText}
                        onChange={(e) => setAiText(e.target.value)}
                        placeholder='e.g. "yoga tonight at 8"'
                        style={{
                            flex: 1,
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #3f3f46",
                            background: "#27272a",
                            color: "white",
                        }}
                        />
                        <select
                            value={travelMode}
                            onChange={(e) => setTravelMode(e.target.value as TravelMode)}
                            style={{
                            padding: "10px 10px",
                            borderRadius: 10,
                            border: "1px solid #3f3f46",
                            background: "#27272a",
                            color: "white",
                            }}
                        >
                        {travelModeOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                        <button
                        onClick={runAiCommand}
                        disabled={aiLoading}
                        style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "none",
                            background: aiLoading ? "#334155" : "#22c55e",
                            color: "#0b1020",
                            fontWeight: 700,
                            cursor: "pointer",
                        }}
                        >
                        {aiLoading ? "..." : "Run"}
                        </button>
                    </div>
                </div>

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
                                    onClick={() => toggleTask(task.id)}
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

                                        {task.location && (
                                        <span style={{ fontSize: '12px', backgroundColor: '#27272a', color: '#e5e7eb', padding: '4px 8px', borderRadius: '6px' }}>
                                            {task.location}
                                        </span>
                                        )}
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
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#a1a1aa', marginBottom: '4px' }}>
                                    Location (optional)
                                </label>
                                <input
                                    type="text"
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #3f3f46', backgroundColor: '#27272a', color: '#fff', outline: 'none' }}
                                    placeholder='e.g. "McGill gym" or "200 Sherbrooke St W"'
                                    value={taskLocation}
                                    onChange={(e) => setTaskLocation(e.target.value)}
                                />
                            </div>
                            <div style={{ marginTop: '12px' }}>
                                <label
                                    style={{
                                    display: 'block',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    textTransform: 'uppercase',
                                    color: '#a1a1aa',
                                    marginBottom: '4px',
                                    }}
                                >
                                    Travel mode
                                </label>

                                <select
                                    value={travelMode}
                                    onChange={(e) =>
                                    setTravelMode(
                                        e.target.value as "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT"
                                    )
                                    }
                                    style={{
                                    width: '100%',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    border: '1px solid #3f3f46',
                                    backgroundColor: '#27272a',
                                    color: '#fff',
                                    outline: 'none',
                                    height: '48px',
                                    }}
                                >
                                    <option value="DRIVE">Car</option>
                                    <option value="WALK">Walk</option>
                                    <option value="BICYCLE">Bike</option>
                                    <option value="TRANSIT">Public transit</option>
                                </select>
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
        </div>
    )
}
