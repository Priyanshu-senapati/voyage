export type Session = { mode: 'demo' } | { mode: 'live'; key: string }

const STORE = 'voyance.session'

// sessionStorage: the key lives only as long as the tab, and never in the URL
export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORE)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function saveSession(session: Session | null) {
  try {
    if (session) sessionStorage.setItem(STORE, JSON.stringify(session))
    else sessionStorage.removeItem(STORE)
  } catch {
    // storage blocked: the session just won't survive a reload
  }
}

export const keyHint = (key: string) => `${key.slice(0, 6)}…`
