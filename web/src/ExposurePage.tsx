import { Fragment, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { ExposureOut, PlanOut } from './types'
import { count, inr, percent, plural, sum, weekLabel } from './format'
import { usePlanDetail, type PlanScope } from './planScope'
import { NoPlans, PlanPicker } from './PlanPicker'
import { go } from './route'
import { Badge, InfoTip } from './ui'

type CapStatus = 'none' | 'below' | 'at' | 'over'

// at_cap is the optimizer's own reading (the cap binds in its plan); whole rooms can round a little below it
function capStatus(e: ExposureOut): CapStatus {
  if (e.cap == null) return 'none'
  if (e.share_of_budget > e.cap + 1e-6) return 'over'
  return e.at_cap ? 'at' : 'below'
}
const STATUS: Record<CapStatus, { label: string; tone: 'neutral' | 'success' | 'warn' | 'danger' }> = {
  none: { label: 'No cap', tone: 'neutral' },
  below: { label: 'Within cap', tone: 'success' },
  at: { label: 'At cap', tone: 'warn' },
  over: { label: 'Over cap', tone: 'danger' },
}

export function ExposurePage({ api, plans, planId, onPlan }: PlanScope) {
  const plan = usePlanDetail(api, planId)
  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1>Exposure caps</h1>
          <p>
            How much of the budget each city and hotel holds, against the caps the plan was made with. The optimizer keeps
            to the caps; this page shows the headroom left and what the caps cost.
          </p>
        </div>
        <PlanPicker plans={plans} planId={planId} onPlan={onPlan} />
      </header>
      {planId === null ? (
        <NoPlans what="where its money sits" />
      ) : plan.status === 'loading' ? (
        <div className="panel loading">Loading the plan…</div>
      ) : plan.status === 'error' ? (
        <div className="panel empty-state">{plan.message}</div>
      ) : (
        <Exposure key={plan.data.id} plan={plan.data} />
      )}
    </div>
  )
}

function Exposure({ plan }: { plan: PlanOut }) {
  const cities = plan.exposure.filter((e) => e.kind === 'city').sort((a, b) => b.spend - a.spend)
  const hotels = plan.exposure.filter((e) => e.kind === 'hotel').sort((a, b) => b.spend - a.spend)
  const capped = plan.max_city_share != null || plan.max_hotel_share != null
  const atCap = plan.exposure.filter((e) => capStatus(e) === 'at')
  const byCap = plan.lines.filter((l) => l.limited_by === 'cap')
  const passedByCap = plan.passed.filter((p) => p.reason.includes('at the cap'))
  const used = plan.spend / plan.budget_inr

  return (
    <>
      {!capped && (
        <div className="callout" role="note">
          <p>
            <strong>Plan #{plan.id} was made without exposure caps</strong>, so nothing below is capped. Set a city or hotel
            cap in the Buy Desk's plan settings and the optimizer keeps to it.
          </p>
          <button type="button" className="btn btn-secondary" onClick={() => go('desk')}>
            Set caps on the Buy Desk
          </button>
        </div>
      )}

      <dl className="kpis panel">
        <div className="kpi">
          <dt>Budget used</dt>
          <dd className="kpi-value">{percent(used)}</dd>
          <dd className="kpi-sub">
            {inr(plan.spend)} of {inr(plan.budget_inr)} · {inr(plan.budget_inr - plan.spend)} headroom
          </dd>
          <dd className="kpi-meter">
            <Meter share={used} cap={1} />
          </dd>
        </div>
        <CapKpi label="City cap" cap={plan.max_city_share} rows={cities} />
        <CapKpi label="Hotel cap" cap={plan.max_hotel_share} rows={hotels} />
        <div className="kpi">
          <dt>
            What the caps cost
            <InfoTip label="what the caps cost">
              Risk-adjusted profit the plan gives up to stay within its caps, from re-solving without them.
            </InfoTip>
          </dt>
          <dd className="kpi-value">{capped ? inr(plan.caps_cost) : '—'}</dd>
          <dd className="kpi-sub">
            {capped ? 'risk-adjusted profit given up' : 'no caps set'} · bad-season profit {inr(plan.worst_case_profit)}
          </dd>
        </div>
      </dl>

      {capped && (
        <p className="takeaway">
          {atCap.length === 0 ? (
            <>No cap binds: the plan would look the same without them.</>
          ) : (
            <>
              <strong>{plural(atCap.length, 'cap')} at the limit</strong> ({atCap.map((e) => e.name).join(', ')}).{' '}
              {byCap.length > 0 && <>They hold back {plural(byCap.length, 'bought line')}</>}
              {byCap.length > 0 && passedByCap.length > 0 && ' and '}
              {passedByCap.length > 0 && <>keep out {plural(passedByCap.length, 'hotel-week')}</>}
              {(byCap.length > 0 || passedByCap.length > 0) && '. '}
              Raising a cap would let the optimizer buy more there.
            </>
          )}
        </p>
      )}

      <ExposureTable title="By city" kind="city" rows={cities} plan={plan} />
      <ExposureTable title="By hotel (supplier)" kind="hotel" rows={hotels} plan={plan} />

      <section className="panel why-panel" aria-labelledby="holding-title">
        <h2 className="panel-title" id="holding-title">
          What's preventing more purchases
        </h2>
        <ul className="why-list">
          {(['cap', 'budget', 'hotel', 'demand'] as const).map((kind) => {
            const n = plan.lines.filter((l) => l.limited_by === kind).length
            if (n === 0) return null
            return (
              <li key={kind}>
                <span>
                  <strong>{plural(n, 'line')}</strong> <span className="muted">limited by {LIMIT_NAME[kind]}</span>
                </span>
                <span className="fine">{LIMIT_WHY[kind](plan)}</span>
              </li>
            )
          })}
          {passedByCap.length > 0 && (
            <li>
              <span>
                <strong>{plural(passedByCap.length, 'hotel-week')}</strong> <span className="muted">not bought because of a cap</span>
              </span>
              <span className="fine">
                {passedByCap.map((p) => `${p.city} · ${p.hotel} ${weekLabel(p.week)}`).join('; ')}
              </span>
            </li>
          )}
        </ul>
      </section>
    </>
  )
}

const LIMIT_NAME = { cap: 'an exposure cap', budget: 'the budget', hotel: "the hotel's allotment", demand: 'demand' }
const LIMIT_WHY: Record<keyof typeof LIMIT_NAME, (plan: PlanOut) => string> = {
  cap: () => 'Its city or hotel is at the cap: more here would break it.',
  budget: (plan) => `The money is better spent elsewhere: every rupee must earn ${percent(plan.hurdle_rate)} risk-adjusted.`,
  hotel: () => 'The hotel offers no more rooms. Asking for more is on the Action queue.',
  demand: () => 'More rooms would likely go unsold. Not an exposure limit.',
}

function CapKpi({ label, cap, rows }: { label: string; cap: number | null | undefined; rows: ExposureOut[] }) {
  const top = rows[0]
  const atCap = rows.filter((r) => capStatus(r) === 'at').length
  return (
    <div className="kpi">
      <dt>{label}</dt>
      <dd className="kpi-value">{cap != null ? percent(cap) : 'None'}</dd>
      <dd className="kpi-sub">
        {top ? `largest: ${top.name} ${percent(top.share_of_budget)}` : 'nothing bought'}
        {cap != null && ` · ${atCap} at cap`}
      </dd>
      {cap != null && top && (
        <dd className="kpi-meter">
          <Meter share={top.share_of_budget} cap={cap} />
        </dd>
      )}
    </div>
  )
}

// A share of the budget, with the cap marked; the scale runs a little past the cap so "at cap" reads clearly
function Meter({ share, cap }: { share: number; cap: number | null }) {
  const max = Math.max(cap ?? 0, share) * 1.15 || 1
  return (
    <span className="meter" aria-hidden="true">
      <span className="meter-fill" style={{ width: `${Math.min(100, (share / max) * 100)}%` }} />
      {cap != null && <span className="meter-cap" style={{ left: `${(cap / max) * 100}%` }} />}
    </span>
  )
}

function ExposureTable({ title, kind, rows, plan }: { title: string; kind: 'city' | 'hotel'; rows: ExposureOut[]; plan: PlanOut }) {
  const [open, setOpen] = useState<string | null>(null)
  const most = Math.max(...rows.map((r) => Math.max(r.share_of_budget, r.cap ?? 0)), 0.01)
  const linesOf = (name: string) =>
    plan.lines.filter((l) => (kind === 'city' ? l.city === name : `${l.city} · ${l.hotel}` === name))

  return (
    <div className="panel table-panel">
      <div className="panel-bar">
        <h2 className="panel-title">{title}</h2>
        <span className="fine">{rows.length} {kind === 'city' ? 'cities' : 'hotels'}</span>
      </div>
      <table className="table" aria-label={`Exposure ${title.toLowerCase()}`}>
        <thead>
          <tr>
            <th scope="col">{kind === 'city' ? 'City' : 'Hotel'}</th>
            <th scope="col" className="num">
              Spend
            </th>
            <th scope="col" className="bar-col hide-sm">
              Share of budget
            </th>
            <th scope="col" className="num hide-sm">
              Cap
            </th>
            <th scope="col" className="num hide-md">
              Headroom
            </th>
            <th scope="col" className="num hide-md">
              Used
            </th>
            <th scope="col">Status</th>
            <th scope="col" className="chevron-col hide-sm">
              <span className="sr-only">Lines</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const status = capStatus(r)
            const expanded = open === r.name
            const id = `exposure-${kind}-${r.name.replace(/[^a-z0-9]/gi, '-')}`
            return (
              <Fragment key={r.name}>
                <tr className="row-link" aria-current={expanded ? 'true' : undefined} onClick={() => setOpen(expanded ? null : r.name)}>
                  <td>
                    <button
                      type="button"
                      className="row-button"
                      aria-expanded={expanded}
                      aria-controls={id}
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpen(expanded ? null : r.name)
                      }}
                    >
                      <strong>{r.name}</strong>
                    </button>
                  </td>
                  <td className="num">{inr(r.spend)}</td>
                  <td className="bar-col hide-sm">
                    <span className="meter meter-row" aria-hidden="true">
                      <span className="meter-fill" style={{ width: `${(r.share_of_budget / most) * 100}%` }} />
                      {r.cap != null && <span className="meter-cap" style={{ left: `${(r.cap / most) * 100}%` }} />}
                    </span>
                    <span className="num-inline">{percent(r.share_of_budget)}</span>
                  </td>
                  <td className="num hide-sm">{r.cap != null ? percent(r.cap) : '—'}</td>
                  <td className="num hide-md">{r.cap != null ? inr(Math.max(0, r.cap * plan.budget_inr - r.spend)) : '—'}</td>
                  <td className="num hide-md">{r.cap != null ? percent(r.share_of_budget / r.cap) : '—'}</td>
                  <td>
                    <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
                  </td>
                  <td className="chevron-col hide-sm">
                    <ChevronRight size={16} strokeWidth={2} aria-hidden="true" className={expanded ? 'chevron-open' : undefined} />
                  </td>
                </tr>
                {expanded && (
                  <tr className="detail-row" id={id}>
                    <td colSpan={8}>
                      <LinesIn lines={linesOf(r.name)} total={r.spend} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const LIMIT_SHORT = { cap: 'cap', budget: 'budget', hotel: 'hotel allotment', demand: 'demand' }

function LinesIn({ lines, total }: { lines: PlanOut['lines']; total: number }) {
  return (
    <div className="line-detail">
      <h3>What makes up this exposure</h3>
      <table className="mini-table contrib-table">
        <thead>
          <tr>
            <th scope="col">Line</th>
            <th scope="col">Rooms</th>
            <th scope="col">Spend</th>
            <th scope="col" className="hide-sm">
              Share
            </th>
            <th scope="col" className="hide-sm">
              Limited by
            </th>
          </tr>
        </thead>
        <tbody>
          {[...lines]
            .sort((a, b) => b.rooms * b.unit_cost - a.rooms * a.unit_cost)
            .map((l) => (
              <tr key={l.id}>
                <th scope="row">
                  {l.city} · {l.hotel} {weekLabel(l.week)}
                </th>
                <td>{count(l.rooms)}</td>
                <td>{inr(l.rooms * l.unit_cost)}</td>
                <td className="hide-sm">{total ? percent((l.rooms * l.unit_cost) / total) : '—'}</td>
                <td className="hide-sm">{LIMIT_SHORT[l.limited_by]}</td>
              </tr>
            ))}
        </tbody>
      </table>
      <p className="fine">
        {plural(lines.length, 'line')} · {inr(sum(lines.map((l) => l.rooms * l.unit_cost)))} in all
      </p>
    </div>
  )
}
