import { LogOut } from 'lucide-react'

const NAV = ['Buy Desk', 'Plans', 'Markets', 'Audit log']

interface Props {
  viewer: { name: string; detail: string; company: string | null }
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

export function TopBar({ viewer, onSignOut }: Props) {
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="Voyance home">
        <BrandMark />
        <span>Voyance</span>
      </a>
      <nav className="nav" aria-label="Main">
        {NAV.map((item, i) => (
          <a key={item} href="#" aria-current={i === 0 ? 'page' : undefined}>
            {item}
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
