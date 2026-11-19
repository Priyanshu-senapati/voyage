import { useEffect, useState } from 'react'

export type Load<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; message: string }

// Fetch once per `key`; `load` returns null when there is nothing to fetch (e.g. no permission)
export function useLoad<T>(key: string, load: () => Promise<T> | null): Load<T> {
  const [state, setState] = useState<Load<T>>({ status: 'loading' })

  useEffect(() => {
    let current = true
    const pending = load()
    if (!pending) return
    pending.then(
      (data) => current && setState({ status: 'ready', data }),
      (error) => current && setState({ status: 'error', message: error instanceof Error ? error.message : 'Could not load' }),
    )
    return () => {
      current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` names what `load` fetches
  }, [key])

  return state
}
