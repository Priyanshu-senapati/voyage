import { Fragment, useEffect, useRef, useState, type PointerEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Api } from './api/client'
import type { ReplayOut, ReplayOutcome, ReplayWeek } from './types'
import { capital, count, dayMonth, eur, monthName, percent } from './format'
import { useLoad } from './useLoad'
import { Delta, InfoTip, Segmented } from './ui'

const AGAINST = 're-buying last year'

function loadDemo(): Promise<ReplayOut> {
  return import('./demo/replay-2017.json').then((m) => m.default as unknown as ReplayOut)
}

export function ReplayPage({ api }: { api: Api | null }) {
  const replay = useLoad<ReplayOut>(api ? 'live' : 'demo', () => (api ? api.replay() : loadDemo()))
  const lead = replay.status === 'ready' ? Number(replay.data.assumptions.lead_days) : 120

  return (
    <div className="page">
      <header className="page-head">
        <h1>2017 replay</h1>
        <p>
          Real agent bookings at two hotels, replayed week by week. Each week Voyance knew only what was known {lead} days
          before, and bought its likely forecast. The comparison is the usual rule: re-buy what last year's week sold.
        </p>
      </header>
      {replay.status === 'loading' && <div className="panel loading">Loading the replay…</div>}
      {replay.status === 'error' && <div className="panel empty-state">{replay.message}</div>}
      {replay.status === 'ready' && <Replay data={replay.data} />}
    </div>
  )
}

type WeekTotal = { week: string; diff: number; lead: number }

function Replay({ data }: { data: ReplayOut }) {
  const v = data.totals.voyance
  const r = data.totals.rebuy_last_year
  const weeks = byWeek(data.weeks)
  const first = data.weeks[0].week
  const last = data.weeks[data.weeks.length - 1].week
  const hotels = [...new Set(data.weeks.map((w) => w.hotel))].sort()
  const margin = Number(data.assumptions.margin)

  return (
    <>
      <dl className="kpis panel">
        <div className="kpi">
          <dt>Profit, buying the forecast</dt>
          <dd className="kpi-value">{eur(v.profit)}</dd>
          <dd className="kpi-sub">re-buying last year: {eur(r.profit)}</dd>
          <dd className="kpi-delta">
            <Delta value={v.profit - r.profit} format={eur} against={AGAINST} />
            <span className="delta-note"> · {percent((v.profit - r.profit) / r.profit)} more</span>
          </dd>
        </div>
        <div className="kpi">
          <dt>
            Guests turned away
            <InfoTip label="guests turned away">
              Room-nights agents booked beyond the rooms bought: demand that went to someone else.
            </InfoTip>
          </dt>
          <dd className="kpi-value">{count(v.turned_away)}</dd>
          <dd className="kpi-sub">room-nights · re-buying: {count(r.turned_away)}</dd>
          <dd className="kpi-delta">
            <Delta value={v.turned_away - r.turned_away} format={count} better="down" against={AGAINST} />
          </dd>
        </div>
        <div className="kpi">
          <dt>Rooms left unsold</dt>
          <dd className="kpi-value">{count(v.unsold)}</dd>
          <dd className="kpi-sub">room-nights · re-buying: {count(r.unsold)}</dd>
          <dd className="kpi-delta">
            <Delta value={v.unsold - r.unsold} format={count} better="down" against={AGAINST} />
          </dd>
        </div>
        <div className="kpi">
          <dt>Weeks replayed</dt>
          <dd className="kpi-value">{weeks.length}</dd>
          <dd className="kpi-sub">
            {hotels.length} hotels · {dayMonth(first)} to {dayMonth(last, true)}
          </dd>
        </div>
      </dl>

      <LeadChart weeks={weeks} />

      <WeekTable rows={data.weeks} hotels={hotels} />

      <p className="fine">
        {data.source}. The assumed contract cost is {percent(1 - margin)} of each week's average agent rate, a{' '}
        {percent(margin)} margin on every room sold. Euros, as in the data.
      </p>
    </>
  )
}

// Both hotels together, week by week, with the running lead over re-buying last year
function byWeek(rows: ReplayWeek[]): WeekTotal[] {
  const order: string[] = []
  const diff = new Map<string, number>()
  for (const row of rows) {
    if (!diff.has(row.week)) order.push(row.week)
    diff.set(row.week, (diff.get(row.week) ?? 0) + row.strategies.voyance.profit - row.strategies.rebuy_last_year.profit)
  }
  let lead = 0
  return order.map((week) => {
    const d = diff.get(week) ?? 0
    lead += d
    return { week, diff: d, lead }
  })
}

const M = { top: 20, right: 64, bottom: 28, left: 56 }

function LeadChart({ weeks }: { weeks: WeekTotal[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(720)
  useEffect(() => {
    const el = plotRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setW(Math.max(300, Math.round(entry.contentRect.width))))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const H = Math.round(Math.min(280, Math.max(200, W * 0.36)))

  const leads = weeks.map((w) => w.lead / 1e3)
  const step = niceStep(Math.max(...leads, 0) - Math.min(...leads, 0))
  const lo = Math.floor(Math.min(...leads, 0) / step) * step
  const hi = Math.ceil(Math.max(...leads, 0) / step) * step
  const n = weeks.length
  const x = (i: number) => M.left + (n > 1 ? i / (n - 1) : 0.5) * (W - M.left - M.right)
  const y = (v: number) => M.top + (1 - (v - lo) / (hi - lo || 1)) * (H - M.top - M.bottom)
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step)
  const months = weeks.map((w, i) => ({ i, month: w.week.slice(0, 7) })).filter((m, i, all) => i === 0 || m.month !== all[i - 1].month)
  const line = leads.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const area = `${line}L${x(n - 1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`

  const ahead = weeks.filter((w) => w.diff > 0).length
  const end = weeks[n - 1]
  const shown = hover === null ? null : weeks[hover]

  function track(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const t = (event.clientX - box.left) / box.width
    setHover(Math.min(n - 1, Math.max(0, Math.round(t * (n - 1)))))
  }

  return (
    <div className="panel curve">
      <h3>Voyance's running lead over re-buying last year</h3>
      <p className="curve-takeaway">
        Buying the forecast earned more in <strong>{ahead} of {n} weeks</strong> and finished{' '}
        <strong>{eur(end.lead)}</strong> ahead. It loses some weeks: the forecast is a range, not a promise.
      </p>
      <div className="curve-plot lead-plot" ref={plotRef}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Running profit lead of buying the forecast over re-buying last year, week by week: ${eur(end.lead)} after ${n} weeks, ahead in ${ahead} of them.`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'baseline' : 'grid'} x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
              <text className="axis" x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {t === 0 ? '€0' : `${t < 0 ? '−' : ''}€${Math.abs(t)}K`}
              </text>
            </g>
          ))}
          {months.map((m) => (
            <text key={m.month} className="axis" x={x(m.i)} y={H - 8} textAnchor="middle">
              {monthName(Number(m.month.slice(5, 7)))}
            </text>
          ))}
          <path className="lead-area" d={area} />
          <path className="series series-profit" d={line} />
          <circle className="dot dot-profit" cx={x(n - 1)} cy={y(leads[n - 1])} r={4} />
          <text className="end-label" x={x(n - 1) + 9} y={y(leads[n - 1])} dy="0.32em">
            {eur(end.lead)}
          </text>
          {shown && hover !== null && (
            <>
              <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={M.top} y2={H - M.bottom} />
              <circle className="dot dot-profit" cx={x(hover)} cy={y(leads[hover])} r={4} />
            </>
          )}
          <rect
            className="hit"
            x={M.left - 10}
            y={M.top}
            width={W - M.left - M.right + 20}
            height={H - M.top - M.bottom}
            onPointerMove={track}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {shown && hover !== null && (
          <div
            className="tip"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > n * 0.6 ? '-105%' : '5%'})` }}
          >
            <strong>Week of {dayMonth(shown.week, true)}</strong>
            <span>Lead so far {eur(shown.lead)}</span>
            <span className="tip-muted">
              This week {shown.diff >= 0 ? '+' : '−'}
              {eur(Math.abs(shown.diff))}
            </span>
          </div>
        )}
      </div>
      <p className="curve-note">Both hotels together. The week-by-week table below has every number.</p>
    </div>
  )
}

function niceStep(range: number): number {
  const raw = Math.max(range, 1) / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
}

function WeekTable({ rows, hotels }: { rows: ReplayWeek[]; hotels: string[] }) {
  const [hotel, setHotel] = useState('all')
  const [open, setOpen] = useState<string | null>(null)
  const shown = rows.filter((row) => hotel === 'all' || row.hotel === hotel)

  return (
    <div className="panel table-panel">
      <div className="pace-table-head">
        <h2 className="panel-title">Week by week: what we believed, and what happened</h2>
        <Segmented
          label="Hotel"
          value={hotel}
          onChange={setHotel}
          options={[{ value: 'all', label: 'Both hotels' }, ...hotels.map((h) => ({ value: h, label: h }))]}
        />
      </div>
      <div className="list-scroll">
        <table className="table replay-table" aria-label="Replay by week">
          <thead>
            <tr>
              <th scope="col">Week</th>
              <th scope="col" className="num">
                Forecast
                <InfoTip label="forecast">
                  The likely room-nights on the day of the decision, with the low to high range under it. Voyance bought
                  the likely number.
                </InfoTip>
              </th>
              <th scope="col" className="num hide-sm">
                Last year
              </th>
              <th scope="col" className="num">
                Actual
              </th>
              <th scope="col" className="num">
                Profit vs re-buying
              </th>
              <th scope="col" className="chevron-col hide-sm">
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const key = `${row.week}|${row.hotel}`
              const expanded = open === key
              const diff = row.strategies.voyance.profit - row.strategies.rebuy_last_year.profit
              const detailId = `replay-${key.replace(/[^a-z0-9]/gi, '-')}`
              return (
                <Fragment key={key}>
                  <tr className="row-link" aria-current={expanded ? 'true' : undefined} onClick={() => setOpen(expanded ? null : key)}>
                    <td>
                      <button
                        type="button"
                        className="row-button"
                        aria-expanded={expanded}
                        aria-controls={detailId}
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpen(expanded ? null : key)
                        }}
                      >
                        <strong>{dayMonth(row.week)}</strong>
                      </button>
                      <span className="cell-sub">{row.hotel}</span>
                    </td>
                    <td className="num">
                      {count(row.forecast.likely)}
                      <span className="cell-sub">
                        {count(row.forecast.low)}–{count(row.forecast.high)}
                      </span>
                    </td>
                    <td className="num hide-sm">{count(row.last_year)}</td>
                    <td className="num strong">{count(row.actual)}</td>
                    <td className={`num ${diff > 0 ? 'pos' : diff < 0 ? 'neg' : 'muted'}`}>
                      {Math.round(diff) === 0 ? 'same' : `${diff > 0 ? '+' : '−'}${eur(Math.abs(diff))}`}
                    </td>
                    <td className="chevron-col hide-sm">
                      <ChevronRight size={16} strokeWidth={2} aria-hidden="true" className={expanded ? 'chevron-open' : undefined} />
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="detail-row" id={detailId}>
                      <td colSpan={6}>
                        <WeekDetail row={row} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function WeekDetail({ row }: { row: ReplayWeek }) {
  const { drivers } = row.forecast
  const most = Math.max(...drivers.map((d) => Math.abs(d.room_nights)), 1)
  const outcomes: [string, ReplayOutcome][] = [
    ['Buying the forecast', row.strategies.voyance],
    ['Re-buying last year', row.strategies.rebuy_last_year],
  ]

  return (
    <div className="week-detail">
      <section>
        <h3>What the forecast knew on {dayMonth(row.decided_on, true)}</h3>
        <p className="fine">
          {count(row.on_books)} room-nights already booked; last year's week sold {count(row.last_year)}. Biggest pushes
          on the forecast, in room-nights:
        </p>
        <ul className="drivers">
          {drivers.map((d) => (
            <li key={d.label}>
              <span className="driver-label">{capital(d.label)}</span>
              <span className="driver-track" aria-hidden="true">
                <span
                  className={`driver-bar ${d.room_nights < 0 ? 'driver-down' : 'driver-up'}`}
                  style={{ width: `${(Math.abs(d.room_nights) / most) * 50}%` }}
                />
              </span>
              <span className="driver-value">
                {d.room_nights < 0 ? '−' : '+'}
                {count(Math.abs(d.room_nights))}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>What happened: {count(row.actual)} room-nights came</h3>
        <div className="mini-scroll">
        <table className="mini-table outcome-table">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">Profit</th>
              <th scope="col">Bought</th>
              <th scope="col">Unsold</th>
              <th scope="col">Turned away</th>
            </tr>
          </thead>
          <tbody>
            {outcomes.map(([name, o]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                <td className="strong">{eur(o.profit)}</td>
                <td>{count(o.rooms)}</td>
                <td>{count(o.unsold)}</td>
                <td>{count(o.turned_away)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="fine">Average agent rate that week: {eur(row.rate)} a night.</p>
      </section>
    </div>
  )
}
