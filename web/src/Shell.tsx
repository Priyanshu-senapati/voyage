import { useState, type ReactNode } from 'react'
import { Building2, FileText, Gauge, History, Info, ListChecks, LogOut, Menu, ScrollText, ShieldCheck, Target, X } from 'lucide-react'
import { ROUTES, type Route } from './route'

const ICONS: Record<Route, typeof Target> = {
  desk: Target,
  plans: FileText,
  queue: ListChecks,
  position: Gauge,
  exposure: ShieldCheck,
  markets: Building2,
  replay: History,
  audit: ScrollText,
}

// Group the pages so the sidebar reads as a workflow, not a flat list
const NAV_GROUPS: { label: string; routes: Route[] }[] = [
  { label: 'Plan', routes: ['desk', 'plans'] },
  { label: 'Monitor', routes: ['queue', 'position', 'exposure'] },
  { label: 'Analyze', routes: ['replay', 'markets'] },
  { label: 'Admin', routes: ['audit'] },
]
const ROUTE_BY_KEY = Object.fromEntries(ROUTES.map((r) => [r.route, r])) as Record<Route, (typeof ROUTES)[number]>

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 28 28" width={size} height={size} aria-hidden="true" className="brand-mark">
      <rect width="28" height="28" rx="7" fill="currentColor" />
      <path d="M8.5 8.5 14 20l5.5-11.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface Props {
  active: Route
  viewer: { name: string; detail: string }
  onSignOut: () => void
  children: ReactNode
}

export function Shell({ active, viewer, onSignOut, children }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="shell">
      <header className="mobilebar">
        <span className="brand">
          <BrandMark size={24} />
          Voyance
        </span>
        <button type="button" className="icon-button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        </button>
      </header>

      <aside className={`sidebar${open ? ' sidebar-open' : ''}`} aria-label="Navigation">
        <a className="brand" href="#/" onClick={() => setOpen(false)}>
          <BrandMark />
          Voyance
        </a>
        <nav className="sidenav" aria-label="Main">
          {NAV_GROUPS.map((group) => (
            <div className="sidenav-group" key={group.label}>
              <span className="sidenav-group-label">{group.label}</span>
              {group.routes.map((route) => {
                const r = ROUTE_BY_KEY[route]
                const Icon = ICONS[route]
                return (
                  <a key={route} href={r.hash} aria-current={route === active ? 'page' : undefined} onClick={() => setOpen(false)}>
                    <Icon size={17} strokeWidth={2} aria-hidden="true" />
                    {r.label}
                  </a>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <p className="sim-note">
            <Info size={14} strokeWidth={2} aria-hidden="true" />
            Simulated data for one December. No real TBO data.
          </p>
          <div className="viewer">
            <span className="avatar" aria-hidden="true">
              {viewer.name[0]}
            </span>
            <span className="viewer-text">
              <strong>{viewer.name}</strong>
              <span>{viewer.detail}</span>
            </span>
            <button type="button" className="icon-button" onClick={onSignOut} aria-label="Sign out" title="Sign out">
              <LogOut size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  )
}
