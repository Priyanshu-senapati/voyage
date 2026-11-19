import { ChevronRight } from 'lucide-react'
import type { PlanSummary } from './types'
import { inr } from './format'
import { PlanStatusBadge } from './ui'

interface Props {
  plans: PlanSummary[]
  openId: number | null
  onOpen: (id: number) => void
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
  })
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function PlansPage({ plans, openId, onOpen }: Props) {
  return (
    <div className="page">
      <header className="page-head">
        <h1>Plans</h1>
        <p>Every plan your company has saved, newest first. Open one to review its lines.</p>
      </header>
      {plans.length === 0 ? (
        <div className="panel empty-state">
          <h2>No plans yet</h2>
          <p>A buyer saves plans from the Buy Desk. They appear here.</p>
        </div>
      ) : (
        <div className="panel table-panel">
          <table className="table" aria-label="Plans">
            <thead>
              <tr>
                <th scope="col">Plan</th>
                <th scope="col">Saved by</th>
                <th scope="col" className="num">Budget</th>
                <th scope="col" className="num hide-sm">Spend</th>
                <th scope="col" className="num">Expected profit</th>
                <th scope="col" className="num hide-sm">Bad-season profit</th>
                <th scope="col">Status</th>
                <th scope="col" className="chevron-col">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id} className="row-link" aria-current={plan.id === openId ? 'true' : undefined} onClick={() => onOpen(plan.id)}>
                  <td>
                    <button type="button" className="row-button" onClick={() => onOpen(plan.id)}>
                      <strong>#{plan.id}</strong>
                    </button>
                  </td>
                  <td>
                    {capital(plan.created_by)} <span className="muted">· {when(plan.created_at)}</span>
                  </td>
                  <td className="num">{inr(plan.budget_inr)}</td>
                  <td className="num hide-sm">{inr(plan.spend)}</td>
                  <td className="num strong">{inr(plan.expected_profit)}</td>
                  <td className="num hide-sm">{inr(plan.worst_case_profit)}</td>
                  <td>
                    <PlanStatusBadge status={plan.status} />
                  </td>
                  <td className="chevron-col">
                    <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
