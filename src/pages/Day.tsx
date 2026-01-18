import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { parseISO, format } from 'date-fns'
import { CheckCircle, Circle, Trash2, Plus, Clock, Calendar as CalIcon, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { analyzeEstimate } from '../lib/ai'
import { getTasksForDate, saveTasksForDate } from '../lib/taskStore'
import type { Task } from '../lib/taskStore'

declare const google: any

type Props = {
  userId: string
}

export default function DayView({ userId }: Props) {
    const { date } = useParams()
    const [tasks, setTasks] = useState<Task[]>([])
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    const parsedDate = useMemo(() => {
        if (!date) return new Date()
        const parsed = parseISO(date)
        return isNaN(parsed.getTime()) ? new Date() : parsed
    }, [date])

    const displayDate = useMemo(() => format(parsedDate, 'EEEE, MMMM d, yyyy'), [parsedDate])
    const dateKey = useMemo(() => format(parsedDate, 'yyyy-MM-dd'), [parsedDate])

    useEffect(() => {
        try {
            const data = getTasksForDate(userId, dateKey)
            setTasks(data ?? [])
            setError(null)
        } catch (err) {
            console.error('Task load error', err)
            setError('Unable to load tasks right now.')
            setTasks([])
        }
    }, [userId, dateKey])

    // --- CONFIGURATION ---
    const startHour = 0
    const endHour = 23
    const pxPerMinute = 2
    const hourHeight = 60 * pxPerMinute
    // Start time input: single HH:MM string plus simple AM/PM toggle
    // Duration input: single HH:MM string representing hours:minutes (e.g. 02:45)
    // --- STATE ---
    const [taskName, setTaskName] = useState('')
    const [timeInput, setTimeInput] = useState('00:00')
    const [timePeriod, setTimePeriod] = useState<'AM' | 'PM'>('AM')
    const [taskCategory, setTaskCategory] = useState('Work')
    // duration stored in UI as HH:MM string; internal storage uses minutes
    const [durationInput, setDurationInput] = useState('01:00')
    const [showAdd, setShowAdd] = useState(false)
    const [taskLocation, setTaskLocation] = useState('')
    const [taskTravelMode, setTaskTravelMode] = useState<'driving' | 'walking' | 'transit' | 'bicycling'>('driving')
    const [travelStatus, setTravelStatus] = useState<string | null>(null)
    const [isFetchingTravel, setIsFetchingTravel] = useState(false)
    const [aiSuggestion, setAiSuggestion] = useState<string | null>(null)
    const [aiSuggestedDuration, setAiSuggestedDuration] = useState<number | null>(null)
    const [aiFamily, setAiFamily] = useState<string | null>(null)
    const [aiSampleSize, setAiSampleSize] = useState<number | null>(null)
    const [aiComputedMedian, setAiComputedMedian] = useState<number | null>(null)
    const [showAiModal, setShowAiModal] = useState(false)
    const [pendingNewTask, setPendingNewTask] = useState<Task | null>(null)
    const [pendingAddressTask, setPendingAddressTask] = useState<Task | null>(null)
    const [showAddressModal, setShowAddressModal] = useState(false)
    const [addressLookupStatus, setAddressLookupStatus] = useState<string | null>(null)
    const [addressLookupMinutes, setAddressLookupMinutes] = useState<number | null>(null)
    const [showMapModal, setShowMapModal] = useState(false)
    const [mapSelectedPos, setMapSelectedPos] = useState<{ lat: number; lng: number } | null>(null)
    const [mapSelectedAddress, setMapSelectedAddress] = useState<string | null>(null)
    const [mapLoading, setMapLoading] = useState(false)
    // loading state intentionally omitted from UI for now

    // --- ACTIONS ---
    const persistTasks = async (next: Task[]) => {
        setSaving(true)
        try {
            saveTasksForDate(userId, dateKey, next)
            setError(null)
        } catch (err) {
            console.error('Save error', err)
            setError('Could not save tasks. Changes may be local only.')
        } finally {
            setSaving(false)
        }
    }

    const makeTaskId = () => {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return crypto.randomUUID()
        }
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`
    }

    type TravelResult = { minutes: number | null; status: string }

    const loadGoogleMaps = () => {
        if (typeof window === 'undefined') return Promise.reject(new Error('No window'))
        if ((window as any).google?.maps) return Promise.resolve((window as any).google)
        const existing = (window as any)._gmapsPromise
        if (existing) return existing
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
        if (!apiKey) return Promise.reject(new Error('Missing Google Maps API key'))
        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script')
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
            script.async = true
            script.onerror = () => reject(new Error('Failed to load Google Maps JS API'))
            script.onload = () => resolve((window as any).google)
            document.head.appendChild(script)
        })
        ;(window as any)._gmapsPromise = promise
        return promise
    }

    const geocodeAddress = async (gmaps: any, address: string) => {
        return new Promise<string | null>((resolve) => {
            const geocoder = new gmaps.maps.Geocoder()
            geocoder.geocode(
                { address, region: 'ca', componentRestrictions: { country: 'CA' } },
                (results: any, status: string) => {
                    if (status === 'OK' && results?.[0]?.formatted_address) {
                        resolve(results[0].formatted_address)
                    } else {
                        resolve(null)
                    }
                }
            )
        })
    }

    const getDistanceMinutes = async (gmaps: any, origin: string, destination: string, mode: 'driving' | 'walking' | 'transit' | 'bicycling') => {
        const modeMap = {
            driving: gmaps.maps.TravelMode.DRIVING,
            walking: gmaps.maps.TravelMode.WALKING,
            transit: gmaps.maps.TravelMode.TRANSIT,
            bicycling: gmaps.maps.TravelMode.BICYCLING,
        }

        return new Promise<TravelResult>((resolve) => {
            const service = new gmaps.maps.DistanceMatrixService()
            service.getDistanceMatrix(
                {
                    origins: [origin],
                    destinations: [destination],
                    travelMode: modeMap[mode] || gmaps.maps.TravelMode.DRIVING,
                    unitSystem: gmaps.maps.UnitSystem.METRIC,
                    transitOptions: mode === 'transit' ? { departureTime: new Date() } : undefined,
                },
                (response: any, status: string) => {
                    if (status !== 'OK') {
                        resolve({ minutes: null, status: `Distance Matrix status: ${status}; task saved without travel time.` })
                        return
                    }
                    const element = response?.rows?.[0]?.elements?.[0]
                    if (!element || element.status !== 'OK' || !element.duration?.value) {
                        resolve({ minutes: null, status: `Travel time unavailable (${element?.status || 'NO_DATA'}); task saved without it.` })
                        return
                    }
                    resolve({ minutes: Math.round(element.duration.value / 60), status: 'Travel time added.' })
                }
            )
        })
    }

    const fetchTravelMinutes = async (destination: string, mode: 'driving' | 'walking' | 'transit' | 'bicycling'): Promise<TravelResult> => {
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
        const defaultOrigin = '1200-3600 Rue Mctavish Montreal QC H3A 0G3 Canada'
        const origin = import.meta.env.VITE_DEFAULT_ORIGIN || defaultOrigin
        if (!apiKey || !origin || !destination) {
            return { minutes: null, status: 'Travel lookup skipped: missing origin or API key.' }
        }

        try {
            setIsFetchingTravel(true)
            const gmaps = await loadGoogleMaps()
            const resolved = (await geocodeAddress(gmaps, destination)) || destination
            return await getDistanceMinutes(gmaps, origin, resolved, mode)
        } catch (err) {
            console.error('Travel time lookup failed', err)
            return { minutes: null, status: 'Travel lookup failed; task saved without travel time.' }
        } finally {
            setIsFetchingTravel(false)
        }
    }

    // --- Helpers for HH:MM parsing/formatting ---
    const parseHHMMToMinutes = (s: string | undefined): number | null => {
        if (!s) return null
        const parts = s.split(':')
        if (parts.length !== 2) return null
        const hh = parseInt(parts[0], 10)
        const mm = parseInt(parts[1], 10)
        if (isNaN(hh) || isNaN(mm)) return null
        return hh * 60 + mm
    }

    const formatMinutesToHHMM = (mins: number) => {
        const h = Math.floor(mins / 60)
        const m = mins % 60
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }

    const humanizeMinutes = (mins: number | null | undefined) => {
        if (mins == null) return 'unknown'
        const h = Math.floor(mins / 60)
        const m = mins % 60
        if (h > 0 && m > 0) return `${h} hour${h !== 1 ? 's' : ''} and ${m} minute${m !== 1 ? 's' : ''}`
        if (h > 0) return `${h} hour${h !== 1 ? 's' : ''}`
        return `${m} minute${m !== 1 ? 's' : ''}`
    }

    const adjustHHMMByMinutes = (s: string | undefined, delta: number) => {
        const mins = parseHHMMToMinutes(s) ?? 0
        const next = Math.max(0, mins + delta)
        // format back to HH:MM
        const h = Math.floor(next / 60)
        const m = next % 60
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }

    // --- Map modal: initialize Google Map and allow clicking to pick an address ---
    // When `showMapModal` becomes true we create a map in #task-map and attach a click listener.
    // Clicking sets `mapSelectedPos` and reverse-geocodes to `mapSelectedAddress`.
    useEffect(() => {
        if (!showMapModal) return
        let map: any = null
        let marker: any = null
        let geocoder: any = null
        let listener: any = null

        const setup = async () => {
            setMapLoading(true)
            try {
                const gmaps = await loadGoogleMaps()
                const el = document.getElementById('task-map')
                if (!el) return
                geocoder = new gmaps.maps.Geocoder()
                // center on default origin (or user's current position when available)
                const defaultOrigin = import.meta.env.VITE_DEFAULT_ORIGIN || ''
                let center = { lat: 45.504, lng: -73.578 }
                if (defaultOrigin) {
                    try {
                        const res = await new Promise<any>((resolve) => geocoder.geocode({ address: defaultOrigin }, (r: any) => resolve(r)))
                        if (res?.results?.[0]?.geometry?.location) {
                            const loc = res.results[0].geometry.location
                            center = { lat: loc.lat(), lng: loc.lng() }
                        }
                    } catch (e) {
                        // ignore
                    }
                } else if (navigator.geolocation) {
                    try {
                        const p = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 }))
                        center = { lat: p.coords.latitude, lng: p.coords.longitude }
                    } catch (e) {
                        // ignore
                    }
                }

                map = new gmaps.maps.Map(el, { center, zoom: 13 })
                marker = new gmaps.maps.Marker({ map })

                // if there's an existing typed location, try to geocode and place marker
                if (taskLocation) {
                    geocoder.geocode({ address: taskLocation }, (results: any, status: string) => {
                        if (status === 'OK' && results?.[0]?.geometry?.location) {
                            const loc = results[0].geometry.location
                            const latlng = { lat: loc.lat(), lng: loc.lng() }
                            marker.setPosition(latlng)
                            map.setCenter(latlng)
                            setMapSelectedPos(latlng)
                            setMapSelectedAddress(results[0].formatted_address || taskLocation)
                        }
                    })
                }

                listener = map.addListener('click', (e: any) => {
                    const latLng = e.latLng
                    const lat = latLng.lat()
                    const lng = latLng.lng()
                    marker.setPosition({ lat, lng })
                    setMapSelectedPos({ lat, lng })
                    geocoder.geocode({ location: { lat, lng } }, (results: any, status: string) => {
                        if (status === 'OK' && results?.[0]?.formatted_address) {
                            setMapSelectedAddress(results[0].formatted_address)
                        } else {
                            setMapSelectedAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`)
                        }
                    })
                })
            } catch (err) {
                console.warn('Map setup failed', err)
            } finally {
                setMapLoading(false)
            }
        }

        setup()

        return () => {
            try {
                if (listener && (window as any).google?.maps && map) (window as any).google.maps.event.removeListener(listener)
            } catch (e) {
                // ignore
            }
        }
    }, [showMapModal])

    const persistNewTask = async (t: Task) => {
        const updated = [...tasks, t]
        setTasks(updated)
        await persistTasks(updated)
        setTaskName('')
        setTimeInput('00:00')
        setTimePeriod('AM')
        setDurationInput('01:00')
        setShowAdd(false)
    }

    const addTask = async (e: FormEvent) => {
        e.preventDefault()
        if (!taskName) return
        // reset any previous address/modal state
        setTravelStatus(null)
        setAddressLookupStatus(null)

        // Compose time from single HH:MM input + AM/PM toggle -> convert to 24-hour HH:MM

        const timeRaw = (timeInput || '00:00').trim()
        let [rawH, rawM] = timeRaw.split(':')
        rawH = rawH ?? '0'
        rawM = rawM ?? '0'
        let hh = parseInt(rawH, 10)
        if (isNaN(hh)) hh = 0
        let mm = parseInt(rawM, 10)
        if (isNaN(mm)) mm = 0
        // clamp
        if (mm < 0) mm = 0
        if (mm > 59) mm = 59

        // If user provided a 12-hour style hour (1-12), apply AM/PM toggle
        if (hh >= 1 && hh <= 12) {
            if (timePeriod === 'AM') {
                if (hh === 12) hh = 0
            } else {
                if (hh !== 12) hh = hh + 12
            }
        }
        const hhStr = String(hh).padStart(2, '0')
        const mmStr = String(mm).padStart(2, '0')
        const composedTime = `${hhStr}:${mmStr}`

        // Parse durationInput (HH:MM) -> total minutes
        const parseDurationInput = (s: string | undefined) => {
            if (!s) return 0
            const parts = s.split(':')
            if (parts.length !== 2) return 0
            const dh = parseInt(parts[0], 10)
            const dm = parseInt(parts[1], 10)
            if (isNaN(dh) || isNaN(dm)) return 0
            return Math.max(1, dh * 60 + Math.max(0, Math.min(59, dm)))
        }

        const totalDuration = parseDurationInput(durationInput)
        const newTask: Task = {
            id: makeTaskId(),
            title: taskName,
            completed: false,
            time: composedTime,
            duration: totalDuration,
            category: taskCategory,
            dateKey,
            location: taskLocation || undefined,
            travelMinutes: undefined,
            travelMode: taskTravelMode,
        }

        // If user provided a location, open our styled address modal to avoid any blank popups
        if (taskLocation) {
            setPendingAddressTask(newTask)
            setShowAddressModal(true)
            return
        }

        // No location: proceed with AI analysis / persist
        try {
            const result = await analyzeEstimate(userId, newTask.title, newTask.duration)
            if (result && result.message) {
                setAiSuggestion(result.message)
                setAiSuggestedDuration(result.suggestedDuration ?? null)
                setAiFamily((result as any).family ?? null)
                setAiSampleSize((result as any).sampleSize ?? null)
                setAiComputedMedian((result as any).computedMedian ?? null)
                setPendingNewTask(newTask)
                setShowAiModal(true)
                return
            }
        } catch (err) {
            console.warn('AI analysis failed', err)
        }

        await persistNewTask(newTask)
    }

    const acceptAiSuggestion = async () => {
        if (!pendingNewTask) return
        if (aiSuggestedDuration) pendingNewTask.duration = aiSuggestedDuration
        await persistNewTask(pendingNewTask)
        setPendingNewTask(null)
        setShowAiModal(false)
        setAiSuggestion(null)
        setAiSuggestedDuration(null)
        setAiFamily(null)
        setAiSampleSize(null)
        setAiComputedMedian(null)
    }

    const dismissAiSuggestion = async () => {
        if (!pendingNewTask) return
        await persistNewTask(pendingNewTask)
        setPendingNewTask(null)
        setShowAiModal(false)
        setAiSuggestion(null)
        setAiSuggestedDuration(null)
        setAiFamily(null)
        setAiSampleSize(null)
        setAiComputedMedian(null)
    }

    // Address modal handlers
    const performAddressLookup = async () => {
        if (!pendingAddressTask) return
        try {
            setAddressLookupStatus('Looking up travel time...')
            const res = await fetchTravelMinutes(taskLocation, taskTravelMode)
            if (res.minutes != null) {
                setAddressLookupMinutes(res.minutes)
                setAddressLookupStatus(`Found ~${res.minutes} minutes`)
            } else {
                setAddressLookupMinutes(null)
                setAddressLookupStatus(res.status || 'No travel time available')
            }
        } catch (err) {
            console.warn('Address lookup failed', err)
            setAddressLookupStatus('Lookup failed')
            setAddressLookupMinutes(null)
        }
    }

    const addressAddWithTravel = async () => {
        if (!pendingAddressTask) return
        const minutes = addressLookupMinutes ?? 0
        const updated: Task = { ...pendingAddressTask, duration: pendingAddressTask.duration + minutes, travelMinutes: minutes }
        setShowAddressModal(false)
        setPendingAddressTask(null)

        // Run AI analysis flow (same as when creating a task normally)
        try {
            const result = await analyzeEstimate(userId, updated.title, updated.duration)
            if (result && result.message) {
                setAiSuggestion(result.message)
                setAiSuggestedDuration(result.suggestedDuration ?? null)
                setAiFamily((result as any).family ?? null)
                setAiSampleSize((result as any).sampleSize ?? null)
                setAiComputedMedian((result as any).computedMedian ?? null)
                setPendingNewTask(updated)
                setShowAiModal(true)
                return
            }
        } catch (err) {
            console.warn('AI analysis failed', err)
        }

        await persistNewTask(updated)
    }

    const addressSaveWithoutTravel = async () => {
        if (!pendingAddressTask) return
        const updated = { ...pendingAddressTask }
        setShowAddressModal(false)
        setPendingAddressTask(null)

        try {
            const result = await analyzeEstimate(userId, updated.title, updated.duration)
            if (result && result.message) {
                setAiSuggestion(result.message)
                setAiSuggestedDuration(result.suggestedDuration ?? null)
                setAiFamily((result as any).family ?? null)
                setAiSampleSize((result as any).sampleSize ?? null)
                setAiComputedMedian((result as any).computedMedian ?? null)
                setPendingNewTask(updated)
                setShowAiModal(true)
                return
            }
        } catch (err) {
            console.warn('AI analysis failed', err)
        }

        await persistNewTask(updated)
    }

    const toggleTask = async (id: string) => {
        const updated = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t)
        setTasks(updated)
        await persistTasks(updated)
    }

    // --- Completion modal flow ---
    const [showCompleteModal, setShowCompleteModal] = useState(false)
    const [modalTask, setModalTask] = useState<Task | null>(null)
    // use string so the input can be fully cleared by the user (empty string)
    const [actualDuration, setActualDuration] = useState<string>('')
    const [completionError, setCompletionError] = useState<string | null>(null)

    const openCompleteModal = (task: Task) => {
        setModalTask(task)
        // Prefill with the estimated duration as HH:MM string so user can edit it
        setActualDuration(formatMinutesToHHMM(task.duration ?? 0))
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

        // parse actualDuration HH:MM -> minutes
        const parsed = parseHHMMToMinutes(actualDuration) ?? NaN
        if (isNaN(parsed) || parsed <= 0) {
            setCompletionError('Please enter a positive duration in HH:MM')
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
            const { data: userData, error: userErr } = await supabase.auth.getUser()
            if (userErr) console.warn('Could not fetch user from supabase.auth.getUser()', userErr)

            const enriched = {
                ...record,
                user_id: userId,
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
        await persistTasks(updated)

        // close modal
        setShowCompleteModal(false)
        setModalTask(null)
    }

    const deleteTask = async (id: string) => {
        const updated = tasks.filter(t => t.id !== id)
        setTasks(updated)
        await persistTasks(updated)
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

    const hashString = (value: string) => {
        let hash = 0
        for (let i = 0; i < value.length; i++) {
            hash = (hash << 5) - hash + value.charCodeAt(i)
            hash |= 0 // force 32-bit
        }
        return Math.abs(hash)
    }

    const getTaskColor = (task: Task) => {
        if (task.completed) {
            return { bg: '#27272a', border: '#3f3f46' }
        }
        const color = taskColors[hashString(task.id) % taskColors.length]
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

            {error && (
                <div style={{ padding: '10px 24px', color: '#fca5a5', backgroundColor: '#3f1d2e', borderBottom: '1px solid #7f1d1d' }}>
                    {error}
                </div>
            )}

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
                            onClick={() => {
                                setTravelStatus(null)
                                setIsFetchingTravel(false)
                                setTaskLocation('')
                                setTaskTravelMode('driving')
                                setShowAdd(true)
                            }}
                            style={{ backgroundColor: '#2563eb', color: 'white', padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
                        >
                            <Plus size={20} />
                        </button>
                    </div>
                    {saving && (
                        <div style={{ color: '#a5b4fc', fontSize: 12, marginBottom: 8 }}>
                            Saving to cloud...
                        </div>
                    )}
                    {travelStatus && (
                        <div style={{ color: '#a1a1aa', fontSize: 12, marginBottom: 8 }}>
                            {travelStatus}
                        </div>
                    )}

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
                                    {task.location && (
                                        <span style={{ fontSize: '12px', color: '#a1a1aa' }}>
                                            {task.location}
                                            {task.travelMinutes ? ` • +${task.travelMinutes}m ${task.travelMode || 'travel'}` : ''}
                                        </span>
                                    )}
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
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9:]*"
                                            value={timeInput}
                                            onChange={(e) => {
                                                // allow editing to an empty string so user can fully backspace
                                                let raw = e.target.value.replace(/[^0-9:]/g, '').slice(0,5)
                                                if (raw === '') {
                                                    setTimeInput('')
                                                    return
                                                }
                                                // if user types contiguous digits like 0930 -> auto-insert colon when length >=3
                                                if (!raw.includes(':') && raw.length > 2) raw = raw.slice(0,2) + ':' + raw.slice(2)
                                                setTimeInput(raw)
                                            }}
                                            onBlur={() => {
                                                // Normalize on blur: ensure HH:MM, clamp minutes to 0-59, clamp hours to 1-11 for 12-hour clock, default to 00:00 when empty
                                                const raw = (timeInput || '').trim()
                                                if (!raw) {
                                                    setTimeInput('00:00')
                                                    return
                                                }
                                                let parts = raw.split(':')
                                                if (parts.length === 1) {
                                                    // only hours entered
                                                    let hhN = Number(parts[0] || 0)
                                                    if (isNaN(hhN)) hhN = 0
                                                    // clamp to 1..11 (12-hour clock up to 11:59 as requested)
                                                    hhN = Math.max(1, Math.min(11, hhN || 1))
                                                    const hh = String(hhN).padStart(2, '0')
                                                    setTimeInput(`${hh}:00`)
                                                    return
                                                }
                                                let hh = parts[0] || '0'
                                                let mm = parts[1] || '0'
                                                let hhN = Number(hh || 0)
                                                if (isNaN(hhN)) hhN = 0
                                                hhN = Math.max(1, Math.min(11, hhN || 1))
                                                hh = String(hhN).padStart(2, '0')
                                                let mmN = parseInt(mm, 10)
                                                if (isNaN(mmN) || mmN < 0) mmN = 0
                                                if (mmN > 59) mmN = 59
                                                mm = String(mmN).padStart(2, '0')
                                                setTimeInput(`${hh}:${mm}`)
                                            }}
                                            placeholder="00:00"
                                            style={{ width: '72px', padding: '8px', borderRadius: '8px', border: '1px solid #3f3f46', backgroundColor: '#27272a', color: '#fff', outline: 'none', height: '40px', textAlign: 'center', fontSize: '14px' }}
                                        />
                                        <div style={{ marginLeft: 8 }}>
                                            <button type="button" onClick={() => setTimePeriod(prev => prev === 'AM' ? 'PM' : 'AM')} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #3f3f46', background: '#111827', color: '#a1a1aa', cursor: 'pointer' }}>{timePeriod}</button>
                                        </div>
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
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#a1a1aa', marginBottom: '4px' }}>Duration (HH:MM)</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9:]*"
                                        value={durationInput}
                                        onChange={(e) => {
                                            let raw = e.target.value.replace(/[^0-9:]/g, '').slice(0,5)
                                            if (raw === '') {
                                                setDurationInput('')
                                                return
                                            }
                                            if (!raw.includes(':') && raw.length > 2) raw = raw.slice(0,2) + ':' + raw.slice(2)
                                            setDurationInput(raw)
                                        }}
                                        onBlur={() => {
                                            const raw = (durationInput || '').trim()
                                            if (!raw) {
                                                setDurationInput('00:00')
                                                return
                                            }
                                            let parts = raw.split(':')
                                            if (parts.length === 1) {
                                                const hh = String(Math.max(0, Number(parts[0] || 0))).padStart(2, '0')
                                                setDurationInput(`${hh}:00`)
                                                return
                                            }
                                            let dh = Number(parts[0] || 0)
                                            let dm = parseInt(parts[1] || '0', 10)
                                            if (isNaN(dh) || dh < 0) dh = 0
                                            if (isNaN(dm) || dm < 0) dm = 0
                                            // normalize overflow minutes into hours
                                            dh += Math.floor(dm / 60)
                                            dm = dm % 60
                                            setDurationInput(`${String(dh).padStart(2, '0')}:${String(dm).padStart(2, '0')}`)
                                        }}
                                        placeholder="02:30"
                                        style={{ width: '72px', padding: '8px', borderRadius: '8px', border: '1px solid #3f3f46', backgroundColor: '#27272a', color: '#fff', outline: 'none', height: '40px', textAlign: 'center', fontSize: '14px' }}
                                    />
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <button type="button" onClick={() => setDurationInput(prev => adjustHHMMByMinutes(prev, 1))} style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #3f3f46', background: '#111827', color: '#fff', cursor: 'pointer' }}>▲</button>
                                        <button type="button" onClick={() => setDurationInput(prev => adjustHHMMByMinutes(prev, -1))} style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #3f3f46', background: '#111827', color: '#fff', cursor: 'pointer' }}>▼</button>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#a1a1aa', marginBottom: '4px' }}>Location (optional)</label>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        placeholder="e.g., 123 Main St or Coffee Shop"
                                        value={taskLocation}
                                        onChange={(e) => setTaskLocation(e.target.value)}
                                        style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #3f3f46', backgroundColor: '#27272a', color: '#fff', outline: 'none', height: '48px' }}
                                    />
                                    <button type="button" onClick={() => { setShowMapModal(true); setMapSelectedAddress(null); setMapSelectedPos(null) }} title="Pick on map" style={{ padding: '10px', borderRadius: 8, border: '1px solid #3f3f46', background: '#111827', color: '#fff', cursor: 'pointer' }}>
                                        {/* simple inline map pin SVG */}
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 6-9 13-9 13S3 16 3 10a9 9 0 0118 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                    </button>
                                </div>
                                {isFetchingTravel && (
                                    <div style={{ fontSize: '12px', color: '#a5b4fc', marginTop: '6px' }}>
                                        Checking travel time...
                                    </div>
                                )}
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#a1a1aa', marginBottom: '4px' }}>Travel mode</label>
                                <select
                                    value={taskTravelMode}
                                    onChange={(e) => setTaskTravelMode(e.target.value as any)}
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #3f3f46', backgroundColor: '#27272a', color: '#fff', outline: 'none', height: '48px' }}
                                >
                                    <option value="driving">Driving</option>
                                    <option value="walking">Walking</option>
                                    <option value="transit">Transit</option>
                                    <option value="bicycling">Bicycling</option>
                                </select>
                            </div>

                            <button type="submit" style={{ width: '100%', padding: '12px', backgroundColor: '#2563eb', color: 'white', borderRadius: '8px', border: 'none', fontWeight: 'bold', marginTop: '8px', cursor: 'pointer' }}>
                                Create Task
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Address Confirmation / Lookup Modal */}
            {showAddressModal && pendingAddressTask && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 75 }}>
                    <div style={{ backgroundColor: '#0b1222', borderRadius: '12px', padding: '18px', width: '100%', maxWidth: '520px', border: '1px solid #213547', color: '#e6eef8' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <h3 style={{ margin: 0, fontSize: 18 }}>Address entered</h3>
                            <button onClick={() => { setShowAddressModal(false); setPendingAddressTask(null); setAddressLookupStatus(null); setAddressLookupMinutes(null); }} style={{ color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <p style={{ color: '#cbd5e1', marginTop: 0 }}>Address: <strong style={{ color: '#e6eef8' }}>{taskLocation}</strong></p>
                        {addressLookupStatus && (
                            <div style={{ marginTop: 8, color: '#9fb4d6', fontSize: 13 }}>{addressLookupStatus}</div>
                        )}

                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button onClick={performAddressLookup} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 10px', borderRadius: 8, cursor: 'pointer' }}>Lookup travel</button>
                            <button onClick={addressSaveWithoutTravel} style={{ background: '#374151', color: '#fff', border: 'none', padding: '8px 10px', borderRadius: 8, cursor: 'pointer' }}>Save</button>
                            <button onClick={() => { setShowAddressModal(false); setPendingAddressTask(null); setAddressLookupStatus(null); setAddressLookupMinutes(null); }} style={{ background: '#6b7280', color: '#fff', border: 'none', padding: '8px 10px', borderRadius: 8 }}>Cancel</button>
                        </div>

                        {addressLookupMinutes != null && (
                            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                                <button onClick={addressAddWithTravel} style={{ flex: 1, background: '#10b981', color: '#021012', border: 'none', padding: '10px', borderRadius: 8 }}>Add ~{addressLookupMinutes}m</button>
                                <button onClick={addressSaveWithoutTravel} style={{ flex: 1, background: '#374151', color: '#fff', border: 'none', padding: '10px', borderRadius: 8 }}>Skip</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Map picker modal */}
            {showMapModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120 }}>
                    <div style={{ backgroundColor: '#0b1222', borderRadius: '12px', padding: '18px', width: '100%', maxWidth: '820px', border: '1px solid #213547', color: '#e6eef8' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <h3 style={{ margin: 0, fontSize: 18 }}>Pick a location</h3>
                            <button onClick={() => setShowMapModal(false)} style={{ color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <div id="task-map" style={{ width: '100%', height: '420px', borderRadius: 8, overflow: 'hidden', border: '1px solid #213547' }} />

                        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ color: '#9fb4d6', fontSize: 13 }}>{mapSelectedAddress ?? (mapLoading ? 'Loading map...' : 'Click on the map to pick a location')}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => {
                                    if (mapSelectedAddress) setTaskLocation(mapSelectedAddress)
                                    setShowMapModal(false)
                                }} disabled={!mapSelectedAddress} style={{ background: mapSelectedAddress ? '#10b981' : '#374151', color: mapSelectedAddress ? '#021012' : '#9ca3af', border: 'none', padding: '8px 10px', borderRadius: 8, cursor: mapSelectedAddress ? 'pointer' : 'not-allowed' }}>Confirm</button>
                                <button onClick={() => setShowMapModal(false)} style={{ background: '#6b7280', color: '#fff', border: 'none', padding: '8px 10px', borderRadius: 8 }}>Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Suggestion Modal */}
            {showAiModal && aiSuggestion && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70 }}>
                    <div style={{ backgroundColor: '#0b1222', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '520px', border: '1px solid #213547', color: '#e6eef8' }}>
                        <h3 style={{ margin: 0, marginBottom: 8, fontSize: 18 }}>Suggestion from Assistant</h3>
                        {aiFamily && (
                            <div style={{ display: 'inline-block', marginBottom: 8 }}>
                                <span style={{ fontSize: 12, padding: '6px 10px', borderRadius: 999, background: '#1e293b', color: '#c7d2fe', fontWeight: 700 }}>Detected: {aiFamily}</span>
                            </div>
                        )}
                        {aiSampleSize != null && aiComputedMedian != null && (
                            <div style={{ color: '#9fb4d6', fontSize: 13, marginTop: 8 }}>
                                Based on {aiSampleSize} similar task{aiSampleSize !== 1 ? 's' : ''}, median was {aiComputedMedian} minutes.
                            </div>
                        )}
                        <p style={{ color: '#cbd5e1', marginTop: aiFamily ? 8 : 0 }}>{aiSuggestion}</p>
                        {aiSuggestedDuration && (
                            <p style={{ color: '#9ae6b4', fontWeight: 700 }}>Suggested duration: {humanizeMinutes(aiSuggestedDuration)}</p>
                        )}
                        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                            <button onClick={acceptAiSuggestion} style={{ flex: 1, background: '#10b981', border: 'none', padding: '10px', borderRadius: 8, color: '#021012', fontWeight: 700 }}>Accept suggestion</button>
                            <button onClick={dismissAiSuggestion} style={{ flex: 1, background: '#374151', border: 'none', padding: '10px', borderRadius: 8, color: '#fff' }}>Keep my estimate</button>
                        </div>
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
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#a1a1aa', marginBottom: 6 }}>Actual duration (HH:MM)</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9:]*"
                                    value={actualDuration}
                                    onChange={(e) => {
                                        let raw = e.target.value.replace(/[^0-9:]/g, '').slice(0,5)
                                        if (raw === '') {
                                            setActualDuration('')
                                            return
                                        }
                                        if (!raw.includes(':') && raw.length > 2) raw = raw.slice(0,2) + ':' + raw.slice(2)
                                        setActualDuration(raw)
                                    }}
                                    onBlur={() => {
                                        const raw = (actualDuration || '').trim()
                                        if (!raw) {
                                            setActualDuration(formatMinutesToHHMM(0))
                                            return
                                        }
                                        let parts = raw.split(':')
                                        if (parts.length === 1) {
                                            const hh = String(Math.max(0, Number(parts[0] || 0))).padStart(2, '0')
                                            setActualDuration(`${hh}:00`)
                                            return
                                        }
                                        let dh = Number(parts[0] || 0)
                                        let dm = parseInt(parts[1] || '0', 10)
                                        if (isNaN(dh) || dh < 0) dh = 0
                                        if (isNaN(dm) || dm < 0) dm = 0
                                        dh += Math.floor(dm / 60)
                                        dm = dm % 60
                                        setActualDuration(`${String(dh).padStart(2, '0')}:${String(dm).padStart(2, '0')}`)
                                    }}
                                    style={{ width: '72px', padding: '8px', borderRadius: '8px', border: '1px solid #3f3f46', backgroundColor: '#27272a', color: '#fff', outline: 'none', height: '40px', textAlign: 'center', fontSize: '14px' }}
                                />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <button type="button" onClick={() => setActualDuration(prev => adjustHHMMByMinutes(prev, 1))} style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #3f3f46', background: '#111827', color: '#fff', cursor: 'pointer' }}>▲</button>
                                    <button type="button" onClick={() => setActualDuration(prev => adjustHHMMByMinutes(prev, -1))} style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #3f3f46', background: '#111827', color: '#fff', cursor: 'pointer' }}>▼</button>
                                </div>
                            </div>
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
