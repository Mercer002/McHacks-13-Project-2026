import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import Calendar from 'react-calendar'
import { ChevronLeft, ChevronRight, Plus, Calendar as CalIcon } from 'lucide-react'
import 'react-calendar/dist/Calendar.css'
import { getDatesWithTasks, getTasksForDate } from '../lib/taskStore'
import type { Task } from '../lib/taskStore'

type Props = {
  userId: string
}

export default function MyCalendar({ userId }: Props) {
  const [date, setDate] = useState<Date>(() => {
    try {
      const raw = localStorage.getItem('calendar.selectedDate')
      if (raw) {
        const parsed = new Date(raw)
        if (!isNaN(parsed.getTime())) return parsed
      }
    } catch (err) {
      // ignore
    }
    return new Date()
  })
  const [tasks, setTasks] = useState<Task[]>([])
  const [datesWithTasks, setDatesWithTasks] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const today = useMemo(() => new Date(), [])
  const todayKey = useMemo(() => format(today, 'yyyy-MM-dd'), [today])
  const todayLabel = useMemo(() => format(today, 'MMM d'), [today])
  const monthLabel = useMemo(() => format(date, 'MMMM yyyy'), [date])
  const dateKey = useMemo(() => format(date, 'yyyy-MM-dd'), [date])

  useEffect(() => {
    if (!userId) return
    try {
      setTasks(getTasksForDate(userId, dateKey))
      setDatesWithTasks(getDatesWithTasks(userId))
      setError(null)
    } catch (err) {
      console.error('Task load error', err)
      setError('Unable to load tasks right now.')
    }
  }, [userId, dateKey])

  // Navigate to Day View on click
  const handleDayClick = (clickedDate: Date) => {
    const pathDate = format(clickedDate, 'yyyy-MM-dd')
    navigate(`/day/${pathDate}`)
  }

  // Save selected date (so returning to calendar restores the exact date/month)
  useEffect(() => {
    try {
      localStorage.setItem('calendar.selectedDate', date.toISOString())
    } catch (err) {
      // ignore
    }
  }, [date])

  return (
    // MASTER CONTAINER: Forces White Background & Dark Text NO MATTER WHAT
    <div style={{ 
      backgroundColor: '#ffffff', 
      minHeight: '100vh', 
      color: '#111827', 
      fontFamily: 'sans-serif',
      display: 'flex',
      flexDirection: 'column'
    }}>
      
      {/* CSS INJECTION: Transforms the tiny widget into a Full-Screen App */}
      <style>{`
        /* Reset the library's default styles */
        .react-calendar { 
          width: 100% !important;
          border: none !important;
          background: transparent !important;
          font-family: inherit;
        }
        
        /* Hide default ugly navigation */
        .react-calendar__navigation {
          display: none !important;
        }
        
        /* Weekday Headers (MON, TUE...) */
        .react-calendar__month-view__weekdays {
          text-align: center;
          text-transform: uppercase;
          font-weight: 700;
          font-size: 13px;
          color: #9ca3af; /* Light Gray */
          padding-bottom: 10px;
        }
        .react-calendar__month-view__weekdays__weekday abbr {
          text-decoration: none;
        }

        /* THE DAY GRID (The Boxes) */
        .react-calendar__tile {
          height: 140px !important; /* Tall boxes */
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          align-items: flex-end; /* Date number on top-right */
          padding: 10px !important;
          background: #ffffff !important;
          border-top: 1px solid #e5e7eb !important; /* Visible Gray Borders */
          border-right: 1px solid #e5e7eb !important;
          color: #374151 !important;
          font-weight: 600;
          position: relative;
        }
        
        /* Left border for the first column */
        .react-calendar__month-view__days {
          border-left: 1px solid #e5e7eb;
          border-bottom: 1px solid #e5e7eb;
        }

        /* Hover Effect */
        .react-calendar__tile:enabled:hover {
          background-color: #f9fafb !important;
          cursor: pointer;
        }
        
        /* TODAY Highlight */
        .react-calendar__tile--now {
          background: #eff6ff !important; /* Very light blue background */
        }
        .react-calendar__tile--now abbr {
          background: #2563eb;
          color: white;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 4px;
        }

        /* Remove default blue selection focus */
        .react-calendar__tile--active {
          background: #dbeafe !important;
          color: #1e3a8a !important;
        }
      `}</style>

      {/* --- HEADER BAR --- */}
      <header style={{ 
        padding: '20px 40px', 
        borderBottom: '1px solid #e5e7eb',
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        backgroundColor: '#ffffff'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Logo / Icon */}
          <div style={{ backgroundColor: '#2563eb', padding: '10px', borderRadius: '12px', color: 'white', display: 'flex' }}>
            <CalIcon size={24} />
          </div>

          {/* Month Title */}
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#111827', margin: 0 }}>
            {monthLabel}
          </h1>

          {/* Navigation Arrows */}
          <div style={{ display: 'flex', gap: '4px', marginLeft: '20px', backgroundColor: '#f3f4f6', padding: '4px', borderRadius: '8px' }}>
            <button 
              onClick={() => setDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              style={{ padding: '6px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#4b5563' }}
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              onClick={() => setDate(new Date())}
              style={{ padding: '6px 12px', border: 'none', background: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', color: '#374151', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
            >
              Today
            </button>
            <button 
              onClick={() => setDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              style={{ padding: '6px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#4b5563' }}
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <button 
          style={{ 
            backgroundColor: '#111827', 
            color: 'white', 
            padding: '12px 24px', 
            borderRadius: '12px', 
            fontWeight: 'bold', 
            border: 'none', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            cursor: 'pointer',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}
          onClick={() => navigate(`/day/${todayKey}`)}
        >
          <Plus size={18} /> Add Task for Today ({todayLabel})
        </button>
      </header>

      {error && (
        <div style={{ padding: '12px 40px', color: '#dc2626', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* --- MAIN CALENDAR AREA --- */}
      <div style={{ flex: 1, padding: '40px', overflowY: 'auto', backgroundColor: '#ffffff' }}>
        <div style={{ 
          maxWidth: '1400px', 
          margin: '0 auto', 
          backgroundColor: '#ffffff', 
          borderRadius: '24px', 
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: '1px solid #e5e7eb',
          padding: '24px'
        }}>
          <Calendar
            onChange={setDate as any}
            value={date}
            onClickDay={handleDayClick}
            tileContent={({ date, view }) => {
              if (view !== 'month') return null
              const key = format(date, 'yyyy-MM-dd')
              const hasTasks = datesWithTasks.has(key)
              if (!hasTasks) return null

              const dayTasks = getTasksForDate(userId, key)
                .slice()
                .sort((a, b) => a.time.localeCompare(b.time))
                .slice(0, 3)

              return (
                <div style={{ width: '100%', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {dayTasks.map(task => {
                    const isDone = task.completed
                    return (
                      <div
                        key={task.id}
                        style={{
                          fontSize: '11px',
                          backgroundColor: isDone ? '#f3f4f6' : '#f0fdf4',
                          color: isDone ? '#6b7280' : '#15803d',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          width: '100%',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontWeight: 600,
                          textAlign: 'left',
                          borderLeft: `3px solid ${isDone ? '#9ca3af' : '#22c55e'}`,
                          opacity: isDone ? 0.65 : 1,
                        }}
                        title={task.title}
                      >
                        {task.title}
                      </div>
                    )
                  })}
                  {getTasksForDate(userId, key).length > 3 && (
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>+ more…</div>
                  )}
                </div>
              )
            }}
          />

          <div style={{ marginTop: '16px', padding: '12px', background: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Tasks on {format(date, 'MMM d, yyyy')}</div>
          {tasks.length === 0 && <div style={{ color: '#6b7280' }}>No tasks yet. Click a day to add one.</div>}
          {tasks.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
              {tasks
                .slice()
                .sort((a, b) => a.time.localeCompare(b.time))
                .map(task => (
                  <li key={task.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px' }}>
                    <span style={{ fontWeight: 600, color: '#111827' }}>{task.title}</span>
                    <span style={{ color: '#6b7280', fontSize: 12 }}>{task.time} • {task.category}</span>
                  </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
