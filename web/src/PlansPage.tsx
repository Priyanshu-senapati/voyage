import { ArrowRight } from 'lucide-react'
import type { PlanSummary } from './types'
import { inr } from './format'
import { PlanStatusChip } from './StatusChip'

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
    <section className="page" aria-labelledby="plans-title">
      <header className="page-head">
        <h1 id="plans-title">Plans</h1>
        <p>Every plan your company has saved, newest first. Open one to review its lines on the Buy Desk.</p>
      </header>
      {plans.length === 0 ? (
        <div className="state-panel">
          <h2>No plans yet</h2>
          <p>Set a budget and a risk level on the Buy Desk, then save the plan.</p>
        </div>
      ) : (
        <div className="table-wrap page-table">
          <table className="table" aria-label="Plans">
            <thead>
              <tr>
                <th scope="col" className="c-rank">Plan</th>
                <th scope="col">Created</th>
                <th scope="col" className="c-num">Budget</th>
                <th scope="col" className="c-num">Risk</th>
                <th scope="col" className="c-num">Spend</th>
                <th scope="col" className="c-num">Exp. profit</th>
                <th scope="col" className="c-num">Worst 5%</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id} className="row" aria-selected={plan.id === openId} onClick={() => onOpen(plan.id)}>
                  <td className="c-rank">#{plan.id}</td>
                  <td>
                    <strong>{capital(plan.created_by)}</strong> <span className="muted">{when(plan.created_at)}</span>
                  </td>
                  <td className="c-num">{inr(plan.budget_inr)}</td>
                  <td className="c-num">{plan.risk_aversion}</td>
                  <td className="c-num">{inr(plan.spend)}</td>
                  <td className="c-num c-profit">{inr(plan.expected_profit)}</td>
                  <td className="c-num">{inr(plan.worst_case_profit)}</td>
                  <td>
                    <PlanStatusChip status={plan.status} />
                  </td>
                  <td className="c-open">
                    <button className="btn btn-ghost" type="button" onClick={() => onOpen(plan.id)}>
                      Open
                      <ArrowRight size={13} strokeWidth={2.25} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
