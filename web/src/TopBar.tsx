import { LogOut } from 'lucide-react'
import { ROUTES, type Route } from './route'

interface Props {
  viewer: { name: string; detail: string; company: string | null }
  active: Route
  onSignOut: () => void
}

export function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="1" y="3" width="22" height="2.4" rx="0.6" fill="currentColor" opacity="0.55" />
      <rect x="1" y="10.8" width="22" height="2.4" rx="0.6" fill="currentColor" opacity="0.55" />
      <rect x="1" y="18.6" width="22" height="2.4" rx="0.6" fill="currentColor" opacity="0.55" />
      <path d="M5 1.5 12 22.5 19 1.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round" />
    </svg>
  )
}

export function TopBar({ viewer, active, onSignOut }: Props) {
  return (
    <header className="topbar">
      <a className="brand" href="#/" aria-label="Voyance home">
        <BrandMark />
        <span>Voyance</span>
      </a>
      <nav className="nav" aria-label="Main">
        {ROUTES.map((r) => (
          <a key={r.route} href={r.hash} aria-current={r.route === active ? 'page' : undefined}>
            {r.label}
          </a>
        ))}
      </nav>
      <div className="viewer">
        {viewer.company && <span className="company">{viewer.company}</span>}
        <span className="avatar" aria-hidden="true">
          {viewer.name[0]}
        </span>
        <span className="who">
          {viewer.name} <span>{viewer.detail}</span>
        </span>
        <button className="signout" type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out">
          <LogOut size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
