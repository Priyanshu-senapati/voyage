import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { ApiError, type Api } from './api/client'
import demoFrontier from './demo/frontier-2cr.json'
import type { FrontierPoint } from './types'
import { whatIfActive, whatIfParams, type WhatIf } from './useDesk'
import { inr } from './format'

interface Props {
  api: Api | null
  budget: number
  risk: number
  whatIf: WhatIf
  onPick: (risk: number) => void
}

type Curve = { status: 'loading' } | { status: 'ready'; points: FrontierPoint[] } | { status: 'error'; message: string }

const DEMO_BUDGET = 2e7
const FETCH_DELAY_MS = 500 // the frontier is slow (4-7 s) and limited to 10 a minute: wait for the budget to settle

// One fetch per budget; cached for the session
function useFrontier(api: Api | null, budget: number, whatIf: WhatIf): Curve {
  const cache = useRef(new Map<string, FrontierPoint[]>())
  const key = `${budget}|${whatIf.demand}|${whatIf.cost}|${whatIf.event}`
  const [curve, setCurve] = useState<Curve>({ status: 'loading' })

  useEffect(() => {
    let current = true
    const timer = setTimeout(async () => {
      const cached = cache.current.get(key)
      if (cached) return setCurve({ status: 'ready', points: cached })
      if (!api) {
        return setCurve(
          budget === DEMO_BUDGET && !whatIfActive(whatIf)
            ? { status: 'ready', points: demoFrontier }
            : { status: 'error', message: 'The demo has the curve for ₹2 cr only. Sign in to try other budgets.' },
        )
      }
      setCurve({ status: 'loading' })
      try {
        const points = await api.frontier(budget, whatIfParams(whatIf))
        cache.current.set(key, points)
        if (current) setCurve({ status: 'ready', points })
      } catch (error) {
        if (!current) return
        const message =
          error instanceof ApiError && error.status === 429
            ? 'The risk curve is limited to 10 a minute. Wait a moment, then reopen this tab.'
            : error instanceof Error
              ? error.message
              : 'Could not work out the risk curve'
        setCurve({ status: 'error', message })
      }
    }, FETCH_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` covers budget and the what-if
  }, [api, key])

  return curve
}

const M = { top: 26, right: 64, bottom: 28, left: 48 }
const lakh = (v: number) => v / 1e5

export function RiskCurve({ api, budget, risk, whatIf, onPick }: Props) {
  const curve = useFrontier(api, budget, whatIf)
  const [hover, setHover] = useState<number | null>(null)
  // draw at the plot's real width, so labels stay at UI size from phone to desktop
  const plotRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(640)
  useEffect(() => {
    const el = plotRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setW(Math.max(300, Math.round(entry.contentRect.width))))
    observer.observe(el)
    return () => observer.disconnect()
  }, [curve.status])
  const H = Math.round(Math.min(300, Math.max(220, W * 0.42)))

  if (curve.status === 'loading') {
    return (
      <div className="curve curve-loading" aria-busy="true">
        <h3>How risk trades profit for safety at {inr(budget)}{whatIfActive(whatIf) ? ', with the what-if' : ''}</h3>
        <p className="curve-note">Re-planning at 11 risk settings. This takes a few seconds.</p>
        <span className="curve-skeleton" />
      </div>
    )
  }
  if (curve.status === 'error') {
    return (
      <div className="curve">
        <h3>How risk trades profit for safety at {inr(budget)}{whatIfActive(whatIf) ? ', with the what-if' : ''}</h3>
        <p className="curve-note">{curve.message}</p>
      </div>
    )
  }

  const points = curve.points
  const values = points.flatMap((p) => [lakh(p.expected_profit), lakh(p.worst_case_profit)])
  const lo = Math.floor(Math.min(...values) / 2) * 2
  const hi = Math.ceil(Math.max(...values) / 2) * 2
  const x = (r: number) => M.left + r * (W - M.left - M.right)
  const y = (v: number) => M.top + (1 - (v - lo) / (hi - lo || 1)) * (H - M.top - M.bottom)
  const ticks = Array.from({ length: (hi - lo) / 2 + 1 }, (_, i) => lo + i * 2)
  const path = (key: 'expected_profit' | 'worst_case_profit') =>
    points.map((p, i) => `${i ? 'L' : 'M'}${x(p.risk_aversion).toFixed(1)},${y(lakh(p[key])).toFixed(1)}`).join('')

  const nearest = (r: number) =>
    points.reduce((best, p, i) => (Math.abs(p.risk_aversion - r) < Math.abs(points[best].risk_aversion - r) ? i : best), 0)
  const here = points[nearest(risk)]
  const start = points[0]
  const last = points[points.length - 1]
  const shown = hover === null ? null : points[hover]

  function track(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const r = (event.clientX - box.left) / box.width
    setHover(nearest(Math.min(1, Math.max(0, r))))
  }

  const gave = start.expected_profit - here.expected_profit
  const kept = here.worst_case_profit - start.worst_case_profit

  return (
    <div className="curve">
      <h3>How risk trades profit for safety at {inr(budget)}{whatIfActive(whatIf) ? ', with the what-if' : ''}</h3>
      <p className="curve-takeaway">
        {here.risk_aversion === 0 ? (
          <>
            At risk 0 the worst 5% of seasons make {inr(start.worst_case_profit)}. Risk 1 would protect{' '}
            {inr(last.worst_case_profit - start.worst_case_profit)} more for {inr(start.expected_profit - last.expected_profit)} of
            expected profit.
          </>
        ) : (
          <>
            At risk {here.risk_aversion}, you give up <strong>{inr(gave)}</strong> of expected profit to make{' '}
            <strong>{inr(kept)}</strong> more in a bad season, compared with risk 0.
          </>
        )}
      </p>

      <ul className="curve-legend" aria-hidden="true">
        <li>
          <i className="key key-profit" /> Expected profit
        </li>
        <li>
          <i className="key key-worst" /> Bad-season profit (worst 5%)
        </li>
      </ul>

      <div className="curve-plot" ref={plotRef}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Expected profit falls from ${inr(start.expected_profit)} to ${inr(last.expected_profit)} as risk goes from 0 to 1, while the worst 5% of seasons rise from ${inr(start.worst_case_profit)} to ${inr(last.worst_case_profit)}.`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
              <text className="axis" x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                ₹{t}L
              </text>
            </g>
          ))}
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((r) => (
            <text key={r} className="axis" x={x(r)} y={H - 8} textAnchor="middle">
              {r}
            </text>
          ))}
          <text className="axis axis-title" x={W - M.right} y={H - 8} dx="10">
            risk
          </text>

          <line className="current" x1={x(here.risk_aversion)} x2={x(here.risk_aversion)} y1={M.top - 8} y2={H - M.bottom} />
          <text className="current-label" x={x(here.risk_aversion)} y={M.top - 12} textAnchor="middle">
            Your setting {here.risk_aversion}
          </text>

          <path className="series series-profit" d={path('expected_profit')} />
          <path className="series series-worst" d={path('worst_case_profit')} />
          {points.map((p) => (
            <g key={p.risk_aversion}>
              <circle className="dot dot-profit" cx={x(p.risk_aversion)} cy={y(lakh(p.expected_profit))} r={4} />
              <circle className="dot dot-worst" cx={x(p.risk_aversion)} cy={y(lakh(p.worst_case_profit))} r={4} />
            </g>
          ))}

          <text className="end-label" x={x(1) + 9} y={y(lakh(last.expected_profit))} dy="0.32em">
            {inr(last.expected_profit)}
          </text>
          <text className="end-label" x={x(1) + 9} y={y(lakh(last.worst_case_profit))} dy="0.32em">
            {inr(last.worst_case_profit)}
          </text>

          {shown && <line className="crosshair" x1={x(shown.risk_aversion)} x2={x(shown.risk_aversion)} y1={M.top} y2={H - M.bottom} />}
          <rect
            className="hit"
            x={M.left - 10}
            y={M.top}
            width={W - M.left - M.right + 20}
            height={H - M.top - M.bottom}
            onPointerMove={track}
            onPointerLeave={() => setHover(null)}
            onClick={() => hover !== null && onPick(points[hover].risk_aversion)}
          />
        </svg>
        {shown && (
          <div
            className="tip"
            style={{ left: `${(x(shown.risk_aversion) / W) * 100}%`, transform: `translateX(${shown.risk_aversion > 0.6 ? '-105%' : '5%'})` }}
          >
            <strong>Risk {shown.risk_aversion}</strong>
            <span>
              <i className="key key-profit" /> {inr(shown.expected_profit)} expected
            </span>
            <span>
              <i className="key key-worst" /> {inr(shown.worst_case_profit)} in a bad season
            </span>
            <span className="tip-muted">spends {inr(shown.spend)} · click to use</span>
          </div>
        )}
      </div>

      <details className="curve-table">
        <summary>Show as a table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Risk</th>
              <th scope="col">Expected profit</th>
              <th scope="col">Bad season</th>
              <th scope="col">Spend</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.risk_aversion} aria-current={p === here ? 'true' : undefined}>
                <td>{p.risk_aversion}</td>
                <td>{inr(p.expected_profit)}</td>
                <td>{inr(p.worst_case_profit)}</td>
                <td>{inr(p.spend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="curve-note">One simulated December, 200 demand scenarios per setting.</p>
    </div>
  )
}
