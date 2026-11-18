import { useState, type FormEvent } from 'react'
import { ArrowRight, KeyRound } from 'lucide-react'
import { ApiError, apiFor } from './api/client'
import type { Session } from './session'
import { BrandMark } from './TopBar'

interface Props {
  error: string | null
  onStart: (session: Session) => void
}

export function SignIn({ error, onStart }: Props) {
  const [key, setKey] = useState('')
  const [checking, setChecking] = useState(false)
  const [problem, setProblem] = useState(error)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = key.trim()
    if (!trimmed) return setProblem('Paste the API key you were given.')
    setChecking(true)
    try {
      await apiFor(trimmed).plans()
      onStart({ mode: 'live', key: trimmed })
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not check that key.')
      setChecking(false)
    }
  }

  return (
    <div className="signin">
      <header className="signin-brand">
        <BrandMark />
        <span>Voyance</span>
      </header>
      <main className="signin-card">
        <h1>Sign in to the Buy Desk</h1>
        <p>Use the API key your admin gave you. It stays in this tab only.</p>
        <form onSubmit={submit} noValidate>
          <label htmlFor="api-key">API key</label>
          <div className="signin-field">
            <KeyRound size={16} strokeWidth={2} aria-hidden="true" />
            <input
              id="api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="vy_…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? 'signin-problem' : undefined}
            />
          </div>
          {problem && (
            <p id="signin-problem" className="signin-problem" role="alert">
              {problem}
            </p>
          )}
          <button className="btn btn-primary" type="submit" disabled={checking}>
            {checking ? 'Checking…' : 'Sign in'}
            {!checking && <ArrowRight size={16} strokeWidth={2.25} aria-hidden="true" />}
          </button>
        </form>
        <div className="signin-demo">
          <p>No key? Look around with one saved plan on simulated data.</p>
          <button className="btn btn-secondary" type="button" onClick={() => onStart({ mode: 'demo' })}>
            Open the demo
          </button>
        </div>
      </main>
    </div>
  )
}
