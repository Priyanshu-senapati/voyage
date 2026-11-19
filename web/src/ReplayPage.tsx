import { Fragment, useEffect, useRef, useState, type PointerEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Api } from './api/client'
import type { ReplayOut, ReplayOutcome, ReplayWeek } from './types'
import { capital, count, dayMonth, eur, monthName, percent, plural, sum } from './format'
import { useLoad } from './useLoad'
import { Badge, Delta, InfoTip, Segmented } from './ui'

const AGAINST = 're-buying last year'
const percent1 = (v: number) => `${(v * 100).toFixed(1)}%`
type Strategy = 'voyance' | 'rebuy_last_year'
const NAME: Record<Strategy, string> = { voyance: 'Voyance', rebuy_last_year: 'Re-buying last year' }

function loadDemo(): Promise<ReplayOut> {
  return import('./demo/replay-2017.json').then((m) => m.default as unknown as ReplayOut)
}

export function ReplayPage({ api }: { api: Api | null }) {
  const replay = useLoad<ReplayOut>(api ? 'live' : 'demo', () => (api ? api.replay() : loadDemo()))

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1>Voyance vs. re-buying last year</h1>
          <p>
            A replay on real hotel bookings from 2017, week by week. Each week both buyers decide the same number of days
            ahead with only what was known then; then the real bookings arrive.
          </p>
        </div>
        <Badge tone="accent">Historical 2017 bookings · not live inventory</Badge>
      </header>
      {replay.status === 'loading' && <div className="panel loading">Loading the replay…</div>}
      {replay.status === 'error' && <div className="panel empty-state">{replay.message}</div>}
      {replay.status === 'ready' && <Race data={replay.data} />}
    </div>
  )
}

type Totals = ReplayOutcome & { spend: number; revenue: number }
type WeekTotal = { week: string; actual: number; voyance: number; rebuy: number; diff: number; lead: number }

// Every number on the page comes from the engine's weekly rows; the engine's own totals check them
function summarize(data: ReplayOut) {
  const margin = Number(data.assumptions.margin)
  const totals = (s: Strategy): Totals => {
    const rows = data.weeks.map((w) => ({ o: w.strategies[s], rate: w.rate }))
    return {
      rooms: sum(rows.map((r) => r.o.rooms)),
      sold: sum(rows.map((r) => r.o.sold)),
      unsold: sum(rows.map((r) => r.o.unsold)),
      turned_away: sum(rows.map((r) => r.o.turned_away)),
      profit: sum(rows.map((r) => r.o.profit)),
      spend: sum(rows.map((r) => r.o.rooms * r.rate * (1 - margin))),
      revenue: sum(rows.map((r) => r.o.sold * r.rate)),
    }
  }
  const v = totals('voyance')
  const r = totals('rebuy_last_year')
  const mismatches = (['voyance', 'rebuy_last_year'] as Strategy[]).flatMap((s) => {
    const mine = s === 'voyance' ? v : r
    const engine = data.totals[s]
    const out: string[] = []
    for (const key of ['profit', 'rooms', 'sold', 'unsold', 'turned_away'] as const) {
      if (Math.abs(mine[key] - engine[key]) > Math.max(10, Math.abs(engine[key]) * 1e-5)) out.push(`${NAME[s]} ${key}`)
    }
    if (Math.abs(mine.revenue - mine.spend - mine.profit) > Math.max(10, Math.abs(mine.profit) * 1e-5)) out.push(`${NAME[s]} revenue − spend`)
    return out
  })
  const order: string[] = []
  const byWeek = new Map<string, Omit<WeekTotal, 'lead'>>()
  for (const w of data.weeks) {
    let t = byWeek.get(w.week)
    if (!t) {
      order.push(w.week)
      t = { week: w.week, actual: 0, voyance: 0, rebuy: 0, diff: 0 }
      byWeek.set(w.week, t)
    }
    t.actual += w.actual
    t.voyance += w.strategies.voyance.rooms
    t.rebuy += w.strategies.rebuy_last_year.rooms
    t.diff += w.strategies.voyance.profit - w.strategies.rebuy_last_year.profit
  }
  let lead = 0
  const weeks = order.map((week) => {
    const t = byWeek.get(week) as Omit<WeekTotal, 'lead'>
    lead += t.diff
    return { ...t, lead }
  })
  return { v, r, weeks, margin, mismatches }
}

function Race({ data }: { data: ReplayOut }) {
  const { v, r, weeks, margin, mismatches } = summarize(data)
  const profitGain = (v.profit - r.profit) / r.profit
  const fewerAway = (r.turned_away - v.turned_away) / r.turned_away
  const hotels = [...new Set(data.weeks.map((w) => w.hotel))].sort()
  const first = data.weeks[0].week
  const last = data.weeks[data.weeks.length - 1].week

  return (
    <>
      {mismatches.length > 0 && (
        <div className="callout callout-danger" role="alert">
          <p>
            <strong>The weekly rows don't add up to the engine's totals</strong> for {mismatches.join(', ')}. The figures
            below are recomputed from the rows.
          </p>
        </div>
      )}

      <section className="race-hero panel" aria-label="Headline result">
        <div className="race-headline">
          <p className="race-stat">
            <span className="race-number">
              {profitGain >= 0 ? '+' : '−'}
              {percent1(Math.abs(profitGain))}
            </span>
            <span className="race-label">profit with Voyance</span>
            <span className="race-sub">
              {eur(v.profit)} against {eur(r.profit)}
            </span>
          </p>
          <p className="race-stat">
            <span className="race-number">{percent1(Math.abs(fewerAway))}</span>
            <span className="race-label">{fewerAway >= 0 ? 'fewer' : 'more'} guests turned away</span>
            <span className="race-sub">
              {count(v.turned_away)} against {count(r.turned_away)} room-nights
            </span>
          </p>
        </div>
        <p className="race-scope">
          {plural(weeks.length, 'week')} × {hotels.length} hotels, {dayMonth(first)} to {dayMonth(last, true)} ·{' '}
          {plural(data.weeks.length, 'decision')}, each made {String(data.assumptions.lead_days)} days ahead · euros
        </p>
      </section>

      <div className="strategy-cards">
        <StrategyCard name={NAME.rebuy_last_year} rule="Buys what the same week sold last year." t={r} />
        <StrategyCard name={NAME.voyance} rule="Buys its likely forecast, made with what was known that day." t={v} against={r} featured />
      </div>

      <div className="race-charts">
        <ProfitChart v={v} r={r} />
        <ServiceChart v={v} r={r} />
      </div>

      <AllocationTable data={data} hotels={hotels} />

      <LeadChart weeks={weeks} />
      <DemandChart weeks={weeks} />

      <WhyPanel data={data} v={v} r={r} />

      <WeekTable rows={data.weeks} hotels={hotels} />

      <Methodology data={data} margin={margin} first={first} last={last} weeks={weeks.length} checked={mismatches.length === 0} />
    </>
  )
}

type Row = { label: string; key: keyof Totals; format: (n: number) => string; better: 'up' | 'down' | 'none'; info?: string }
const CARD_ROWS: Row[] = [
  { label: 'Rooms bought', key: 'rooms', format: count, better: 'none' },
  { label: 'Demand served', key: 'sold', format: count, better: 'up', info: 'Room-nights sold: the smaller of rooms bought and real bookings.' },
  { label: 'Guests turned away', key: 'turned_away', format: count, better: 'down', info: 'Unmet demand: real bookings beyond the rooms bought.' },
  { label: 'Rooms left unsold', key: 'unsold', format: count, better: 'down' },
  { label: 'Procurement spend', key: 'spend', format: eur, better: 'none' },
  { label: 'Revenue', key: 'revenue', format: eur, better: 'up' },
]

function StrategyCard({ name, rule, t, against, featured }: { name: string; rule: string; t: Totals; against?: Totals; featured?: boolean }) {
  return (
    <article className={`panel strategy-card${featured ? ' strategy-featured' : ''}`} aria-label={name}>
      <header>
        <h2>{name}</h2>
        <p className="fine">{rule}</p>
      </header>
      <p className="strategy-profit">
        <span className="strategy-profit-label">Net profit</span>
        <span className="strategy-profit-value">{eur(t.profit)}</span>
        {against && <Delta value={t.profit - against.profit} format={eur} against={AGAINST} />}
      </p>
      <dl className="strategy-rows">
        {CARD_ROWS.map((row) => (
          <div key={row.label}>
            <dt>
              {row.label}
              {row.info && <InfoTip label={row.label.toLowerCase()}>{row.info}</InfoTip>}
            </dt>
            <dd>
              {row.format(t[row.key])}
              {against && (
                <span className="strategy-delta">
                  <Delta value={t[row.key] - against[row.key]} format={row.format} better={row.better} against={AGAINST} />
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  return <span className={`hbar ${className}`} style={{ width: `${(Math.max(0, value) / max) * 100}%` }} />
}

function Legend() {
  return (
    <ul className="chart-legend" aria-hidden="true">
      <li>
        <i className="key-block key-rebuy" /> {NAME.rebuy_last_year}
      </li>
      <li>
        <i className="key-block key-voyance" /> {NAME.voyance}
      </li>
    </ul>
  )
}

function ProfitChart({ v, r }: { v: Totals; r: Totals }) {
  const metrics = [
    { label: 'Revenue', v: v.revenue, r: r.revenue },
    { label: 'Procurement spend', v: v.spend, r: r.spend },
    { label: 'Net profit', v: v.profit, r: r.profit },
  ]
  const max = Math.max(...metrics.flatMap((m) => [m.v, m.r]))
  return (
    <section className="panel chart-card" aria-labelledby="profit-chart">
      <h3 id="profit-chart">Profit comparison</h3>
      <Legend />
      <div className="hbars" role="img" aria-label={`Net profit ${eur(v.profit)} for Voyance against ${eur(r.profit)} for re-buying last year`}>
        {metrics.map((m) => (
          <div key={m.label} className="hbar-group">
            <span className="hbar-title">{m.label}</span>
            <div className="hbar-row">
              <Bar value={m.r} max={max} className="hbar-rebuy" />
              <span className="hbar-value">{eur(m.r)}</span>
            </div>
            <div className="hbar-row">
              <Bar value={m.v} max={max} className="hbar-voyance" />
              <span className="hbar-value strong">{eur(m.v)}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="fine">
        Voyance spends {eur(v.spend - r.spend)} more on rooms and takes {eur(v.revenue - r.revenue)} more from selling them.
      </p>
    </section>
  )
}

function ServiceChart({ v, r }: { v: Totals; r: Totals }) {
  const demand = v.sold + v.turned_away
  const rows = [
    { name: NAME.rebuy_last_year, t: r },
    { name: NAME.voyance, t: v },
  ]
  return (
    <section className="panel chart-card" aria-labelledby="service-chart">
      <h3 id="service-chart">Guest service</h3>
      <ul className="chart-legend" aria-hidden="true">
        <li>
          <i className="key-block key-served" /> Served
        </li>
        <li>
          <i className="key-block key-away" /> Turned away
        </li>
      </ul>
      <div className="hbars">
        {rows.map(({ name, t }) => (
          <div key={name} className="hbar-group">
            <span className="hbar-title">
              {name} <span className="muted">· serves {percent(t.sold / demand)} of demand</span>
            </span>
            <div className="stack" role="img" aria-label={`${name}: ${count(t.sold)} served, ${count(t.turned_away)} turned away`}>
              <span className="stack-served" style={{ width: `${(t.sold / demand) * 100}%` }} />
              <span className="stack-away" style={{ width: `${(t.turned_away / demand) * 100}%` }} />
            </div>
            <span className="fine">
              {count(t.sold)} served · {count(t.turned_away)} turned away · {count(t.unsold)} rooms unsold
            </span>
          </div>
        ))}
      </div>
      <p className="fine">Real demand: {count(demand)} room-nights booked by agents across the replay.</p>
    </section>
  )
}

function AllocationTable({ data, hotels }: { data: ReplayOut; hotels: string[] }) {
  const rows = hotels.flatMap((hotel) =>
    (['rebuy_last_year', 'voyance'] as Strategy[]).map((s) => {
      const outs = data.weeks.filter((w) => w.hotel === hotel).map((w) => w.strategies[s])
      return {
        hotel,
        s,
        rooms: sum(outs.map((o) => o.rooms)),
        sold: sum(outs.map((o) => o.sold)),
        unsold: sum(outs.map((o) => o.unsold)),
        away: sum(outs.map((o) => o.turned_away)),
        profit: sum(outs.map((o) => o.profit)),
      }
    }),
  )
  const most = Math.max(...rows.map((x) => x.rooms + x.away), 1)
  return (
    <section className="panel table-panel" aria-labelledby="allocation-title">
      <div className="panel-bar">
        <h2 className="panel-title" id="allocation-title">
          Inventory allocation by hotel
        </h2>
        <ul className="chart-legend" aria-hidden="true">
          <li>
            <i className="key-block key-served" /> Sold
          </li>
          <li>
            <i className="key-block key-unsold" /> Unsold
          </li>
          <li>
            <i className="key-block key-away" /> Turned away
          </li>
        </ul>
      </div>
      <table className="table" aria-label="Inventory allocation by hotel">
        <thead>
          <tr>
            <th scope="col" className="hide-sm">
              Hotel
            </th>
            <th scope="col">Buyer</th>
            <th scope="col" className="bar-col hide-sm">
              Rooms and demand
            </th>
            <th scope="col" className="num">
              Bought
            </th>
            <th scope="col" className="num hide-sm">
              Unsold
            </th>
            <th scope="col" className="num hide-sm">
              Turned away
            </th>
            <th scope="col" className="num">
              Profit
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={`${x.hotel}|${x.s}`} className={x.s === 'voyance' ? 'row-featured' : undefined}>
              <td className="hide-sm">
                {x.s === 'rebuy_last_year' ? <strong>{x.hotel}</strong> : <span className="sr-only">{x.hotel}</span>}
              </td>
              <td>
                {NAME[x.s]}
                <span className="cell-sub show-sm">{x.hotel}</span>
              </td>
              <td className="bar-col hide-sm">
                <span className="stack stack-sm" aria-hidden="true">
                  <span className="stack-served" style={{ width: `${(x.sold / most) * 100}%` }} />
                  <span className="stack-unsold" style={{ width: `${(x.unsold / most) * 100}%` }} />
                  <span className="stack-away" style={{ width: `${(x.away / most) * 100}%` }} />
                </span>
              </td>
              <td className="num">{count(x.rooms)}</td>
              <td className="num hide-sm">{count(x.unsold)}</td>
              <td className="num hide-sm">{count(x.away)}</td>
              <td className="num strong">{eur(x.profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

// ---------- charts over the weeks ----------

function usePlotWidth(initial: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setW(Math.max(300, Math.round(entry.contentRect.width))))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { ref, W }
}

const M = { top: 20, right: 64, bottom: 28, left: 56 }

function niceStep(range: number): number {
  const raw = Math.max(range, 1) / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
}

function frame(weeks: { week: string }[], values: number[], W: number, H: number) {
  const step = niceStep(Math.max(...values, 0) - Math.min(...values, 0))
  const lo = Math.floor(Math.min(...values, 0) / step) * step
  const hi = Math.ceil(Math.max(...values, 0) / step) * step
  const n = weeks.length
  const x = (i: number) => M.left + (n > 1 ? i / (n - 1) : 0.5) * (W - M.left - M.right)
  const y = (v: number) => M.top + (1 - (v - lo) / (hi - lo || 1)) * (H - M.top - M.bottom)
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step)
  const months = weeks.map((w, i) => ({ i, month: w.week.slice(0, 7) })).filter((m, i, all) => i === 0 || m.month !== all[i - 1].month)
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  return { x, y, ticks, months, path, n }
}

type Frame = ReturnType<typeof frame>

function Axes({ f, W, H, label }: { f: Frame; W: number; H: number; label: (t: number) => string }) {
  return (
    <>
      {f.ticks.map((t) => (
        <g key={t}>
          <line className={t === 0 ? 'baseline' : 'grid'} x1={M.left} x2={W - M.right} y1={f.y(t)} y2={f.y(t)} />
          <text className="axis" x={M.left - 8} y={f.y(t)} dy="0.32em" textAnchor="end">
            {label(t)}
          </text>
        </g>
      ))}
      {f.months.map((m) => (
        <text key={m.month} className="axis" x={f.x(m.i)} y={H - 8} textAnchor="middle">
          {monthName(Number(m.month.slice(5, 7)))}
        </text>
      ))}
    </>
  )
}

function useHover(n: number) {
  const [hover, setHover] = useState<number | null>(null)
  function track(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const t = (event.clientX - box.left) / box.width
    setHover(Math.min(n - 1, Math.max(0, Math.round(t * (n - 1)))))
  }
  return { hover, track, clear: () => setHover(null) }
}

function HitArea({ W, H, track, clear }: { W: number; H: number; track: (e: PointerEvent<SVGRectElement>) => void; clear: () => void }) {
  return (
    <rect
      className="hit"
      x={M.left - 10}
      y={M.top}
      width={W - M.left - M.right + 20}
      height={H - M.top - M.bottom}
      onPointerMove={track}
      onPointerLeave={clear}
    />
  )
}

function tipStyle(f: Frame, i: number, W: number) {
  return { left: `${(f.x(i) / W) * 100}%`, transform: `translateX(${i > f.n * 0.6 ? '-105%' : '5%'})` }
}

function LeadChart({ weeks }: { weeks: WeekTotal[] }) {
  const { ref, W } = usePlotWidth(720)
  const H = Math.round(Math.min(260, Math.max(200, W * 0.32)))
  const leads = weeks.map((w) => w.lead / 1e3)
  const f = frame(weeks, leads, W, H)
  const line = f.path(leads)
  const area = `${line}L${f.x(f.n - 1).toFixed(1)},${f.y(0).toFixed(1)}L${f.x(0).toFixed(1)},${f.y(0).toFixed(1)}Z`
  const ahead = weeks.filter((w) => w.diff > 0).length
  const end = weeks[weeks.length - 1]
  const { hover, track, clear } = useHover(f.n)

  return (
    <div className="panel curve">
      <h3>Replay timeline: Voyance's running profit lead</h3>
      <p className="curve-takeaway">
        Voyance earned more in <strong>{ahead} of {weeks.length} weeks</strong> and finished <strong>{eur(end.lead)}</strong>{' '}
        ahead. It loses some weeks: the forecast is a range, not a promise.
      </p>
      <div className="curve-plot lead-plot" ref={ref}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Running profit lead over re-buying last year: ${eur(end.lead)} after ${weeks.length} weeks, ahead in ${ahead} of them.`}
        >
          <Axes f={f} W={W} H={H} label={(t) => (t === 0 ? '€0' : `${t < 0 ? '−' : ''}€${Math.abs(t)}K`)} />
          <path className="lead-area" d={area} />
          <path className="series series-profit" d={line} />
          <circle className="dot dot-profit" cx={f.x(f.n - 1)} cy={f.y(leads[f.n - 1])} r={4} />
          <text className="end-label" x={f.x(f.n - 1) + 9} y={f.y(leads[f.n - 1])} dy="0.32em">
            {eur(end.lead)}
          </text>
          {hover !== null && (
            <>
              <line className="crosshair" x1={f.x(hover)} x2={f.x(hover)} y1={M.top} y2={H - M.bottom} />
              <circle className="dot dot-profit" cx={f.x(hover)} cy={f.y(leads[hover])} r={4} />
            </>
          )}
          <HitArea W={W} H={H} track={track} clear={clear} />
        </svg>
        {hover !== null && (
          <div className="tip" style={tipStyle(f, hover, W)}>
            <strong>Week of {dayMonth(weeks[hover].week, true)}</strong>
            <span>Lead so far {eur(weeks[hover].lead)}</span>
            <span className="tip-muted">
              This week {weeks[hover].diff >= 0 ? '+' : '−'}
              {eur(Math.abs(weeks[hover].diff))}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function DemandChart({ weeks }: { weeks: WeekTotal[] }) {
  const { ref, W } = usePlotWidth(720)
  const H = Math.round(Math.min(260, Math.max(200, W * 0.32)))
  const series = [
    { key: 'actual', name: 'Real demand', className: 'series-actual', values: weeks.map((w) => w.actual) },
    { key: 'voyance', name: 'Voyance bought', className: 'series-profit', values: weeks.map((w) => w.voyance) },
    { key: 'rebuy', name: 'Re-buying bought', className: 'series-rebuy', values: weeks.map((w) => w.rebuy) },
  ]
  const f = frame(weeks, series.flatMap((s) => s.values), W, H)
  const { hover, track, clear } = useHover(f.n)
  const under = weeks.filter((w) => w.rebuy < w.actual).length

  return (
    <div className="panel curve">
      <h3>Rooms bought against real demand, week by week</h3>
      <p className="curve-takeaway">
        Re-buying last year bought less than real demand in <strong>{under} of {weeks.length} weeks</strong>: 2017 was busier
        than 2016, and last year's number can't see that coming.
      </p>
      <ul className="curve-legend" aria-hidden="true">
        {series.map((s) => (
          <li key={s.key}>
            <i className={`key key-${s.key}`} /> {s.name}
          </li>
        ))}
      </ul>
      <div className="curve-plot lead-plot" ref={ref}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Weekly room-nights: real demand, what Voyance bought and what re-buying last year bought, both hotels together."
        >
          <Axes f={f} W={W} H={H} label={(t) => count(t)} />
          {series.map((s) => (
            <path key={s.key} className={`series ${s.className}`} d={f.path(s.values)} />
          ))}
          {hover !== null && <line className="crosshair" x1={f.x(hover)} x2={f.x(hover)} y1={M.top} y2={H - M.bottom} />}
          <HitArea W={W} H={H} track={track} clear={clear} />
        </svg>
        {hover !== null && (
          <div className="tip" style={tipStyle(f, hover, W)}>
            <strong>Week of {dayMonth(weeks[hover].week, true)}</strong>
            {series.map((s) => (
              <span key={s.key}>
                <i className={`key key-${s.key}`} /> {s.name}: {count(s.values[hover])}
              </span>
            ))}
          </div>
        )}
      </div>
      <p className="curve-note">Room-nights, both hotels together. The week-by-week table below has every number.</p>
    </div>
  )
}

// ---------- why, and how ----------

function WhyPanel({ data, v, r }: { data: ReplayOut; v: Totals; r: Totals }) {
  const rows = data.weeks
  const n = rows.length
  const demand = sum(rows.map((w) => w.actual))
  const lastYear = sum(rows.map((w) => w.last_year))
  const errForecast = sum(rows.map((w) => Math.abs(w.forecast.likely - w.actual))) / n
  const errLastYear = sum(rows.map((w) => Math.abs(w.last_year - w.actual))) / n
  const inRange = rows.filter((w) => w.actual >= w.forecast.low && w.actual <= w.forecast.high).length
  const under = rows.filter((w) => w.last_year < w.actual).length
  const drivers = new Map<string, number>()
  for (const w of rows) for (const d of w.forecast.drivers) drivers.set(d.label, (drivers.get(d.label) ?? 0) + 1)
  const top = [...drivers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)

  return (
    <section className="panel why-panel" aria-labelledby="why-title">
      <h2 className="panel-title" id="why-title">
        Why Voyance performed better
      </h2>
      <ol className="why-steps">
        <li>
          <strong>Demand moved, and last year's number couldn't.</strong> Real demand came to {count(demand)} room-nights
          against {count(lastYear)} the year before ({percent(demand / lastYear - 1)} more). Re-buying last year bought too few
          rooms in {under} of {n} hotel-weeks, so it turned away {count(r.turned_away)} room-nights of guests.
        </li>
        <li>
          <strong>The forecast was closer.</strong> On the day of each decision, Voyance's likely forecast missed real demand by{' '}
          {count(errForecast)} room-nights a hotel-week on average; last year's number missed by {count(errLastYear)}. Its
          low-to-high range held the real outcome in {inRange} of {n} hotel-weeks.
        </li>
        <li>
          <strong>It read signals a re-buy ignores.</strong> The forecast's biggest drivers, by how often each was among a
          decision's top three:{' '}
          {top.map(([label, times], i) => (
            <Fragment key={label}>
              {i > 0 && (i === top.length - 1 ? ' and ' : ', ')}
              {label} ({times} of {n})
            </Fragment>
          ))}
          . Bookings already on the books are something last year's total can't see.
        </li>
        <li>
          <strong>Allocation followed the forecast.</strong> Voyance bought {count(v.rooms - r.rooms)} more rooms, sold{' '}
          {count(v.sold - r.sold)} more and still left {count(r.unsold - v.unsold)} fewer unsold: the extra rooms went to the
          weeks that needed them.
        </li>
      </ol>
      <p className="fine">
        What this replay does not test: the risk setting and the budget optimizer. Here Voyance buys its likely forecast for
        every hotel-week, with no budget limit, because the data has no supplier contracts to optimize against. Risk-aware
        buying is tested on the simulated December in the Buy Desk.
      </p>
    </section>
  )
}

function Methodology({ data, margin, first, last, weeks, checked }: { data: ReplayOut; margin: number; first: string; last: string; weeks: number; checked: boolean }) {
  const lead = String(data.assumptions.lead_days)
  return (
    <section className="panel method-panel" aria-labelledby="method-title">
      <h2 className="panel-title" id="method-title">
        Methodology
      </h2>
      <dl className="method-list">
        <div>
          <dt>Data</dt>
          <dd>{capital(data.source)}.</dd>
        </div>
        <div>
          <dt>Period</dt>
          <dd>
            {weeks} weeks, from the week of {dayMonth(first, true)} to the week of {dayMonth(last, true)}: {data.weeks.length}{' '}
            hotel-weeks, each decided once.
          </dd>
        </div>
        <div>
          <dt>Decision timing</dt>
          <dd>
            Each hotel-week is decided {lead} days before it starts. The forecast is trained walk-forward: only bookings known
            before that day are used.
          </dd>
        </div>
        <div>
          <dt>Baseline</dt>
          <dd>Re-buying last year: buy the room-nights the same week sold the year before.</dd>
        </div>
        <div>
          <dt>Voyance</dt>
          <dd>Buy the forecast's likely room-nights for that week, rounded down to whole rooms.</dd>
        </div>
        <div>
          <dt>Outcome</dt>
          <dd>
            Sold = the smaller of rooms bought and real demand; unsold = bought − sold; turned away = demand − sold. Revenue =
            sold × that week's average agent rate. Spend = bought × the rate × {percent(1 - margin)} (the assumed contract
            cost, a {percent(margin)} margin). Profit = revenue − spend. Same rules and prices for both buyers.
          </dd>
        </div>
        <div>
          <dt>Checks</dt>
          <dd>
            {checked
              ? "Every total on this page is added up from the replay engine's weekly rows and matches the engine's own totals."
              : 'The weekly rows do not match the engine totals: see the warning at the top.'}
          </dd>
        </div>
      </dl>
    </section>
  )
}

// ---------- week by week ----------

function WeekTable({ rows, hotels }: { rows: ReplayWeek[]; hotels: string[] }) {
  const [hotel, setHotel] = useState('all')
  const [open, setOpen] = useState<string | null>(null)
  const shown = rows.filter((row) => hotel === 'all' || row.hotel === hotel)

  return (
    <div className="panel table-panel">
      <div className="panel-bar">
        <h2 className="panel-title">Week by week: what each buyer believed, and what happened</h2>
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
                  The likely room-nights on the day of the decision, with the low to high range under it. Voyance bought the
                  likely number.
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
    [NAME.voyance, row.strategies.voyance],
    [NAME.rebuy_last_year, row.strategies.rebuy_last_year],
  ]

  return (
    <div className="week-detail">
      <section>
        <h3>What the forecast knew on {dayMonth(row.decided_on, true)}</h3>
        <p className="fine">
          {count(row.on_books)} room-nights already booked; last year's week sold {count(row.last_year)}. Biggest pushes on the
          forecast, in room-nights:
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
