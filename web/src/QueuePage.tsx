import { Fragment, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { PassedOut, PlanOut, QueueItem, QueueOut } from './types'
import { SEASON_YEAR } from './cities'
import { capital, count, dayMonth, inr, percent, plural, sum, weekLabel } from './format'
import { DEMO_PLAN, type PlanScope } from './planScope'
import { NoPlans, PlanPicker } from './PlanPicker'
import { useLoad } from './useLoad'
import { Badge, DecisionBadge, InfoTip, Segmented } from './ui'

type Filter = 'all' | 'buy' | 'watch' | 'skip' | 'approval'
type PlanLine = PlanOut['lines'][number]

// Buy-by dates fall in August of the season's year; "today" is the API's own default
const DAYS = ['today', `${SEASON_YEAR}-08-01`, `${SEASON_YEAR}-08-15`, `${SEASON_YEAR}-09-01`]

const ACTION: Record<QueueItem['action'], { label: string; tone: 'accent' | 'warn' | 'neutral'; priority: string }> = {
  buy_now: { label: 'Buy now', tone: 'warn', priority: 'High priority' },
  scheduled: { label: 'Buy later', tone: 'accent', priority: 'Medium priority' },
  awaiting_approval: { label: 'Needs approval', tone: 'neutral', priority: 'Approve first' },
  watch: { label: 'Watch', tone: 'neutral', priority: 'Low priority' },
  skip: { label: 'Skip', tone: 'neutral', priority: 'No priority' },
}

// The planner's why-not rules, by the sentence each one writes (voyance/api/planner.py: _passed)
const WHY_NOT: { starts: string; label: string; explain: string }[] = [
  { starts: 'a room here would lose', label: 'Demand too thin', explain: 'Even one room here is expected to lose money: demand is too thin for its price.' },
  { starts: 'its city is at the cap', label: 'City cap reached', explain: 'The city already holds as much of the budget as its cap allows.' },
  { starts: 'its hotel is at the cap', label: 'Hotel cap reached', explain: 'This hotel already holds as much of the budget as its cap allows.' },
  { starts: 'worth less than one whole room', label: 'Less than a room', explain: 'The optimizer wanted only a fraction of a room here; a whole room is not worth it.' },
  { starts: 'the money earns more elsewhere', label: 'Budget earns more elsewhere', explain: 'The same money makes more in the rest of the plan: the budget is the limit.' },
  { starts: 'too risky', label: 'Too risky', explain: 'A room here would lower risk-adjusted profit at this risk setting.' },
]
const whyNot = (reason: string) => WHY_NOT.find((w) => reason.startsWith(w.starts)) ?? { label: 'Other', explain: '', starts: '' }

const LIMITED: Record<PlanLine['limited_by'], string> = {
  hotel: "The hotel's allotment: it offers no more rooms.",
  cap: 'An exposure cap: its city or hotel is at the cap.',
  budget: "The budget: the next room wouldn't earn the plan's hurdle rate.",
  demand: 'Demand: more rooms would likely go unsold.',
}

function loadDemo(day: string): Promise<QueueOut> {
  return import('./demo/queue-2cr.json').then((m) => (m.default as unknown as Record<string, QueueOut>)[day])
}

export function QueuePage({ api, plans, planId, onPlan }: PlanScope) {
  const [day, setDay] = useState(DAYS[0])
  const data = useLoad<{ queue: QueueOut; plan: PlanOut }>(`${api ? 'live' : 'demo'}|${planId}|${day}`, () => {
    if (planId === null) return null
    if (!api) return loadDemo(day).then((queue) => ({ queue, plan: DEMO_PLAN }))
    const asOf = day === 'today' ? undefined : day
    return Promise.all([api.queue(planId, asOf), api.plan(planId)]).then(([queue, plan]) => ({ queue, plan }))
  })

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1>Action queue</h1>
          <p>
            What to do about a saved plan on a given day: buys that are due, things to watch, and the hotel-weeks Voyance
            passed on, each with the optimizer's own reason.
          </p>
        </div>
        <PlanPicker plans={plans} planId={planId} onPlan={onPlan} />
      </header>
      {planId === null ? (
        <NoPlans what="what to buy, watch and skip" />
      ) : (
        <>
          <div className="toolbar">
            <span className="toolbar-label">Actions as of</span>
            <Segmented
              label="Actions as of"
              value={day}
              onChange={setDay}
              options={DAYS.map((d) => ({ value: d, label: d === 'today' ? 'Today' : dayMonth(d, true) }))}
            />
            <span className="fine">Buys within 14 days of their buy-by date are high priority.</span>
          </div>
          {data.status === 'loading' && <div className="panel loading">Building the queue…</div>}
          {data.status === 'error' && <div className="panel empty-state">{data.message}</div>}
          {data.status === 'ready' && <Queue key={day} queue={data.data.queue} plan={data.data.plan} />}
        </>
      )}
    </div>
  )
}

function Queue({ queue, plan }: { queue: QueueOut; plan: PlanOut }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<number | null>(null)
  const lines = new Map(plan.lines.map((l) => [l.id, l]))
  const passed = new Map(plan.passed.map((p) => [`${p.city}|${p.week}|${p.hotel}`, p]))
  const items = queue.items.map((item, index) => ({
    item,
    index,
    line: item.line_id != null ? lines.get(item.line_id) : undefined,
    passed: passed.get(`${item.city}|${item.week}|${item.hotel}`),
  }))
  // only approved lines are buys (the API's approval gate); the rest wait for an approver first
  const buys = items.filter(({ item }) => item.action === 'buy_now' || item.action === 'scheduled')
  const awaiting = items.filter(({ item }) => item.action === 'awaiting_approval')
  const purchases = [...buys, ...awaiting]
  const watch = items.filter(({ item }) => item.action === 'watch')
  const skips = items.filter(({ item }) => item.action === 'skip')
  const urgent = buys.filter(({ item }) => item.action === 'buy_now')
  const needed = sum(purchases.map(({ item, line }) => (item.rooms ?? 0) * (line?.unit_cost ?? 0)))

  const shown = items.filter(({ item }) => {
    if (filter === 'buy') return item.action === 'buy_now' || item.action === 'scheduled'
    if (filter === 'approval') return item.action === 'awaiting_approval'
    if (filter === 'all') return true
    return item.action === filter
  })

  return (
    <>
      <dl className="kpis panel">
        <div className="kpi">
          <dt>Actions to take</dt>
          <dd className="kpi-value">{purchases.length + watch.length}</dd>
          <dd className="kpi-sub">
            {plural(buys.length, 'approved buy')} · {awaiting.length} need approval · {watch.length} to watch
          </dd>
        </div>
        <div className="kpi">
          <dt>High priority</dt>
          <dd className="kpi-value">{urgent.length}</dd>
          <dd className="kpi-sub">
            {urgent.length ? `approved buys due within 14 days of ${dayMonth(queue.as_of, true)}` : 'no approved buy due within 14 days'}
          </dd>
        </div>
        <div className="kpi">
          <dt>Recommended purchases</dt>
          <dd className="kpi-value">{count(sum(purchases.map(({ item }) => item.rooms ?? 0)))} rooms</dd>
          <dd className="kpi-sub">
            {plural(purchases.length, 'line')} · {awaiting.length} awaiting approval
          </dd>
        </div>
        <div className="kpi">
          <dt>
            Budget needed
            <InfoTip label="budget needed">
              Rooms times their contract cost, for every buy in the queue, approved or waiting (rejected lines are left out).
            </InfoTip>
          </dt>
          <dd className="kpi-value">{inr(needed)}</dd>
          <dd className="kpi-sub">
            of {inr(plan.budget_inr)} · {plural(skips.length, 'skip')}
          </dd>
        </div>
      </dl>

      <div className="panel table-panel">
        <div className="panel-bar">
          <h2 className="panel-title">The queue, most urgent first</h2>
          <Segmented
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `All ${items.length}` },
              { value: 'buy', label: `Approved buys ${buys.length}` },
              { value: 'approval', label: `Needs approval ${awaiting.length}` },
              { value: 'watch', label: `Watch ${watch.length}` },
              { value: 'skip', label: `Skip ${skips.length}` },
            ]}
          />
        </div>
        <div className="list-scroll">
          <table className="table queue-table" aria-label="Action queue">
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Line</th>
                <th scope="col" className="num">
                  Rooms
                </th>
                <th scope="col" className="num hide-sm">
                  Cost
                </th>
                <th scope="col" className="num hide-md">
                  Expected profit
                </th>
                <th scope="col" className="num hide-md">
                  Bad-season profit
                  <InfoTip label="bad-season profit">This line's own average in its worst 5% of simulated seasons: its risk.</InfoTip>
                </th>
                <th scope="col" className="hide-sm">
                  Approval
                </th>
                <th scope="col" className="reason-col hide-sm">
                  Why
                </th>
                <th scope="col" className="chevron-col hide-sm">
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ item, index, line, passed: pass }) => {
                const expanded = open === index
                const meta = ACTION[item.action] ?? { label: capital(item.action.replace(/_/g, ' ')), tone: 'neutral', priority: 'No priority' }
                const id = `queue-item-${index}`
                return (
                  <Fragment key={index}>
                    <tr className="row-link" aria-current={expanded ? 'true' : undefined} onClick={() => setOpen(expanded ? null : index)}>
                      <td>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        <span className="cell-sub">{meta.priority}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="row-button"
                          aria-expanded={expanded}
                          aria-controls={id}
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpen(expanded ? null : index)
                          }}
                        >
                          <strong>{item.city}</strong> · {item.hotel}
                        </button>
                        <span className="cell-sub">
                          {weekLabel(item.week)}
                          {item.buy_by && ` · buy by ${dayMonth(item.buy_by)}`}
                        </span>
                      </td>
                      <td className="num">{pass ? '0' : item.rooms != null && item.action !== 'watch' ? count(item.rooms) : '—'}</td>
                      <td className="num hide-sm">
                        {pass ? (
                          <span className="muted">{inr(pass.unit_cost)} a room</span>
                        ) : item.rooms != null && line && item.action !== 'watch' ? (
                          inr(item.rooms * line.unit_cost)
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="num hide-md">
                        {pass ? (
                          <span className="muted">{inr(pass.earns_here)} a room</span>
                        ) : line && item.action !== 'watch' ? (
                          inr(line.expected_profit)
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="num hide-md">{line && item.action !== 'watch' ? inr(line.worst_case_profit) : '—'}</td>
                      <td className="hide-sm">{item.decision ? <DecisionBadge decision={item.decision} /> : <span className="muted">—</span>}</td>
                      <td className="reason-col hide-sm">{reasonLabel(item, pass)}</td>
                      <td className="chevron-col hide-sm">
                        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" className={expanded ? 'chevron-open' : undefined} />
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="detail-row" id={id}>
                        <td colSpan={9}>
                          <ItemDetail item={item} line={line} passed={pass} hurdle={plan.hurdle_rate} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty">
                    Nothing here on {dayMonth(queue.as_of, true)}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <WhyNotSummary plan={plan} />
    </>
  )
}

function reasonLabel(item: QueueItem, passed?: PassedOut) {
  if (passed) return <span className="reason-text">{whyNot(passed.reason).label}</span>
  return <span className="reason-text">{capital(item.reason)}</span>
}

function ItemDetail({ item, line, passed, hurdle }: { item: QueueItem; line?: PlanLine; passed?: PassedOut; hurdle: number }) {
  if (passed) {
    const rule = whyNot(passed.reason)
    return (
      <div className="line-detail">
        <h3>Why not? {rule.label}</h3>
        <p className="line-note">
          {capital(passed.reason)}.{item.action === 'watch' && ' It is a close call, so it stays on the watch list.'}
        </p>
        <dl className="detail-grid">
          <div>
            <dt>Expected demand</dt>
            <dd>{count(passed.expected_demand)} room-nights</dd>
          </div>
          <div>
            <dt>Cost / price a room</dt>
            <dd>
              {inr(passed.unit_cost)} / {inr(passed.unit_price)}
            </dd>
          </div>
          <div>
            <dt>One room here makes</dt>
            <dd>{inr(passed.earns_here)}</dd>
          </div>
          <div>
            <dt>Same money elsewhere makes</dt>
            <dd>{inr(passed.earns_elsewhere)}</dd>
          </div>
          <div>
            <dt>
              Forcing one room in
              <InfoTip label="forcing one room in">
                About what the plan would lose, risk-adjusted, if one whole room here were bought anyway.
              </InfoTip>
            </dt>
            <dd>−{inr(passed.forced_room_cost)}</dd>
          </div>
        </dl>
        {rule.explain && <p className="fine">{rule.explain}</p>}
      </div>
    )
  }
  return (
    <div className="line-detail">
      <h3>
        {item.action === 'watch'
          ? 'Why watch it'
          : item.action === 'skip'
            ? 'Why skip it'
            : item.action === 'awaiting_approval'
              ? 'Why buy it, once approved'
              : 'Why buy it'}
      </h3>
      <p className="line-note">{capital(item.reason)}.</p>
      {line && (
        <dl className="detail-grid">
          <div>
            <dt>The planner's reason</dt>
            <dd>{capital(line.reason)}</dd>
          </div>
          <div>
            <dt>Why not more rooms?</dt>
            <dd>
              {line.why.why_not_more ? (
                capital(line.why.why_not_more)
              ) : (
                <>
                  {LIMITED[line.limited_by]}
                  {line.limited_by === 'budget' && hurdle > 0 && ` Every rupee must earn ${percent(hurdle)} risk-adjusted.`}
                  {line.limited_by === 'hotel' && line.extra_room_value > 0 && ` One more room would add about ${inr(line.extra_room_value)}.`}
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>Expected sell-through</dt>
            <dd>
              {Math.round(line.expected_sold)} of {line.rooms} ({percent(line.sell_through)})
            </dd>
          </div>
          <div>
            <dt>Expected / bad-season profit</dt>
            <dd>
              {inr(line.expected_profit)} / {inr(line.worst_case_profit)}
            </dd>
          </div>
        </dl>
      )}
    </div>
  )
}

function WhyNotSummary({ plan }: { plan: PlanOut }) {
  const limits = (['demand', 'budget', 'cap', 'hotel'] as const)
    .map((kind) => ({ kind, n: plan.lines.filter((l) => l.limited_by === kind).length }))
    .filter((x) => x.n > 0)
  const groups = WHY_NOT.map((rule) => ({ rule, passed: plan.passed.filter((p) => whyNot(p.reason) === rule) })).filter(
    (g) => g.passed.length > 0,
  )
  return (
    <section className="panel why-panel" aria-labelledby="why-not-title">
      <h2 className="panel-title" id="why-not-title">
        Why not? What held this plan back
      </h2>
      <div className="why-grid">
        <div>
          <h3>Hotel-weeks passed over</h3>
          {groups.length === 0 ? (
            <p className="fine">
              None: at {inr(plan.budget_inr)} the plan buys every hotel-week it can. Smaller budgets and tighter caps make
              the optimizer choose.
            </p>
          ) : (
            <ul className="why-list">
              {groups.map(({ rule, passed }) => (
                <li key={rule.label}>
                  <span>
                    <strong>{rule.label}</strong>
                    <span className="muted"> · {plural(passed.length, 'hotel-week')}</span>
                  </span>
                  <span className="fine">{rule.explain}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>What stopped each bought line buying more</h3>
          <ul className="why-list">
            {limits.map(({ kind, n }) => (
              <li key={kind}>
                <strong>{plural(n, 'line')}</strong>
                <span className="fine">{LIMITED[kind]}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
