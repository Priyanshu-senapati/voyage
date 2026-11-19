import { useState, type FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { ApiError, apiFor } from './api/client'
import type { Session } from './session'
import { BrandMark } from './Shell'

interface Props {
  error: string | null
  onStart: (session: Session) => void
}

// Hosted demo only. The server's /config.js sets window.__VOYANCE__.demoKeys at run time (deploy/server.py);
// VITE_DEMO_KEYS='{"asha":"vy_…",…}' does the same at build time for dev and tests. These keys are public.
const DEMO_PEOPLE = [
  { name: 'asha', label: 'Asha', role: 'Buyer', does: 'Makes plans' },
  { name: 'ravi', label: 'Ravi', role: 'Approver', does: 'Approves lines' },
  { name: 'meera', label: 'Meera', role: 'Admin', does: 'Sees the audit log' },
  { name: 'zed', label: 'Zed', role: 'Admin', does: 'At another company' },
]

declare global {
  interface Window {
    __VOYANCE__?: { demoKeys?: Record<string, string> }
  }
}

function demoKeys(): Record<string, string> {
  let built: Record<string, string> = {}
  try {
    built = JSON.parse(import.meta.env.VITE_DEMO_KEYS ?? '{}')
  } catch {
    // ignore a malformed build setting
  }
  return { ...built, ...window.__VOYANCE__?.demoKeys }
}

const DEMO_KEYS = demoKeys()

export function SignIn({ error, onStart }: Props) {
  const [key, setKey] = useState('')
  const [checking, setChecking] = useState<string | null>(null)
  const [problem, setProblem] = useState(error)
  const people = DEMO_PEOPLE.filter((p) => DEMO_KEYS[p.name])

  async function signInWith(candidate: string, who: string) {
    setChecking(who)
    try {
      await apiFor(candidate).me()
      onStart({ mode: 'live', key: candidate })
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'Could not check that key.')
      setChecking(null)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = key.trim()
    if (!trimmed) return setProblem('Paste the API key you were given.')
    signInWith(trimmed, 'key')
  }

  return (
    <div className="signin">
      <main className="signin-card">
        <div className="signin-brand">
          <BrandMark size={36} />
          <div>
            <h1>Sign in to Voyance</h1>
            <p>The Buy Desk for pre-buying hotel rooms.</p>
          </div>
        </div>

        {people.length > 0 && (
          <section className="signin-section" aria-labelledby="demo-people">
            <h2 id="demo-people">Try it as</h2>
            <ul className="people">
              {people.map((p) => (
                <li key={p.name}>
                  <button
                    type="button"
                    className="person"
                    disabled={checking !== null}
                    onClick={() => signInWith(DEMO_KEYS[p.name], p.name)}
                  >
                    <span className="avatar" aria-hidden="true">
                      {p.label[0]}
                    </span>
                    <span className="person-text">
                      <strong>
                        {p.label} <span className="muted">· {p.role}</span>
                      </strong>
                      <span>{checking === p.name ? 'Signing in…' : p.does}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="fine">Shared demo people on simulated data. Anyone can use them.</p>
          </section>
        )}

        <form className="signin-section" onSubmit={submit} noValidate>
          <h2>{people.length > 0 ? 'Or use your API key' : 'Use your API key'}</h2>
          <label htmlFor="api-key" className="sr-only">
            API key
          </label>
          <input
            id="api-key"
            className="input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="vy_…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? 'signin-problem' : 'signin-hint'}
          />
          {problem ? (
            <p id="signin-problem" className="field-error" role="alert">
              {problem}
            </p>
          ) : (
            <p id="signin-hint" className="fine">
              Your admin gives you a key. It stays in this browser tab only.
            </p>
          )}
          <button className="btn btn-primary btn-block" type="submit" disabled={checking !== null}>
            {checking === 'key' ? 'Checking…' : 'Sign in'}
            {checking !== 'key' && <ArrowRight size={16} strokeWidth={2.25} aria-hidden="true" />}
          </button>
        </form>

        <button type="button" className="link-button signin-demo" onClick={() => onStart({ mode: 'demo' })}>
          Explore a saved demo plan without signing in
        </button>
      </main>
    </div>
  )
}
