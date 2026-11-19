import { Fragment, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, Search } from 'lucide-react'
import type { PlanOut, Position, PositionLine } from './types'
import { CITIES, SEASON_YEAR } from './cities'
import { capital, count, dayMonth, inr, percent, plural, sum, weekLabel } from './format'
import { DEMO_PLAN, type PlanScope } from './planScope'
import { NoPlans, PlanPicker } from './PlanPicker'
import { useLoad } from './useLoad'
import { Badge, DecisionBadge, InfoTip, Segmented } from './ui'

type Status = PositionLine['status']
type Line = PositionLine & { note?: string; unit_cost: number; unit_price: number; spend: number; plan?: PlanOut['lines'][number] }
type SortKey = 'status' | 'rooms' | 'gap' | 'pace' | 'filled' | 'spend'

// The season is simulated and still a year away, so the buyer picks the day to read it on
const CHECKS = ['09-01', '10-01', '11-01', '11-15', '12-01'].map((day) => `${SEASON_YEAR}-${day}`)
const FIRST_WEEK = `${SEASON_YEAR}-12-01`
const DAY_MS = 86_400_000

// The API's own states (voyance/api/position.py: pace against the forecast, 15% either side is on pace)
const STATUS: Record<Status, { label: string; tone: 'warn' | 'success' | 'danger' | 'neutral'; hint: string }> = {
  short: { label: 'Short', tone: 'warn', hint: 'booking 15%+ ahead of the forecast: the rooms bought may run out' },
  on_pace: { label: 'On pace', tone: 'success', hint: 'booking within 15% of the forecast' },
  over: { label: 'Over', tone: 'danger', hint: 'booking 15%+ behind the forecast: rooms may go unsold' },
  started: { label: 'Week started', tone: 'neutral', hint: 'the week has begun: these are final bookings' },
}
const ORDER: Status[] = ['short', 'on_pace', 'over', 'started']
const ATTENTION: Status[] = ['short', 'over', 'on_pace', 'started']

const LIMITED: Record<string, string> = {
  hotel: "the hotel's allotment (it offers no more rooms)",
  cap: 'a city or hotel exposure cap',
  budget: "the budget (the next room didn't earn its keep)",
  demand: 'demand (more rooms would likely go unsold)',
}

function loadDemo(asOf: string): Promise<Position> {
  return import('./demo/position-2cr.json').then((m) => (m.default as unknown as Record<string, Position>)[asOf])
}

export function PositionPage({ api, plans, planId, onPlan }: PlanScope) {
  const [asOf, setAsOf] = useState(CHECKS[2])
  // fetched every time the page opens or the plan or date changes, so a decision or a new plan shows at once
  const reading = useLoad<{ position: Position; plan: PlanOut }>(`${api ? 'live' : 'demo'}|${planId}|${asOf}`, () => {
    if (planId === null) return null
    if (!api) return loadDemo(asOf).then((position) => ({ position, plan: DEMO_PLAN }))
    return Promise.all([api.position(planId, asOf), api.plan(planId)]).then(([position, plan]) => ({ position, plan }))
  })

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1>Position monitor</h1>
          <p>
            Whether each bought line is short, on pace or over, from this season's bookings against the forecast.
            Voyance flags; the buyer decides whether to ask for more rooms or release some.
          </p>
        </div>
        <PlanPicker plans={plans} planId={planId} onPlan={onPlan} />
      </header>

      {planId === null ? (
        <NoPlans what="how its lines are booking up" />
      ) : (
        <>
          <div className="toolbar">
            <span className="toolbar-label">Bookings as of</span>
            <Segmented
              label="Bookings as of"
              value={asOf}
              onChange={setAsOf}
              options={CHECKS.map((day) => ({ value: day, label: dayMonth(day) }))}
            />
            <span className="fine">{leadText(asOf)}</span>
          </div>
          {reading.status === 'loading' && <div className="panel loading">Reading this season's bookings…</div>}
          {reading.status === 'error' && <div className="panel empty-state">{reading.message}</div>}
          {reading.status === 'ready' && <Monitor key={asOf} position={reading.data.position} plan={reading.data.plan} />}
        </>
      )}
    </div>
  )
}

function leadText(asOf: string): string {
  const days = Math.round((Date.parse(FIRST_WEEK) - Date.parse(asOf)) / DAY_MS)
  if (days <= 0) return `The first December week starts today. Simulated season, ${SEASON_YEAR}.`
  return `${plural(days, 'day')} before the first December week. Simulated season, ${SEASON_YEAR}.`
}

function Monitor({ position, plan }: { position: Position; plan: PlanOut }) {
  const [filter, setFilter] = useState<Status | null>(null)
  const [city, setCity] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'status', desc: false })
  const [open, setOpen] = useState<string | null>(null)

  const byId = new Map(plan.lines.map((l) => [l.id, l]))
  const lines: Line[] = position.lines.map((l) => {
    const p = l.line_id != null ? byId.get(l.line_id) : undefined
    const unit_cost = p?.unit_cost ?? 0
    return { ...l, unit_cost, unit_price: p?.unit_price ?? 0, spend: l.rooms * unit_cost, plan: p }
  })
  const words = query.trim().toLowerCase()
  const shown = lines
    .filter((l) => filter === null || l.status === filter)
    .filter((l) => !city || l.city === city)
    .filter((l) => !words || `${l.city} ${l.hotel} ${l.week} ${weekLabel(l.week)}`.toLowerCase().includes(words))
    .sort((a, b) => compare(a, b, sort.key) * (sort.desc ? -1 : 1))
  const scale = Math.max(...lines.map((l) => Math.max(l.on_books, l.expected_by_now)), 1) * 1.05

  function sortBy(key: SortKey) {
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'status' }))
  }
  const head = (key: SortKey, label: string, className = '', info?: ReactNode) => (
    <th scope="col" className={className} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : undefined}>
      <button type="button" className="sort-button" onClick={() => sortBy(key)}>
        {label}
        {sort.key === key && (sort.desc ? <ArrowDown size={12} aria-hidden="true" /> : <ArrowUp size={12} aria-hidden="true" />)}
      </button>
      {info}
    </th>
  )

  return (
    <>
      <div className="panel status-strip" role="group" aria-label="Show lines by position">
        {ORDER.map((status) => {
          const group = lines.filter((l) => l.status === status)
          return (
            <button
              key={status}
              type="button"
              className="status-filter"
              aria-pressed={filter === status}
              disabled={group.length === 0}
              onClick={() => setFilter(filter === status ? null : status)}
            >
              <span className="status-filter-label">
                <i className={`dot-${STATUS[status].tone}`} aria-hidden="true" />
                {STATUS[status].label}
              </span>
              <span className="status-filter-value">{group.length}</span>
              <span className="status-filter-hint">
                {group.length === 0 ? 'none' : `${inr(sum(group.map((l) => l.spend)))} bought`}
              </span>
            </button>
          )
        })}
      </div>

      <p className="takeaway">{takeaway(lines)}</p>

      <div className="panel table-panel">
        <div className="panel-bar">
          <h2 className="panel-title">
            {filter === null ? 'All lines' : STATUS[filter].label}: {shown.length} of {lines.length}
          </h2>
          <div className="panel-bar-tools">
            <label className="search">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">Search lines</span>
              <input type="search" placeholder="City, hotel or week" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label className="inline-field">
              <span className="sr-only">Destination</span>
              <select className="select" value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="">All destinations</option>
                {CITIES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {(filter !== null || city || words) && (
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setFilter(null)
                  setCity('')
                  setQuery('')
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
        <div className="list-scroll">
          <table className="table" aria-label="Position by line">
            <thead>
              <tr>
                <th scope="col">Line</th>
                {head('status', 'Position')}
                {head('rooms', 'Bought', 'num hide-sm')}
                <th scope="col" className="num hide-md">
                  Forecast
                </th>
                <th scope="col" className="num hide-sm">
                  Projected
                  <InfoTip label="projected demand">
                    Bookings so far plus the forecast's share still to come, from the typical December booking curve.
                  </InfoTip>
                </th>
                {head(
                  'gap',
                  'Gap',
                  'num hide-sm',
                  <InfoTip label="gap">
                    Projected demand minus rooms bought. Plans often buy fewer rooms than expected demand on purpose, to
                    limit risk; the gap planned is under it.
                  </InfoTip>,
                )}
                {head('pace', 'Booked so far', 'bar-col pace-booked hide-sm')}
                {head(
                  'filled',
                  'Filled',
                  'num hide-md',
                  <InfoTip label="filled">
                    Room-nights booked so far as a share of the rooms bought. Over 100% means bookings already exceed them.
                  </InfoTip>,
                )}
                {head('spend', 'Spend', 'num hide-sm')}
                <th scope="col" className="chevron-col hide-sm">
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => {
                const key = `${l.city}|${l.week}|${l.hotel}`
                const expanded = open === key
                const id = `position-${key.replace(/[^a-z0-9]/gi, '-')}`
                return (
                  <Fragment key={key}>
                    <tr className="row-link" aria-current={expanded ? 'true' : undefined} onClick={() => setOpen(expanded ? null : key)}>
                      <td>
                        <button
                          type="button"
                          className="row-button"
                          aria-expanded={expanded}
                          aria-controls={id}
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpen(expanded ? null : key)
                          }}
                        >
                          <strong>{l.city}</strong> · {l.hotel}
                        </button>
                        <span className="cell-sub">{weekLabel(l.week)}</span>
                      </td>
                      <td>
                        <Badge tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Badge>
                        {l.status !== 'started' && <span className="cell-sub">{paceWord(l.pace)}</span>}
                        <span className="cell-sub show-sm">gap: {gapWord(l.gap)}</span>
                      </td>
                      <td className="num hide-sm">{count(l.rooms)}</td>
                      <td className="num hide-md">{count(l.forecast)}</td>
                      <td className="num hide-sm">{count(l.projected_demand)}</td>
                      <td className="num hide-sm">
                        {gapWord(l.gap)}
                        {l.status !== 'started' && <span className="cell-sub">planned {gapWord(l.forecast - l.rooms)}</span>}
                      </td>
                      <td className="bar-col pace-booked hide-sm">
                        <span className="bullet" aria-hidden="true">
                          <span className="bullet-fill" style={{ width: `${(l.on_books / scale) * 100}%` }} />
                          <span className="bullet-mark" style={{ left: `${(l.expected_by_now / scale) * 100}%` }} />
                        </span>
                        <span className="num-inline">{count(l.on_books)}</span>
                        <span className="muted"> · {count(l.expected_by_now)} expected</span>
                      </td>
                      <td className="num hide-md">{l.rooms ? percent(l.on_books / l.rooms) : '—'}</td>
                      <td className="num hide-sm">{inr(l.spend)}</td>
                      <td className="chevron-col hide-sm">
                        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" className={expanded ? 'chevron-open' : undefined} />
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="detail-row" id={id}>
                        <td colSpan={10}>
                          <LineDetail line={l} hurdle={plan.hurdle_rate} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={10} className="empty">
                    No lines match. Clear the filters to see all {lines.length}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="fine">
        Rejected lines are left out. Voyance only flags: on real 2017 bookings, buying more or releasing rooms automatically
        on early pace lost about 4–8% of profit, so the buyer makes the call.
      </p>
    </>
  )
}

function compare(a: Line, b: Line, key: SortKey): number {
  switch (key) {
    case 'rooms':
      return a.rooms - b.rooms
    case 'gap':
      return a.gap - b.gap
    case 'pace':
      return a.pace - b.pace
    case 'filled':
      return a.on_books / (a.rooms || 1) - b.on_books / (b.rooms || 1)
    case 'spend':
      return a.spend - b.spend
    default:
      return ATTENTION.indexOf(a.status) - ATTENTION.indexOf(b.status) || Math.abs(b.pace - 1) - Math.abs(a.pace - 1)
  }
}

function paceWord(pace: number): string {
  const off = Math.round(Math.abs(pace - 1) * 100)
  if (off === 0) return 'exactly on forecast'
  return `${off}% ${pace > 1 ? 'ahead of' : 'behind'} forecast`
}

// Projected demand minus rooms: above zero the line is short of rooms, below it has rooms to spare
function gapWord(gap: number): string {
  const n = Math.round(Math.abs(gap))
  if (n === 0) return 'matches'
  return gap > 0 ? `${count(n)} short` : `${count(n)} spare`
}

function LineDetail({ line, hurdle }: { line: Line; hurdle: number }) {
  const p = line.plan
  const margin = line.unit_price - line.unit_cost
  return (
    <div className="line-detail">
      {line.note && <p className="line-note">{capital(line.note)}.</p>}
      <dl className="detail-grid">
        <div>
          <dt>Rooms bought</dt>
          <dd>
            {count(line.rooms)} at {inr(line.unit_cost)}, selling at {inr(line.unit_price)}
          </dd>
        </div>
        <div>
          <dt>Spend at stake</dt>
          <dd>{inr(line.spend)}</dd>
        </div>
        {line.gap < -0.5 && (
          <div>
            <dt>If the projection holds</dt>
            <dd>
              about {count(-line.gap)} rooms unsold: {inr(-line.gap * line.unit_cost)} of spend
            </dd>
          </div>
        )}
        {line.gap > 0.5 && (
          <div>
            <dt>If the projection holds</dt>
            <dd>
              {count(line.gap)} room-nights beyond the rooms bought: about {inr(line.gap * margin)} of margin missed
            </dd>
          </div>
        )}
        {p && (
          <>
            <div>
              <dt>Expected profit (at planning)</dt>
              <dd>{inr(p.expected_profit)}</dd>
            </div>
            <div>
              <dt>Bad-season profit</dt>
              <dd>{inr(p.worst_case_profit)}</dd>
            </div>
            <div>
              <dt>Buy by</dt>
              <dd>{dayMonth(p.buy_by, true)}</dd>
            </div>
            <div>
              <dt>Approval</dt>
              <dd>
                <DecisionBadge decision={p.decision} />
              </dd>
            </div>
            <div>
              <dt>What capped the buy</dt>
              <dd>
                {LIMITED[p.limited_by]}
                {p.limited_by === 'budget' && hurdle > 0 && ` · hurdle ${percent(hurdle)} on cost`}
              </dd>
            </div>
          </>
        )}
      </dl>
    </div>
  )
}

function takeaway(lines: Line[]): ReactNode {
  const short = lines.filter((l) => l.status === 'short')
  const over = lines.filter((l) => l.status === 'over')
  const spare = lines.filter((l) => l.status !== 'started' && l.gap < -0.5)
  const started = lines.filter((l) => l.status === 'started').length
  const parts: ReactNode[] = []
  if (short.length > 0) {
    parts.push(
      <>
        <strong>{plural(short.length, 'line')} short:</strong> booking faster than forecast, together{' '}
        {count(sum(short.map((l) => l.projected_demand - l.forecast)))} room-nights more demand than the plan assumed.
        Worth asking those hotels for more rooms.{' '}
      </>,
    )
  }
  if (over.length > 0) {
    parts.push(
      <>
        <strong>{plural(over.length, 'line')} over:</strong> booking slower than forecast
        {spare.length > 0 ? (
          <>
            ; {plural(spare.length, 'line')} now project fewer room-nights than rooms bought, about{' '}
            {inr(sum(spare.map((l) => -l.gap * l.unit_cost)))} of spend at risk of going unsold.{' '}
          </>
        ) : (
          <>, though each still projects at least the rooms bought. </>
        )}
      </>,
    )
  }
  if (parts.length === 0) parts.push(<>Every line is booking close to the forecast. </>)
  if (started > 0) parts.push(<>{plural(started, 'line')} {started === 1 ? 'is' : 'are'} in a week that has begun.</>)
  return parts.map((part, i) => <span key={i}>{part}</span>)
}
