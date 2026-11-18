import type { CSSProperties } from 'react'
import { Save, Undo2 } from 'lucide-react'
import type { Plan, PlanSummary } from './types'
import type { Draft } from './useDesk'
import { inr } from './format'

interface Props {
  plan: Plan | null
  plans: PlanSummary[]
  draft: Draft
  live: boolean
  ready: boolean
  previewing: boolean
  creating: boolean
  canDiscard: boolean
  onDraft: (draft: Draft) => void
  onOpen: (id: number) => void
  onSave: () => void
  onDiscard: () => void
}

const BUDGET = { min: 2e6, max: 5e7, step: 1e6 }

function riskWord(value: number): string {
  if (value === 0) return 'Max profit'
  if (value < 0.2) return 'Bold'
  if (value < 0.5) return 'Balanced'
  if (value < 0.8) return 'Careful'
  return 'Protect worst case'
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
  })

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function PlanStrip({ plan, plans, draft, live, ready, previewing, creating, canDiscard, onDraft, onOpen, onSave, onDiscard }: Props) {
  const unsaved = plan !== null && plan.id === null
  const { budget, risk } = draft

  return (
    <section className="plan" aria-label="Plan settings and totals">
      <div className="plan-head">
        <div className="plan-title">
          <h1>
            December buy plan{' '}
            {unsaved ? (
              <span className="preview-tag">Preview, not saved</span>
            ) : plan && plans.length > 1 ? (
              <select
                className="plan-switch"
                aria-label="Open another plan"
                value={plan.id ?? ''}
                onChange={(e) => onOpen(Number(e.target.value))}
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.id} · {capital(p.created_by)} · {when(p.created_at)}
                  </option>
                ))}
              </select>
            ) : (
              plan && <span className="plan-id">#{plan.id}</span>
            )}
          </h1>
          <p className="plan-meta">
            {plan?.created_by && plan.created_at ? (
              <>
                Created by <strong>{capital(plan.created_by)}</strong> · {when(plan.created_at)} ·{' '}
                {plan.cities?.length ? plan.cities.join(', ') : 'all 5 cities'}
              </>
            ) : (
              <>Move the sliders to try a budget and risk level · all 5 cities</>
            )}
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
              disabled={!ready}
              onChange={(e) => onDraft({ budget: Number(e.target.value), risk })}
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
              disabled={!ready}
              onChange={(e) => onDraft({ budget, risk: Number(e.target.value) })}
              style={{ '--fill': `${risk * 100}%` } as CSSProperties}
            />
            <span className="control-ends">
              <span>Max profit</span>
              <span>Protect worst case</span>
            </span>
          </label>
          <div className="plan-actions">
            {unsaved && canDiscard && (
              <button className="btn btn-ghost btn-discard" type="button" onClick={onDiscard} disabled={creating}>
                <Undo2 size={14} strokeWidth={2.25} aria-hidden="true" />
                Discard
              </button>
            )}
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!ready || (live && !unsaved) || previewing || creating}
              onClick={onSave}
            >
              <Save size={14} strokeWidth={2.25} aria-hidden="true" />
              {creating ? 'Saving…' : previewing ? 'Updating…' : 'Save plan'}
            </button>
          </div>
        </div>
      </div>

      {plan && <Figures plan={plan} />}
    </section>
  )
}

function Figures({ plan }: { plan: Plan }) {
  const used = plan.spend / plan.budget_inr
  const tally = { approved: 0, rejected: 0, pending: 0 }
  plan.lines.forEach((line) => tally[line.decision]++)
  const unsaved = plan.id === null

  return (
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
          <span className="figure-of">
            {plan.worst_case_profit >= 0 ? 'still profit' : 'loss'} at risk {plan.risk_aversion}
          </span>
        </dd>
      </div>
      <div className="figure figure-approvals">
        <dt>Approvals</dt>
        {unsaved ? (
          <dd>
            <span className="figure-value">{plan.lines.length}</span>
            <span className="figure-of">lines · save to send for approval</span>
          </dd>
        ) : (
          <>
            <dd>
              <span className="figure-value">{tally.approved}</span>
              <span className="figure-of">
                of {plan.lines.length} · {tally.rejected} rejected · {tally.pending} waiting
              </span>
            </dd>
            <div className="ticks" aria-hidden="true">
              {plan.lines.map((line) => (
                <span key={line.id} className={`tick tick-${line.decision}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </dl>
  )
}
