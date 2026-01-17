import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Day from './pages/Day' // <--- This must say 'DayView'// --- Components ---

function Calendar() {
  return (
    <div className="p-10 text-center">
      <h1 className="text-4xl font-bold text-blue-600 mb-4">TimePilot Calendar</h1>
      <p className="mb-4">Select a date to plan your day.</p>
      <Link to="/day/2026-01-17" className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition">
        Test: Go to Jan 17
      </Link>
    </div>
  )
}

function Login() {
  return (
    <div className="p-10 text-center">
      <h1 className="text-2xl">Login Page</h1>
    </div>
  )
}

// --- Main App ---

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-white text-gray-900">
        <nav className="p-4 border-b shadow-sm flex justify-between items-center">
          <span className="font-bold text-xl">TimePilot</span>
          <Link to="/login" className="text-sm text-gray-600">Login</Link>
        </nav>

        <Routes>
          <Route path="/" element={<Calendar />} />
          <Route path="/day/:date" element={<Day />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
