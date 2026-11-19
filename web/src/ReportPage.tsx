import { useState } from 'react'
import type { PlanOut, Position, PositionLine } from './types'
import demoPosition from './demo/position-2cr.json'
import { SEASON_YEAR } from './cities'
import { capital, count, dayMonth, inr, percent, plural, sum, weekLabel } from './format'
import { usePlanDetail, type PlanScope } from './planScope'
import { NoPlans, PlanPicker } from './PlanPicker'
import { useLoad } from './useLoad'
import { Badge, DecisionBadge, InfoTip, Segmented } from './ui'

type Tab = 'brief' | 'diff' | 'postmortem'
type Line = PlanOut['lines'][number]

const spendOf = (l: Line) => l.rooms * l.unit_cost

export function ReportPage({ api, plans, planId, onPlan }: PlanScope) {
  const plan = usePlanDetail(api, planId)
  const [tab, setTab] = useState<Tab>('brief')

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1>Plan report</h1>
          <p>A buyer brief with every number traceable, what approval changed, and how the decisions are playing out.</p>
        </div>
        <PlanPicker plans={plans} planId={planId} onPlan={onPlan} />
      </header>

      {planId === null ? (
        <NoPlans what="its brief, approval diff and decision review" />
      ) : plan.status === 'loading' ? (
        <div className="panel loading">Loading the plan…</div>
      ) : plan.status === 'error' ? (
        <div className="panel empty-state">{plan.message}</div>
      ) : (
        <>
          <div className="toolbar">
            <Segmented
              label="Report"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'brief', label: 'Buyer brief' },
                { value: 'diff', label: 'Approval diff' },
                { value: 'postmortem', label: 'Decision review' },
              ]}
            />
          </div>
          {tab === 'brief' && <Brief plan={plan.data} />}
          {tab === 'diff' && <ApprovalDiff plan={plan.data} />}
          {tab === 'postmortem' && <PostMortem api={api} planId={plan.data.id} plan={plan.data} />}
        </>
      )}
    </div>
  )
}

// ---------- the buyer brief: prose whose every figure links to its source ----------

type Source = { id: string; label: string; value: string; from: string }

function Brief({ plan }: { plan: PlanOut }) {
  const [active, setActive] = useState<string | null>(null)
  const totalRooms = sum(plan.lines.map((l) => l.rooms))
  const top = [...plan.lines].sort((a, b) => b.expected_profit - a.expected_profit).slice(0, 5)
  const passed = (plan.passed ?? []).slice(0, 3)

  const focus = (id: string) => {
    setActive(id)
    document.getElementById(`src-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  // a clickable figure that jumps to its row in the sources table
  const num = (id: string, text: string) => (
    <button type="button" className="src-num" aria-describedby={`src-${id}`} onClick={() => focus(id)}>
      {text}
    </button>
  )

  const sources: Source[] = [
    { id: 'budget', label: 'Budget', value: inr(plan.budget_inr), from: 'The ceiling set for this plan.' },
    { id: 'spend', label: 'Spend', value: inr(plan.spend), from: 'Rooms × contract cost, summed across every line.' },
    { id: 'profit', label: 'Expected profit', value: inr(plan.expected_profit), from: 'Whole-plan average over 200 simulated Decembers.' },
    { id: 'worst', label: 'Bad-season profit', value: inr(plan.worst_case_profit), from: "The plan's average in its worst 5% of those seasons." },
    { id: 'rooms', label: 'Rooms', value: count(totalRooms), from: 'Rooms bought, summed across every line.' },
    { id: 'lines', label: 'Hotel-weeks', value: String(plan.lines.length), from: 'Lines the optimizer put in the plan.' },
    ...(plan.hurdle_rate > 0
      ? [{ id: 'hurdle', label: 'Hurdle rate', value: percent(plan.hurdle_rate), from: 'The risk-adjusted return every rupee must beat to get in.' }]
      : []),
    ...top.map((l) => ({
      id: `line-${l.id}`,
      label: `${l.city} · ${l.hotel} ${weekLabel(l.week)}`,
      value: `${l.rooms} rooms · ${inr(l.expected_profit)} profit`,
      from: capital(l.reason),
    })),
    ...passed.map((p, i) => ({
      id: `passed-${i}`,
      label: `Passed · ${p.city} · ${p.hotel} ${weekLabel(p.week)}`,
      value: 'bought none',
      from: capital(p.reason),
    })),
  ]

  return (
    <div className="brief-grid">
      <article className="panel brief">
        <div className="brief-head">
          <h2 className="panel-title">Buyer brief</h2>
          <Badge tone="success">Every figure traces to a source</Badge>
        </div>
        <p>
          Plan #{plan.id} runs a {num('budget', inr(plan.budget_inr))} budget at {plan.risk_aversion} risk. It commits{' '}
          {num('spend', inr(plan.spend))} of it across {num('lines', `${plan.lines.length} hotel-weeks`)} (
          {num('rooms', `${count(totalRooms)} rooms`)}), for {num('profit', inr(plan.expected_profit))} expected profit and{' '}
          {num('worst', inr(plan.worst_case_profit))} in a bad season.
          {plan.hurdle_rate > 0 && <> Every rupee has to earn {num('hurdle', percent(plan.hurdle_rate))} to make the cut.</>}
        </p>
        <h3>Where the profit comes from</h3>
        <ul className="brief-lines">
          {top.map((l) => (
            <li key={l.id}>
              <span className="brief-line-where">
                <strong>{l.city}</strong> · {l.hotel} <span className="muted">{weekLabel(l.week)}</span>
              </span>
              <span className="brief-line-nums">
                {num(`line-${l.id}`, `${l.rooms} rooms`)} · {num(`line-${l.id}`, inr(l.expected_profit))}
              </span>
            </li>
          ))}
        </ul>
        {passed.length > 0 && (
          <>
            <h3>What it stayed out of</h3>
            <ul className="brief-lines">
              {passed.map((p, i) => (
                <li key={`${p.city}|${p.week}|${p.hotel}`}>
                  <span className="brief-line-where">
                    <strong>{p.city}</strong> · {p.hotel} <span className="muted">{weekLabel(p.week)}</span>
                  </span>
                  <span className="brief-line-nums">{num(`passed-${i}`, 'why not?')}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="fine">
          Composed from the saved plan's own numbers — no language model. Click any figure to see exactly where it comes
          from.
        </p>
      </article>

      <aside className="panel brief-sources" aria-label="Sources">
        <h2 className="panel-title">Sources</h2>
        <dl>
          {sources.map((s) => (
            <div key={s.id} id={`src-${s.id}`} className={`src-row${active === s.id ? ' src-active' : ''}`}>
              <dt>
                {s.label}
                <span className="src-value">{s.value}</span>
              </dt>
              <dd>{s.from}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  )
}

// ---------- approval diff: what the buyer proposed vs what approval left ----------

type Totals = { rooms: number; spend: number; profit: number; worst: number }
const total = (lines: Line[]): Totals => ({
  rooms: sum(lines.map((l) => l.rooms)),
  spend: sum(lines.map(spendOf)),
  profit: sum(lines.map((l) => l.expected_profit)),
  worst: sum(lines.map((l) => l.worst_case_profit)),
})

function ApprovalDiff({ plan }: { plan: PlanOut }) {
  const approved = plan.lines.filter((l) => l.decision === 'approved')
  const rejected = plan.lines.filter((l) => l.decision === 'rejected')
  const pending = plan.lines.filter((l) => l.decision === 'pending')
  const proposed = total(plan.lines)
  const committed = total(approved)
  const decided = approved.length + rejected.length

  const rows: { label: string; proposed: number; committed: number; format: (n: number) => string; better: 'up' | 'down' }[] = [
    { label: 'Rooms', proposed: proposed.rooms, committed: committed.rooms, format: count, better: 'up' },
    { label: 'Spend', proposed: proposed.spend, committed: committed.spend, format: inr, better: 'up' },
    { label: 'Expected profit', proposed: proposed.profit, committed: committed.profit, format: inr, better: 'up' },
    { label: 'Bad-season profit', proposed: proposed.worst, committed: committed.worst, format: inr, better: 'up' },
  ]

  return (
    <>
      <p className="takeaway">
        The buyer proposed <strong>{plural(plan.lines.length, 'line')}</strong>.{' '}
        {decided === 0 ? (
          <>No line has been decided yet — nothing is committed.</>
        ) : (
          <>
            Approvers approved <strong>{approved.length}</strong>
            {rejected.length > 0 && (
              <>
                {' '}
                and rejected <strong>{rejected.length}</strong>, removing{' '}
                <strong>{inr(proposed.profit - committed.profit)}</strong> of proposed profit
              </>
            )}
            {pending.length > 0 && <>; {plural(pending.length, 'line')} still waiting</>}.
          </>
        )}
      </p>

      <div className="panel diff-totals">
        <table className="table" aria-label="Proposed against approved">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col" className="num">
                Proposed
                <InfoTip label="proposed">Every line the buyer saved, before approval.</InfoTip>
              </th>
              <th scope="col" className="num">
                Approved
                <InfoTip label="approved">Only the lines approvers signed off: the committed buy.</InfoTip>
              </th>
              <th scope="col" className="num">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const delta = r.committed - r.proposed
              return (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  <td className="num">{r.format(r.proposed)}</td>
                  <td className="num strong">{r.format(r.committed)}</td>
                  <td className={`num ${delta < 0 ? 'neg' : delta > 0 ? 'pos' : 'muted'}`}>
                    {delta === 0 ? 'same' : `${delta > 0 ? '+' : '−'}${r.format(Math.abs(delta))}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <DiffGroup title="Approved" tone="success" lines={approved} note="Committed — these go to the supplier." />
      {rejected.length > 0 && (
        <DiffGroup title="Rejected" tone="danger" lines={rejected} note="Dropped by approvers — their profit is not in the committed plan." struck />
      )}
      {pending.length > 0 && (
        <DiffGroup title="Waiting for approval" tone="neutral" lines={pending} note="Not committed until an approver decides." />
      )}
    </>
  )
}

function DiffGroup({ title, tone, lines, note, struck }: { title: string; tone: 'success' | 'danger' | 'neutral'; lines: Line[]; note: string; struck?: boolean }) {
  return (
    <div className="panel table-panel">
      <div className="panel-bar">
        <h2 className="panel-title">
          <Badge tone={tone}>{title}</Badge> {plural(lines.length, 'line')}
        </h2>
        <span className="fine">{note}</span>
      </div>
      <table className="table" aria-label={title}>
        <thead>
          <tr>
            <th scope="col">Line</th>
            <th scope="col" className="num">
              Rooms
            </th>
            <th scope="col" className="num hide-sm">
              Spend
            </th>
            <th scope="col" className="num">
              Expected profit
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className={struck ? 'row-struck' : undefined}>
              <td>
                <strong>{l.city}</strong> · {l.hotel}
                <span className="cell-sub">{weekLabel(l.week)}</span>
              </td>
              <td className="num">{count(l.rooms)}</td>
              <td className="num hide-sm">{inr(spendOf(l))}</td>
              <td className="num strong">{inr(l.expected_profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------- decision review: approvals against how the season is booking ----------

const CHECK = `${SEASON_YEAR}-11-01`
type Pos = PositionLine & { note?: string }

function PostMortem({ api, planId, plan }: { api: PlanScope['api']; planId: number; plan: PlanOut }) {
  const pos = useLoad<Position>(`${api ? 'live' : 'demo'}|${planId}`, () =>
    api ? api.position(planId, CHECK) : Promise.resolve((demoPosition as unknown as Record<string, Position>)[CHECK]),
  )
  if (pos.status === 'loading') return <div className="panel loading">Reading this season's bookings…</div>
  if (pos.status === 'error') return <div className="panel empty-state">{pos.message}</div>

  const byLine = new Map<number, Pos>(pos.data.lines.filter((l) => l.line_id != null).map((l) => [l.line_id as number, l]))
  const approved = plan.lines.filter((l) => l.decision === 'approved')
  const rejected = plan.lines.filter((l) => l.decision === 'rejected')
  const joined = approved.map((l) => ({ line: l, pos: byLine.get(l.id) }))
  const ahead = joined.filter((j) => j.pos?.status === 'short').length
  const behind = joined.filter((j) => j.pos?.status === 'over').length
  const givenUp = sum(rejected.map((l) => l.expected_profit))

  return (
    <>
      <p className="takeaway">
        As of {dayMonth(CHECK, true)}, of <strong>{plural(approved.length, 'approved line')}</strong>:{' '}
        <strong>{ahead}</strong> booking ahead of forecast, <strong>{behind}</strong> behind.
        {rejected.length > 0 && (
          <>
            {' '}
            The {plural(rejected.length, 'rejected line')} gave up <strong>{inr(givenUp)}</strong> of planned profit (position
            isn't tracked for rejected lines).
          </>
        )}
      </p>

      {approved.length === 0 ? (
        <div className="panel empty-state">
          <h2>No approved lines yet</h2>
          <p>Approve some lines in the Buy Desk's Review mode, then come back to see how the calls are playing out.</p>
        </div>
      ) : (
        <div className="panel table-panel">
          <div className="panel-bar">
            <h2 className="panel-title">Approved lines, against the season so far</h2>
            <span className="fine">Booking pace from the Position monitor on {dayMonth(CHECK)}.</span>
          </div>
          <table className="table" aria-label="Approved lines against bookings">
            <thead>
              <tr>
                <th scope="col">Line</th>
                <th scope="col" className="num hide-sm">
                  Rooms
                </th>
                <th scope="col">Pace</th>
                <th scope="col">The call</th>
              </tr>
            </thead>
            <tbody>
              {joined.map(({ line, pos: p }) => (
                <tr key={line.id}>
                  <td>
                    <strong>{line.city}</strong> · {line.hotel}
                    <span className="cell-sub">{weekLabel(line.week)}</span>
                  </td>
                  <td className="num hide-sm">{count(line.rooms)}</td>
                  <td>{p ? <Pace status={p.status} pace={p.pace} /> : <span className="muted">—</span>}</td>
                  <td className="reason-col">{p ? <span className="reason-text">{verdict(p)}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rejected.length > 0 && (
        <div className="panel table-panel">
          <div className="panel-bar">
            <h2 className="panel-title">
              <Badge tone="danger">Rejected</Badge> {plural(rejected.length, 'line')}
            </h2>
            <span className="fine">Not tracked after rejection — shown with the profit they were planned to make.</span>
          </div>
          <table className="table" aria-label="Rejected lines">
            <thead>
              <tr>
                <th scope="col">Line</th>
                <th scope="col" className="num hide-sm">
                  Rooms
                </th>
                <th scope="col" className="num">
                  Planned profit
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rejected.map((l) => (
                <tr key={l.id}>
                  <td>
                    <strong>{l.city}</strong> · {l.hotel}
                    <span className="cell-sub">{weekLabel(l.week)}</span>
                  </td>
                  <td className="num hide-sm">{count(l.rooms)}</td>
                  <td className="num">{inr(l.expected_profit)}</td>
                  <td>
                    <DecisionBadge decision="rejected" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function Pace({ status, pace }: { status: Pos['status']; pace: number }) {
  if (status === 'started') return <Badge tone="neutral">Week started</Badge>
  if (status === 'on_pace') return <Badge tone="success">On pace</Badge>
  const off = Math.round(Math.abs(pace - 1) * 100)
  const ahead = status === 'short'
  return <Badge tone={ahead ? 'warn' : 'danger'}>{off}% {ahead ? 'ahead' : 'behind'}</Badge>
}

function verdict(p: Pos): string {
  switch (p.status) {
    case 'short':
      return 'Demand is confirming the buy — it may be worth asking the hotel for more rooms.'
    case 'over':
      return 'Booking slower than forecast — watch for rooms that may go unsold.'
    case 'started':
      return 'The week has begun; these are final bookings.'
    default:
      return 'Booking close to forecast — the call looks right.'
  }
}
