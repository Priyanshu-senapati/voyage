import { useState, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { Api } from './api/client'
import type { PlanSummary, Position, PositionLine } from './types'
import { SEASON_YEAR } from './cities'
import { capital, count, dayMonth, inr, plural, sum, weekLabel } from './format'
import { go } from './route'
import { useLoad } from './useLoad'
import { InfoTip, Segmented } from './ui'

interface Props {
  api: Api | null
  plans: PlanSummary[]
  openId: number | null
}

type Status = PositionLine['status']

// The season is simulated and still a year away, so the buyer picks the day to read it on
const CHECKS = ['09-01', '10-01', '11-01', '11-15', '12-01'].map((day) => `${SEASON_YEAR}-${day}`)
const FIRST_WEEK = `${SEASON_YEAR}-12-01`
const DAY_MS = 86_400_000

const STATUS: Record<Status, { label: string; hint: string }> = {
  short: { label: 'Ahead of forecast', hint: 'booking 15%+ faster' },
  over: { label: 'Behind forecast', hint: 'booking 15%+ slower' },
  on_pace: { label: 'On pace', hint: 'within 15% of the forecast' },
  started: { label: 'Week started', hint: 'final bookings' },
}
const ORDER: Status[] = ['short', 'over', 'on_pace', 'started']


function loadDemo(asOf: string): Promise<Position> {
  return import('./demo/position-2cr.json').then((m) => (m.default as unknown as Record<string, Position>)[asOf])
}

export function PacePage({ api, plans, openId }: Props) {
  const [chosen, setChosen] = useState<number | null>(null)
  const planId = chosen ?? openId ?? plans[0]?.id ?? null
  const [asOf, setAsOf] = useState(CHECKS[2])
  const reading = useLoad<Position>(`${api ? 'live' : 'demo'}|${planId}|${asOf}`, () =>
    planId === null ? null : api ? api.position(planId, asOf) : loadDemo(asOf),
  )

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1>Booking pace</h1>
          <p>How each line of a saved plan is booking up against the forecast. Voyance flags the lines running ahead or behind; the buyer decides what to do.</p>
        </div>
        {plans.length > 0 && planId !== null && (
          <label className="inline-field">
            <span>Plan</span>
            <select className="select" value={planId} onChange={(e) => setChosen(Number(e.target.value))}>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.id} · {inr(p.budget_inr)} · {capital(p.created_by)}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {planId === null ? (
        <div className="panel empty-state">
          <h2>No saved plans yet</h2>
          <p>Save a plan on the Buy Desk, then come back to see how its lines are booking up.</p>
          <button type="button" className="btn btn-secondary" onClick={() => go('desk')}>
            Go to the Buy Desk
          </button>
        </div>
      ) : (
        <>
          <div className="pace-when">
            <span className="pace-when-label" id="pace-when">
              Bookings as of
            </span>
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
          {reading.status === 'ready' && <Reading position={reading.data} />}
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

function Reading({ position }: { position: Position }) {
  const [filter, setFilter] = useState<Status | null>(null)
  const { lines } = position
  const shown = lines
    .filter((l) => filter === null || l.status === filter)
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || Math.abs(b.pace - 1) - Math.abs(a.pace - 1))
  const scale = Math.max(...lines.map((l) => Math.max(l.on_books, l.expected_by_now)), 1) * 1.05

  return (
    <>
      <div className="panel pace-summary" role="group" aria-label="Show lines by pace">
        {ORDER.map((status) => {
          const n = lines.filter((l) => l.status === status).length
          return (
            <button
              key={status}
              type="button"
              className="pace-filter"
              aria-pressed={filter === status}
              disabled={n === 0}
              onClick={() => setFilter(filter === status ? null : status)}
            >
              <span className="pace-filter-label">{STATUS[status].label}</span>
              <span className="pace-filter-value">{n}</span>
              <span className="pace-filter-hint">{n === 1 ? 'line' : 'lines'}, {STATUS[status].hint}</span>
            </button>
          )
        })}
      </div>

      <p className="pace-takeaway">{takeaway(lines)}</p>

      <div className="panel table-panel">
        <div className="pace-table-head">
          <h2 className="panel-title">
            {filter === null ? `All ${plural(lines.length, 'line')}` : `${STATUS[filter].label}: ${plural(shown.length, 'line')}`}
          </h2>
          {filter !== null && (
            <button type="button" className="link-button" onClick={() => setFilter(null)}>
              Show all lines
            </button>
          )}
        </div>
        <div className="list-scroll">
        <table className="table" aria-label="Booking pace by line">
          <thead>
            <tr>
              <th scope="col">Hotel-week</th>
              <th scope="col" className="num hide-sm">
                Rooms bought
              </th>
              <th scope="col" className="bar-col pace-booked">
                Booked so far
                <InfoTip label="booked so far">
                  Room-nights booked for this hotel-week by {dayMonth(position.as_of)}. The tick marks what the forecast
                  expected by then, from the typical December booking curve.
                </InfoTip>
              </th>
              <th scope="col">Pace</th>
              <th scope="col" className="num hide-md">
                Projected demand
                <InfoTip label="projected demand">
                  Bookings so far plus the forecast's share still to come. Under it, the forecast when the plan was made.
                </InfoTip>
              </th>
              <th scope="col" className="num hide-sm">
                Room gap
                <InfoTip label="room gap">
                  Projected demand against the rooms bought. Plans often buy fewer rooms than expected demand on purpose,
                  to limit risk, so compare it with the gap planned (under it).
                </InfoTip>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr key={`${l.city}|${l.week}|${l.hotel}`}>
                <td>
                  <strong>{l.city}</strong> · {l.hotel}
                  <span className="cell-sub">{weekLabel(l.week)}</span>
                  <span className="cell-sub show-sm">{count(l.rooms)} rooms bought</span>
                </td>
                <td className="num hide-sm">{count(l.rooms)}</td>
                <td className="bar-col pace-booked">
                  <span className="bullet hide-sm" aria-hidden="true">
                    <span className="bullet-fill" style={{ width: `${(l.on_books / scale) * 100}%` }} />
                    <span className="bullet-mark" style={{ left: `${(l.expected_by_now / scale) * 100}%` }} />
                  </span>
                  <span className="num-inline">{count(l.on_books)}</span>
                  <span className="muted hide-sm"> · {count(l.expected_by_now)} expected</span>
                  <span className="cell-sub show-sm">{count(l.expected_by_now)} expected</span>
                </td>
                <td>
                  <Pace line={l} />
                </td>
                <td className="num hide-md">
                  {count(l.projected_demand)}
                  <span className="cell-sub">forecast {count(l.forecast)}</span>
                </td>
                <td className="num hide-sm">
                  {gapWord(l.gap)}
                  {l.status !== 'started' && <span className="cell-sub">planned {gapWord(l.forecast - l.rooms)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      <p className="fine">
        Rejected lines are left out. Voyance only flags: on real 2017 bookings, buying more or releasing rooms
        automatically on early pace lost about 4–8% of profit, so the buyer makes the call.
      </p>
    </>
  )
}

function Pace({ line }: { line: PositionLine }) {
  if (line.status === 'started') return <span className="muted">Week began</span>
  const off = Math.round(Math.abs(line.pace - 1) * 100)
  if (line.status === 'on_pace') return <span className="pace pace-on">On pace</span>
  const ahead = line.status === 'short'
  const Icon = ahead ? ArrowUpRight : ArrowDownRight
  return (
    <span className="pace pace-off">
      <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
      {off}%<span className="pace-word"> {ahead ? 'ahead' : 'behind'}</span>
    </span>
  )
}

// Projected demand minus rooms: above zero the line is short of rooms, below it has rooms to spare
function gapWord(gap: number): string {
  const n = Math.round(Math.abs(gap))
  if (n === 0) return 'matches'
  return gap > 0 ? `${count(n)} short` : `${count(n)} spare`
}

function takeaway(lines: PositionLine[]): ReactNode {
  const ahead = lines.filter((l) => l.status === 'short')
  const extra = sum(ahead.map((l) => l.projected_demand - l.forecast))
  const spare = lines.filter((l) => l.status !== 'started' && l.gap < -0.5)
  const started = lines.filter((l) => l.status === 'started').length
  const parts: ReactNode[] = []
  if (ahead.length > 0) {
    parts.push(
      <>
        <strong>{plural(ahead.length, 'line')}</strong> {ahead.length === 1 ? 'is' : 'are'} booking faster than forecast,
        projecting <strong>{count(extra)} room-nights</strong> more demand than the plan assumed: worth asking those
        hotels for more rooms.{' '}
      </>,
    )
  }
  if (spare.length > 0) {
    parts.push(
      <>
        <strong>{plural(spare.length, 'line')}</strong> {spare.length === 1 ? 'projects' : 'project'} fewer room-nights
        than rooms bought: about <strong>{count(sum(spare.map((l) => -l.gap)))} rooms</strong> may go unsold.{' '}
      </>,
    )
  }
  if (parts.length === 0) parts.push(<>Every line is booking close to the forecast. </>)
  if (started > 0) {
    parts.push(<>{plural(started, 'line')} {started === 1 ? 'is' : 'are'} in a week that has begun, with final bookings.</>)
  }
  return parts.map((part, i) => <span key={i}>{part}</span>)
}
