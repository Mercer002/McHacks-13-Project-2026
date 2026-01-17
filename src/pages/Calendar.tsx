import { useNavigate } from 'react-router-dom'

export default function Calendar() {
  const navigate = useNavigate()

  return (
    <div className="center">
      <h1>Calendar</h1>
      <p>(Placeholder)</p>

      {/* Temporary test button */}
      <button onClick={() => navigate('/day/2026-01-17')}>
        Go to Jan 17
      </button>
    </div>
  )
}
