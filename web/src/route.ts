import { useEffect, useState } from 'react'

export type Route = 'desk' | 'plans' | 'markets' | 'audit'

export const ROUTES: { route: Route; label: string; hash: string }[] = [
  { route: 'desk', label: 'Buy Desk', hash: '#/' },
  { route: 'plans', label: 'Plans', hash: '#/plans' },
  { route: 'markets', label: 'Markets', hash: '#/markets' },
  { route: 'audit', label: 'Audit log', hash: '#/audit' },
]

// Hash routes: the server only has to serve index.html, and reloads land on the same page
function current(): Route {
  const name = window.location.hash.replace(/^#\/?/, '')
  return ROUTES.find((r) => r.route === name)?.route ?? 'desk'
}

export function useRoute(): Route {
  const [route, setRoute] = useState(current)
  useEffect(() => {
    const onChange = () => setRoute(current())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function go(route: Route) {
  window.location.hash = ROUTES.find((r) => r.route === route)?.hash ?? '#/'
}
