import { useEffect, useState } from 'react'

export type Load<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; message: string }

const LOADING = { status: 'loading' } as const

// Fetch once per `key`; `load` returns null when there is nothing to fetch (e.g. no permission).
// A new key shows loading until its own answer arrives, never the previous key's data.
export function useLoad<T>(key: string, load: () => Promise<T> | null): Load<T> {
  const [state, setState] = useState<{ key: string; load: Load<T> }>({ key, load: LOADING })

  useEffect(() => {
    let current = true
    const pending = load()
    if (!pending) return
    pending.then(
      (data) => current && setState({ key, load: { status: 'ready', data } }),
      (error) =>
        current && setState({ key, load: { status: 'error', message: error instanceof Error ? error.message : 'Could not load' } }),
    )
    return () => {
      current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` names what `load` fetches
  }, [key])

  return state.key === key ? state.load : LOADING
}
