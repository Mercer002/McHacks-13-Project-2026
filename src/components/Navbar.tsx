import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Settings } from 'lucide-react'
import logo from '../assets/timepilot-logo.png'

export default function Navbar() {
  const [open, setOpen] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <nav className="navbar">
      <button
        className="icon-button"
        onClick={() => setOpen(!open)}
        aria-label="Settings"
      >
        <Settings size={28} />
      </button>

      <div className="navbar-brand">
        <h2 className="navbar-title">TimePilot</h2>
        <img src={logo} alt="TimePilot" className="navbar-logo" />
      </div>

      {open && (
        <div className="dropdown">
          <button onClick={handleLogout}>Log out</button>
        </div>
      )}
    </nav>
  )
}