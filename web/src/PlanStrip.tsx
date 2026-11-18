import { useState, type CSSProperties } from 'react'
import { Play } from 'lucide-react'
import type { Plan, PlanLine } from './types'
import { inr } from './format'

interface Props {
  plan: Plan
  lines: PlanLine[]
}

const BUDGET = { min: 2e6, max: 5e7, step: 1e6 }

function riskWord(value: number): string {
  if (value === 0) return 'Max profit'
  if (value < 0.2) return 'Bold'
  if (value < 0.5) return 'Balanced'
  if (value < 0.8) return 'Careful'
  return 'Protect worst case'
}

export function PlanStrip({ plan, lines }: Props) {
  const [budget, setBudget] = useState(plan.budget_inr)
  const [risk, setRisk] = useState(plan.risk_aversion)
  const changed = budget !== plan.budget_inr || risk !== plan.risk_aversion

  const used = plan.spend / plan.budget_inr
  const tally = { approved: 0, rejected: 0, pending: 0 }
  lines.forEach((line) => tally[line.decision]++)
  const created = new Date(plan.created_at)
  const when = created.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
  })

  return (
    <section className="plan" aria-label="Plan settings and totals">
      <div className="plan-head">
        <div className="plan-title">
          <h1>
            December buy plan <span className="plan-id">#{plan.id}</span>
          </h1>
          <p className="plan-meta">
            Created by <strong>Asha</strong> · {when} · all 5 cities
            <span className="sim-tag">Simulated data · one simulated December</span>
          </p>
        </div>

        <div className="controls">
          <label className="control">
            <span className="control-label">
              Budget <output>{inr(budget)}</output>
            </span>
            <input
              type="range"
              min={BUDGET.min}
              max={BUDGET.max}
              step={BUDGET.step}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              style={{ '--fill': `${((budget - BUDGET.min) / (BUDGET.max - BUDGET.min)) * 100}%` } as CSSProperties}
            />
            <span className="control-ends">
              <span>₹20L</span>
              <span>₹5 cr</span>
            </span>
          </label>
          <label className="control">
            <span className="control-label">
              Risk <output>{risk.toFixed(2).replace(/0$/, '')} · {riskWord(risk)}</output>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={risk}
              onChange={(e) => setRisk(Number(e.target.value))}
              style={{ '--fill': `${risk * 100}%` } as CSSProperties}
            />
            <span className="control-ends">
              <span>Max profit</span>
              <span>Protect worst case</span>
            </span>
          </label>
          <button className="btn btn-secondary" type="button" disabled={!changed}>
            <Play size={14} strokeWidth={2.25} aria-hidden="true" />
            Run what-if
          </button>
        </div>
      </div>

      <dl className="figures">
        <div className="figure figure-spend">
          <dt>Spend</dt>
          <dd>
            <span className="figure-value">{inr(plan.spend)}</span>
            <span className="figure-of">
              of {inr(plan.budget_inr)} · {inr(plan.budget_inr - plan.spend)} held back
            </span>
          </dd>
          <div className="budget-bar" aria-hidden="true">
            <span style={{ width: `${used * 100}%` }} />
          </div>
        </div>
        <div className="figure">
          <dt>Expected profit</dt>
          <dd>
            <span className="figure-value">{inr(plan.expected_profit)}</span>
            <span className="figure-of">average of 200 scenarios</span>
          </dd>
        </div>
        <div className="figure">
          <dt>Worst 5% of seasons</dt>
          <dd>
            <span className="figure-value">{inr(plan.worst_case_profit)}</span>
            <span className="figure-of">still profit at risk {plan.risk_aversion}</span>
          </dd>
        </div>
        <div className="figure figure-approvals">
          <dt>Approvals</dt>
          <dd>
            <span className="figure-value">{tally.approved}</span>
            <span className="figure-of">
              of {lines.length} · {tally.rejected} rejected · {tally.pending} waiting for you
            </span>
          </dd>
          <div className="ticks" aria-hidden="true">
            {lines.map((line) => (
              <span key={line.id} className={`tick tick-${line.decision}`} />
            ))}
          </div>
        </div>
      </dl>
    </section>
  )
}
