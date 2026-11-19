import { useCallback, useState } from 'react'
import { loadSession, saveSession, type Session } from './session'
import { Landing } from './Landing'
import { Desk } from './Desk'

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession)
  const [signInError, setSignInError] = useState<string | null>(null)

  const start = useCallback((next: Session) => {
    saveSession(next)
    setSignInError(null)
    setSession(next)
  }, [])

  const signOut = useCallback((reason?: string) => {
    saveSession(null)
    setSignInError(reason ?? null)
    setSession(null)
  }, [])

  if (!session) return <Landing error={signInError} onStart={start} />
  return <Desk key={session.mode === 'live' ? session.key : 'demo'} session={session} onSignOut={signOut} />
}
