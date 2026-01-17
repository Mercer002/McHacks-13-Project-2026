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
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <button
          className="icon-button"
          onClick={() => setOpen(!open)}
          aria-label="Settings"
        >
          <Settings size={28} />
        </button>

        {open && (
          <div
            className="dropdown"
            style={{ position: 'absolute', top: '50%', left: '105%', transform: 'translateY(-50%)' }}
          >
            <button
              onClick={handleLogout}
              style={{
                minWidth: 140,
                whiteSpace: 'nowrap',
              }}
            >
              Log out
            </button>
          </div>
        )}
      </div>

      <div className="navbar-brand">
        <h2 className="navbar-title">TimePilot</h2>
        <img src={logo} alt="TimePilot" className="navbar-logo" />
      </div>
    </nav>
  )
}
