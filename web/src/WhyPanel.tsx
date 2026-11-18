import { Check, X } from 'lucide-react'
import type { Decision, PlanLine } from './types'
import { CITY_INK } from './cities'
import { count, inr, percent, weekLabel } from './format'
import { StatusChip } from './StatusChip'

interface Props {
  line: PlanLine
  creator: string
  busy: boolean
  onDecide: (id: number, decision: Exclude<Decision, 'pending'>) => void
}

const PAST = ["Dec '23", "Dec '24", "Dec '25"]
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function WhyPanel({ line, creator, busy, onDecide }: Props) {
  const { why } = line
  const ink = CITY_INK[line.city]
  const scale = Math.ceil((Math.max(why.expected_demand, line.rooms, why.booked_last_december) * 1.08) / 20) * 20
  const at = (v: number) => `${(v / scale) * 100}%`
  const reasons = line.reason.split('; ').map(capital)
  const decidedAt = line.decided_at
    ? new Date(line.decided_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
    : null

  return (
    <aside className="why" id="why" aria-label={`Why line ${line.rank}`}>
      <header className="why-head">
        <span className="why-rank">{line.rank}</span>
        <div>
          <h2>
            {line.city} · {line.hotel}
          </h2>
          <p>
            {weekLabel(line.week)}
            {why.event_week && (
              <span className="why-event">
                <sup className="footnote">E</sup> Event week this season
              </span>
            )}
          </p>
        </div>
        <StatusChip decision={line.decision} />
      </header>

      <dl className="buy-terms">
        <div>
          <dt>Buy</dt>
          <dd>{line.rooms} rooms</dd>
        </div>
        <div>
          <dt>Cost / room</dt>
          <dd>{inr(line.unit_cost)}</dd>
        </div>
        <div>
          <dt>Sell at</dt>
          <dd>{inr(line.unit_price)}</dd>
        </div>
        <div>
          <dt>Expected profit</dt>
          <dd className="terms-profit">{inr(line.expected_profit)}</dd>
        </div>
      </dl>

      <p className="reason">
        <strong>Why:</strong> {reasons.join('. ')}.
      </p>

      <section className="demand" aria-label="Demand in room-nights">
        <h3>Demand, room-nights</h3>
        <div className="bars">
          <div className="bar-row">
            <span className="bar-label">Booked last December</span>
            <span className="bar-track">
              <span className="bar bar-booked" style={{ width: at(why.booked_last_december) }} />
            </span>
            <span className="bar-value">{why.booked_last_december}</span>
          </div>
          <div className="bar-row">
            <span className="bar-label">
              Expected this December
              <small>sold-out searches counted back in</small>
            </span>
            <span className="bar-track">
              <span className="bar bar-demand" style={{ width: at(why.expected_demand) }} />
            </span>
            <span className="bar-value bar-value-strong">{Math.round(why.expected_demand)}</span>
          </div>
          <div className="bar-row">
            <span className="bar-label">
              Buying
              <small>
                expect to sell {Math.round(line.expected_sold)} ({percent(line.sell_through)})
              </small>
            </span>
            <span className="bar-track">
              <span className="bar bar-buy" style={{ width: at(line.rooms), borderColor: ink }}>
                <span style={{ width: `${line.sell_through * 100}%`, background: ink }} />
              </span>
            </span>
            <span className="bar-value">{line.rooms}</span>
          </div>
        </div>
      </section>

      {why.bookings_past_decembers && why.soldout_searches_past ? (
      <section className="past" aria-label="Past Decembers">
        <table>
          <thead>
            <tr>
              <th scope="col">Past Decembers</th>
              {PAST.map((p) => (
                <th key={p} scope="col">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Bookings</th>
              {why.bookings_past_decembers.map((v, i) => (
                <td key={i}>{count(v)}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Sold-out searches</th>
              {why.soldout_searches_past.map((v, i) => (
                <td key={i} className="past-soldout">{count(v)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </section>
      ) : (
        <p className="past-summary">
          <strong>Past Decembers:</strong>{' '}
          {why.booked_avg !== undefined && <>{count(why.booked_avg)} booked on average · </>}
          <span className="past-soldout">{count(why.soldout_searches_total)}</span> sold-out searches in all
        </p>
      )}

      <footer className="decide">
        {line.decision === 'pending' ? (
          <>
            <p>
              Made by {capital(creator)}. Only another approver can decide; final and logged.
            </p>
            <div className="decide-actions">
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => onDecide(line.id, 'approved')}>
                <Check size={16} strokeWidth={2.5} aria-hidden="true" />
                Approve line
              </button>
              <button className="btn btn-reject" type="button" disabled={busy} onClick={() => onDecide(line.id, 'rejected')}>
                <X size={16} strokeWidth={2.5} aria-hidden="true" />
                Reject
              </button>
            </div>
          </>
        ) : (
          <p className="decided">
            {line.decision === 'approved' ? 'Approved' : 'Rejected'} by {capital(line.decided_by ?? '')}
            {decidedAt && ` at ${decidedAt}`}. Decisions are final.
          </p>
        )}
      </footer>
    </aside>
  )
}
