import type { PlanScope } from './planScope'
import { capsLabel } from './planScope'
import { capital, inr } from './format'
import { go } from './route'

export function PlanPicker({ plans, planId, onPlan }: Omit<PlanScope, 'api'>) {
  if (plans.length === 0 || planId === null) return null
  return (
    <label className="inline-field">
      <span>Plan</span>
      <select className="select" value={planId} onChange={(e) => onPlan(Number(e.target.value))}>
        {plans.map((p) => {
          const caps = capsLabel(p)
          return (
            <option key={p.id} value={p.id}>
              #{p.id} · {inr(p.budget_inr)} · {capital(p.created_by)}
              {caps && ` · ${caps}`}
            </option>
          )
        })}
      </select>
    </label>
  )
}

export function NoPlans({ what }: { what: string }) {
  return (
    <div className="panel empty-state">
      <h2>No saved plans yet</h2>
      <p>Save a plan on the Buy Desk, then come back to see {what}.</p>
      <button type="button" className="btn btn-secondary" onClick={() => go('desk')}>
        Go to the Buy Desk
      </button>
    </div>
  )
}
