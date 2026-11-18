import type { PlanLine } from './types'
import { SEASON_YEAR } from './cities'
import { count, inr, percent, sum, weekLabel } from './format'
import { Badge, DecisionBadge, InfoTip } from './ui'

const PAST = [3, 2, 1].map((back) => `Dec ${SEASON_YEAR - back}`)
const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })

// The planner's reasons for one line, in plain sentences built from its numbers
function reasons(line: PlanLine): string[] {
  const { why } = line
  const demand = Math.round(why.expected_demand)
  const booked = Math.round(why.booked_last_december)
  const ratio = booked > 0 ? demand / booked : 0
  const searches = sum(why.soldout_searches_past)
  const out = [
    ratio >= 1.15
      ? `Expected demand is ${demand} room-nights, about ${ratio.toFixed(1)}× the ${booked} booked last December.`
      : `Expected demand is ${demand} room-nights, close to the ${booked} booked last December.`,
  ]
  if (searches > 0) {
    out.push(`${count(searches)} searches found this hotel sold out in past Decembers: demand that booking data never shows.`)
  }
  if (why.event_week) out.push('A festival, match or concert falls in this week this season.')
  out.push(`Each room earns a ${percent(why.margin)} margin.`)
  return out
}

export function LineCase({ line, unsaved }: { line: PlanLine; unsaved: boolean }) {
  const { why } = line
  const scale = Math.max(why.expected_demand, line.rooms, why.booked_last_december) * 1.05
  const width = (v: number) => `${(v / scale) * 100}%`

  return (
    <article className="case" aria-labelledby={`case-${line.id}`}>
      <header className="case-head">
        <div>
          <h2 id={`case-${line.id}`}>
            {line.city} · {line.hotel}
          </h2>
          <p className="case-meta">
            {weekLabel(line.week)} {SEASON_YEAR} · buy by {longDate(line.buy_by)}
          </p>
        </div>
        <div className="case-badges">
          {why.event_week && <Badge tone="warn">Event week</Badge>}
          {unsaved ? <Badge>Not saved</Badge> : <DecisionBadge decision={line.decision} />}
        </div>
      </header>

      <p className="case-ask">
        Buy <strong>{line.rooms} rooms</strong> at {inr(line.unit_cost)} each and sell at {inr(line.unit_price)}.
      </p>

      <dl className="case-stats">
        <div>
          <dt>Expected profit</dt>
          <dd className="pos">{inr(line.expected_profit)}</dd>
        </div>
        <div>
          <dt>
            In a bad season
            <InfoTip label="bad-season profit">
              This line's average profit in the worst 5% of 200 simulated seasons. A loss here is normal for a
              single line; the plan as a whole is what the risk setting protects.
            </InfoTip>
          </dt>
          <dd className={line.worst_case_profit < 0 ? 'neg' : undefined}>{inr(line.worst_case_profit)}</dd>
        </div>
        <div>
          <dt>Likely to sell</dt>
          <dd>
            {Math.round(line.expected_sold)} of {line.rooms}{' '}
            <span className="muted">({percent(line.sell_through)})</span>
          </dd>
        </div>
      </dl>

      <section className="case-section">
        <h3>Why the planner picked it</h3>
        <ul className="reasons">
          {reasons(line).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>

      <section className="case-section" aria-label="Demand in room-nights">
        <h3>Room-nights</h3>
        <div className="bars">
          <div className="bar-row">
            <span className="bar-label">Booked last December</span>
            <span className="bar-track">
              <span className="bar bar-booked" style={{ width: width(why.booked_last_december) }} />
            </span>
            <span className="bar-value">{Math.round(why.booked_last_december)}</span>
          </div>
          <div className="bar-row">
            <span className="bar-label">Expected this December</span>
            <span className="bar-track">
              <span className="bar bar-demand" style={{ width: width(why.expected_demand) }} />
            </span>
            <span className="bar-value">{Math.round(why.expected_demand)}</span>
          </div>
          <div className="bar-row">
            <span className="bar-label">Rooms to buy</span>
            <span className="bar-track">
              <span className="bar bar-buy" style={{ width: width(line.rooms) }} />
            </span>
            <span className="bar-value">{line.rooms}</span>
          </div>
        </div>
        <p className="fine">Expected demand counts back in the searches that found the hotel sold out.</p>
      </section>

      <details className="case-more">
        <summary>Past Decembers</summary>
        <table className="mini-table">
          <thead>
            <tr>
              <th scope="col" />
              {PAST.map((p) => (
                <th key={p} scope="col">
                  {p}
                </th>
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
                <td key={i}>{count(v)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </details>
    </article>
  )
}
