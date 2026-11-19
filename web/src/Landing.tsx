import { ArrowRight, ArrowUpRight, Gauge, History, ShieldCheck, Target } from 'lucide-react'
import type { Session } from './session'
import { SignIn } from './SignIn'
import { BrandMark } from './Shell'

interface Props {
  error: string | null
  onStart: (session: Session) => void
}

// Measured by replaying real 2017 hotel bookings against re-buying last year (see the Replay race in-app)
const PROOF = [
  { value: '+9.6%', label: 'more profit', note: 'than re-buying last year' },
  { value: '46%', label: 'fewer guests turned away', note: 'demand captured, not lost' },
  { value: '7–13%', label: 'profit lift on real bookings', note: 'every interval above zero' },
]

const FEATURES = [
  { icon: Target, title: 'Buy Desk', text: 'Plan room buys against a budget and a risk dial. Every headline number answers a what-if.' },
  { icon: History, title: 'Replay race', text: 'Watch the forecast beat re-buying last year on real 2017 bookings, week by week.' },
  { icon: Gauge, title: 'Position monitor', text: 'After the buy, see which lines are short, on pace or over — and act while there is time.' },
  { icon: ShieldCheck, title: 'Exposure caps', text: 'Hold any one city or hotel within its share of the budget, enforced by the optimizer.' },
]

const STEPS = [
  { n: '01', title: 'Forecast hidden demand', text: 'Sold-out searches and past Decembers reveal demand that booking data never records.' },
  { n: '02', title: 'Plan risk-aware', text: 'An optimizer buys for the budget and the risk you choose — not a copy of last year.' },
  { n: '03', title: 'Approve and track', text: 'Approvers sign off line by line; the monitor watches every room book up against forecast.' },
]

export function Landing({ error, onStart }: Props) {
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <a href="#top" className="brand lp-brand">
            <BrandMark size={26} />
            Voyance
          </a>
          <nav className="lp-nav-links" aria-label="Page sections">
            <a href="#proof">The evidence</a>
            <a href="#how">How it works</a>
            <a href="#sign-in" className="lp-nav-signin">
              Sign in
            </a>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="lp-hero">
          <div className="lp-hero-bg" aria-hidden="true" />
          <div className="lp-hero-inner">
            <span className="lp-eyebrow reveal">Pre-season hotel inventory, for TBO distributors</span>
            <h1 className="lp-h1 reveal" style={{ animationDelay: '60ms' }}>
              Buy December's rooms
              <br />
              <span className="grad-text">before the season shows.</span>
            </h1>
            <p className="lp-sub reveal" style={{ animationDelay: '120ms' }}>
              Voyance forecasts hidden demand and plans risk-aware room buys for peak season — so you capture more profit
              and turn away fewer guests than re-buying last year.
            </p>
            <div className="lp-cta reveal" style={{ animationDelay: '180ms' }}>
              <button type="button" className="btn btn-primary btn-lg" onClick={() => onStart({ mode: 'demo' })}>
                Explore the live demo
                <ArrowRight size={17} strokeWidth={2.25} aria-hidden="true" />
              </button>
              <a href="#sign-in" className="btn btn-secondary btn-lg">
                Sign in
              </a>
            </div>
            <p className="lp-hero-fine reveal" style={{ animationDelay: '240ms' }}>
              No account needed for the demo. Simulated data for one December — no real TBO data.
            </p>
          </div>
        </section>

        <section className="lp-showcase">
          <figure className="lp-shot reveal" style={{ animationDelay: '300ms' }}>
            <img
              src="/product-shot.png"
              alt="The Voyance Buy Desk: a plan's spend, expected and bad-season profit, and every hotel-week to buy with its recommended selling price."
              loading="lazy"
            />
          </figure>
        </section>

        <section className="lp-proof" id="proof" aria-labelledby="proof-title">
          <div className="lp-proof-head">
            <h2 id="proof-title">Measured, not claimed</h2>
            <p>Replaying real 2017 hotel bookings week by week, buying the forecast against re-buying last year.</p>
          </div>
          <dl className="lp-proof-grid">
            {PROOF.map((stat) => (
              <div key={stat.label} className="lp-stat">
                <dt className="lp-stat-num grad-text">{stat.value}</dt>
                <dd>
                  <strong>{stat.label}</strong>
                  <span>{stat.note}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="lp-features" aria-labelledby="features-title">
          <div className="lp-section-head">
            <h2 id="features-title">One desk, from forecast to follow-through</h2>
            <p>Every screen runs on the same engine — the optimizer's own numbers, never a mock-up.</p>
          </div>
          <div className="lp-feature-grid">
            {FEATURES.map((f) => {
              const Icon = f.icon
              return (
                <a key={f.title} href="#sign-in" className="lp-feature">
                  <span className="lp-feature-icon" aria-hidden="true">
                    <Icon size={20} strokeWidth={2} />
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                  <span className="lp-feature-go" aria-hidden="true">
                    <ArrowUpRight size={16} strokeWidth={2.25} />
                  </span>
                </a>
              )
            })}
          </div>
        </section>

        <section className="lp-how" id="how" aria-labelledby="how-title">
          <div className="lp-section-head">
            <h2 id="how-title">How a buy gets made</h2>
            <p>Three steps from a hunch about a festival week to an approved, tracked purchase.</p>
          </div>
          <ol className="lp-steps">
            {STEPS.map((s) => (
              <li key={s.n} className="lp-step">
                <span className="lp-step-n" aria-hidden="true">
                  {s.n}
                </span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-signin" id="sign-in" aria-label="Sign in">
          <div className="lp-signin-intro">
            <h2>Step into the Buy Desk</h2>
            <p>Try it as one of the demo people, or use the API key your admin gave you.</p>
          </div>
          <SignIn error={error} onStart={onStart} />
        </section>
      </main>

      <footer className="lp-footer">
        <span className="brand lp-brand">
          <BrandMark size={22} />
          Voyance
        </span>
        <p>Simulated data for one December · no real TBO data · built for TBO VoyageHack 4.0.</p>
      </footer>
    </div>
  )
}
