import { useId, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Check, Clock, Info, X } from 'lucide-react'
import type { Decision, PlanSummary } from './types'

type Tone = 'neutral' | 'accent' | 'success' | 'danger' | 'warn'

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

const DECISION: Record<Decision, { tone: Tone; label: string; Icon: typeof Check }> = {
  pending: { tone: 'neutral', label: 'Waiting', Icon: Clock },
  approved: { tone: 'success', label: 'Approved', Icon: Check },
  rejected: { tone: 'danger', label: 'Rejected', Icon: X },
}

export function DecisionBadge({ decision }: { decision: Decision }) {
  const { tone, label, Icon } = DECISION[decision]
  return (
    <Badge tone={tone}>
      <Icon size={12} strokeWidth={2.5} aria-hidden="true" />
      {label}
    </Badge>
  )
}

const PLAN_STATUS: Record<PlanSummary['status'], { tone: Tone; label: string }> = {
  empty: { tone: 'neutral', label: 'No lines' },
  pending: { tone: 'neutral', label: 'Waiting for approval' },
  mixed: { tone: 'accent', label: 'Partly approved' },
  approved: { tone: 'success', label: 'Approved' },
  rejected: { tone: 'danger', label: 'Rejected' },
}

export function PlanStatusBadge({ status }: { status: PlanSummary['status'] }) {
  const { tone, label } = PLAN_STATUS[status]
  return <Badge tone={tone}>{label}</Badge>
}

// A small "i" that explains a metric in plain words, on hover and on keyboard focus
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId()
  return (
    <span className="infotip">
      <button type="button" className="infotip-button" aria-label={`About ${label}`} aria-describedby={id}>
        <Info size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      <span role="tooltip" id={id} className="infotip-body">
        {children}
      </span>
    </span>
  )
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (value: T) => void
}

// Tabs that switch a view in place (role=tablist), keyboard arrows included
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    const i = options.findIndex((o) => o.value === value)
    const next = options[(i + (event.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length]
    onChange(next.value)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus()
  }
  return (
    <div className="segmented" role="tablist" aria-label={label} onKeyDown={onKey}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          data-value={o.value}
          aria-selected={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

interface DeltaProps {
  value: number
  format: (v: number) => string
  better?: 'up' | 'down' | 'none'
  against?: string
}

// A change against something (by default the plan without the what-if); `better` says which direction is good news
export function Delta({ value, format, better = 'up', against = 'the plan without the what-if' }: DeltaProps) {
  if (Math.abs(value) < 1e-9) return <span className="delta delta-flat">no change</span>
  const up = value > 0
  const good = better === 'none' ? null : (better === 'up') === up
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`delta ${good === null ? 'delta-flat' : good ? 'delta-good' : 'delta-bad'}`}>
      <Icon size={13} strokeWidth={2.5} aria-hidden="true" />
      {up ? '+' : '−'}
      {format(Math.abs(value))}
      <span className="sr-only"> against {against}</span>
    </span>
  )
}
