import { useEffect, useState } from 'react'
import { Check, Download, X } from 'lucide-react'
import type { useDesk } from './useDesk'
import type { Decision, Me, Plan, PlanLine } from './types'
import { inr, riskWord, weekLabel } from './format'
import { DecisionBadge, Segmented } from './ui'
import { LineCase } from './LineCase'

type Desk = ReturnType<typeof useDesk>
type Filter = 'waiting' | 'decided' | 'all'

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
  })

// Who may decide this line, and what to tell the viewer either way. The API enforces the same rules.
function decisionRule(me: Me | null, plan: Plan, line: PlanLine): { canDecide: boolean; note: string } {
  if (line.decision !== 'pending') {
    const by = line.decided_by ? capital(line.decided_by) : 'someone'
    const at = line.decided_at ? ` on ${when(line.decided_at)}` : ''
    return { canDecide: false, note: `${line.decision === 'approved' ? 'Approved' : 'Rejected'} by ${by}${at}. Decisions are final.` }
  }
  const creator = capital(plan.created_by ?? 'someone')
  if (!me) return { canDecide: false, note: '' }
  if (me.role === 'buyer') return { canDecide: false, note: `Waiting for an approver. ${creator} made this plan.` }
  if (me.name === plan.created_by) return { canDecide: false, note: 'You made this plan, so another approver decides it.' }
  return { canDecide: true, note: `${creator} made this plan. Your decision is final and logged.` }
}

export function ReviewMode({ desk, onMakePlan }: { desk: Desk; onMakePlan: () => void }) {
  const plan = desk.saved
  const [filter, setFilter] = useState<Filter>('waiting')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  if (!plan) {
    return (
      <div className="panel empty-state">
        <h2>No plans to review yet</h2>
        <p>Once a buyer saves a plan, its lines wait here for an approver.</p>
        <button type="button" className="btn btn-secondary" onClick={onMakePlan}>
          Make a plan
        </button>
      </div>
    )
  }

  const lines = plan.lines
  const waiting = lines.filter((l) => l.decision === 'pending')
  const decided = lines.filter((l) => l.decision !== 'pending')
  const shown = filter === 'waiting' ? waiting : filter === 'decided' ? decided : lines
  const selected = shown.find((l) => l.id === selectedId) ?? shown[0] ?? null
  const rule = selected ? decisionRule(desk.me, plan, selected) : null

  async function decide(id: number, decision: Exclude<Decision, 'pending'>) {
    const at = shown.findIndex((l) => l.id === id)
    const done = await desk.decide(id, decision)
    if (!done) return
    // move on to the next line still waiting, in list order
    const next = shown.slice(at + 1).find((l) => l.decision === 'pending') ?? waiting.find((l) => l.id !== id)
    setSelectedId(next?.id ?? null)
  }

  return (
    <div className="review">
      <ReviewHead desk={desk} plan={plan} decided={decided.length} />
      <div className="review-body">
        <section className="panel queue" aria-label="Lines to review">
          <div className="queue-bar">
            <Segmented
              label="Show lines"
              value={filter}
              onChange={(f) => {
                setFilter(f)
                setSelectedId(null)
              }}
              options={[
                { value: 'waiting', label: `Waiting · ${waiting.length}` },
                { value: 'decided', label: `Decided · ${decided.length}` },
                { value: 'all', label: 'All' },
              ]}
            />
          </div>
          {shown.length === 0 ? (
            <p className="queue-empty">
              {filter === 'waiting' ? 'Every line has a decision. Nothing left to review.' : 'No decisions yet.'}
            </p>
          ) : (
            <ul className="queue-list">
              {shown.map((line) => (
                <li key={line.id}>
                  <button
                    type="button"
                    className="queue-item"
                    aria-current={line.id === selected?.id ? 'true' : undefined}
                    onClick={() => {
                      setSelectedId(line.id)
                      // stacked layout: bring the case into view instead of leaving it below the queue
                      if (window.matchMedia('(max-width: 1180px)').matches) {
                        requestAnimationFrame(() => document.getElementById('case-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
                      }
                    }}
                  >
                    <span className="queue-rank">{line.rank}</span>
                    <span className="queue-main">
                      <strong>
                        {line.city} · {line.hotel}
                      </strong>
                      <span className="muted">
                        {weekLabel(line.week)} · {line.rooms} rooms
                      </span>
                    </span>
                    <span className="queue-side">
                      <span className="strong">{inr(line.expected_profit)}</span>
                      {line.decision !== 'pending' && <DecisionBadge decision={line.decision} />}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel case-panel" id="case-panel" aria-label="Selected line">
          {selected && rule ? (
            <>
              <LineCase line={selected} unsaved={false} />
              <DecisionBar line={selected} rule={rule} busy={desk.deciding === selected.id} onDecide={decide} />
            </>
          ) : (
            <div className="empty-state">
              <h2>All done</h2>
              <p>Every line in plan #{plan.id} has a decision.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function ReviewHead({ desk, plan, decided }: { desk: Desk; plan: Plan; decided: number }) {
  const total = plan.lines.length
  const approved = plan.lines.filter((l) => l.decision === 'approved').length
  const rejected = plan.lines.filter((l) => l.decision === 'rejected').length
  return (
    <div className="panel review-head">
      <div className="review-plan">
        {desk.plans.length > 1 ? (
          <select
            className="select"
            aria-label="Plan to review"
            value={plan.id ?? ''}
            onChange={(e) => desk.openPlan(Number(e.target.value))}
          >
            {desk.plans.map((p) => (
              <option key={p.id} value={p.id}>
                Plan #{p.id} · {capital(p.created_by)} · {when(p.created_at)}
              </option>
            ))}
          </select>
        ) : (
          <strong className="review-title">Plan #{plan.id}</strong>
        )}
        <span className="muted">
          {inr(plan.budget_inr)} budget · {riskWord(plan.risk_aversion).toLowerCase()} risk ({plan.risk_aversion}) ·{' '}
          {inr(plan.expected_profit)} expected profit
        </span>
      </div>
      <div className="progress" aria-label={`${decided} of ${total} lines decided`}>
        <span className="progress-text">
          <strong>{decided}</strong> of {total} decided
        </span>
        <span className="progress-track" aria-hidden="true">
          <span className="progress-approved" style={{ width: `${(approved / total) * 100}%` }} />
          <span className="progress-rejected" style={{ width: `${(rejected / total) * 100}%` }} />
        </span>
      </div>
      <button type="button" className="btn btn-secondary" onClick={desk.exportCsv}>
        <Download size={15} strokeWidth={2} aria-hidden="true" />
        Export CSV
      </button>
    </div>
  )
}

interface DecisionBarProps {
  line: PlanLine
  rule: { canDecide: boolean; note: string }
  busy: boolean
  onDecide: (id: number, decision: Exclude<Decision, 'pending'>) => void
}

function DecisionBar({ line, rule, busy, onDecide }: DecisionBarProps) {
  // keyboard: A approves, R rejects, when no field has focus
  useEffect(() => {
    if (!rule.canDecide) return
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (busy || event.metaKey || event.ctrlKey || event.altKey || target.closest('input, select, textarea')) return
      if (event.key === 'a') onDecide(line.id, 'approved')
      if (event.key === 'r') onDecide(line.id, 'rejected')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [line.id, rule.canDecide, busy, onDecide])

  return (
    <footer className="decision-bar">
      <p className="fine">{rule.note}</p>
      {rule.canDecide && (
        <div className="decision-actions">
          <button type="button" className="btn btn-danger-outline" disabled={busy} onClick={() => onDecide(line.id, 'rejected')}>
            <X size={16} strokeWidth={2.25} aria-hidden="true" />
            Reject
            <kbd>R</kbd>
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onDecide(line.id, 'approved')}>
            <Check size={16} strokeWidth={2.25} aria-hidden="true" />
            Approve line
            <kbd>A</kbd>
          </button>
        </div>
      )}
    </footer>
  )
}
