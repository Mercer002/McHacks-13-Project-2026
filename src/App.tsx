import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

import Login from './pages/Login'
import Signup from './pages/Signup'
import Calendar from './pages/Calendar'
import Day from './pages/Day'
import Navbar from './components/Navbar'

export default function App() {
  const [session, setSession] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
      }
    )

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  if (loading) return <div className="center">Loading...</div>

  return (
    <BrowserRouter>
      {session && <Navbar />}

      <Routes>
        <Route
          path="/login"
          element={!session ? <Login /> : <Navigate to="/calendar" />}
        />

        <Route path="/signup" element={<Signup />} />

        <Route
          path="/calendar"
          element={session ? <Calendar /> : <Navigate to="/login" />}
        />

        <Route
          path="/day/:date"
          element={session ? <Day /> : <Navigate to="/login" />}
        />

        <Route
          path="*"
          element={<Navigate to={session ? '/calendar' : '/login'} />}
        />
      </Routes>
    </BrowserRouter>
  )
}