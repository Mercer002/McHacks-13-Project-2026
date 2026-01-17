import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

// Pages
import Login from './pages/Login'
import Signup from './pages/Signup'
import Calendar from './pages/Calendar'
import Day from './pages/Day'

// Components
import Navbar from './components/Navbar'

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
      }
    )

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return <div className="center">Loading...</div>
  }

  return (
    <BrowserRouter>
      {/* Navbar only shows when logged in */}
      {session && <Navbar />}

      <Routes>
        {/* ---------- AUTH ---------- */}
        <Route
          path="/login"
          element={!session ? <Login /> : <Navigate to="/calendar" />}
        />

        <Route
          path="/signup"
          element={!session ? <Signup /> : <Navigate to="/calendar" />}
        />

        {/* ---------- APP ---------- */}
        <Route
          path="/calendar"
          element={session ? <Calendar /> : <Navigate to="/login" />}
        />

        <Route
          path="/day/:date"
          element={session ? <Day /> : <Navigate to="/login" />}
        />

        {/* ---------- DEFAULT ---------- */}
        <Route
          path="/"
          element={<Navigate to={session ? '/calendar' : '/login'} />}
        />

        <Route
          path="*"
          element={<Navigate to={session ? '/calendar' : '/login'} />}
        />
      </Routes>
    </BrowserRouter>
  )
}
