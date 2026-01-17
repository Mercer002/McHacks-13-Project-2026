import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { useState } from 'react'

// --- PLACEHOLDER COMPONENTS (Your team will replace these later) ---

// Person 1: This will be the Month View
function CalendarPage() {
  return (
    <div className="p-10 text-center">
      <h1 className="text-4xl font-bold text-blue-600 mb-4">TimePilot Calendar</h1>
      <p className="mb-4">Select a date to plan your day.</p>
      {/* Temporary link to test navigation */}
      <Link to="/day/2026-01-17" className="bg-blue-500 text-white px-4 py-2 rounded">
        Click to test: Go to Jan 17
      </Link>
    </div>
  )
}

// Person 3: This will be the Day View + Feasibility Logic
function DayViewPage() {
  return (
    <div className="p-10">
      <h1 className="text-3xl font-bold">Planning for: Jan 17</h1>
      <Link to="/" className="text-blue-500 underline mt-4 block">← Back to Calendar</Link>
    </div>
  )
}

// Person 2: Login Page
function LoginPage() {
  return <h1>Login Page</h1>
}

// --- MAIN APP COMPONENT ---
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CalendarPage />} />
        <Route path="/day/:date" element={<DayViewPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
