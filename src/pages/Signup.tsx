import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signUp } from '../lib/auth'
import Input from '../components/Input'
import Button from '../components/Button'
import logo from '../assets/timepilot-logo.png'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSignup = async () => {
    setLoading(true)
    setError(null)

    const { error } = await signUp(email, password)
    if (error) setError(error.message)

    setLoading(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card-heading">
          <img src={logo} alt="TimePilot" className="logo" />
          <h1>Create account</h1>
        </div>
        <p className="subtitle">
          Start planning smarter days.
        </p>

        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />

        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />

        {error && <p className="error">{error}</p>}

        <Button onClick={handleSignup} disabled={loading}>
          Sign Up
        </Button>

        <p className="signup-text">
          Already have an account?{' '}
          <span onClick={() => navigate('/login')}>
            Log in
          </span>
        </p>
      </div>
    </div>
  )
}