import { Check, Clock, PencilLine, X } from 'lucide-react'
import type { Decision, PlanSummary } from './types'

const LABEL: Record<Decision, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }
const ICON = { pending: Clock, approved: Check, rejected: X }

export function StatusChip({ decision, unsaved = false }: { decision: Decision; unsaved?: boolean }) {
  if (unsaved) {
    return (
      <span className="chip chip-unsaved">
        <PencilLine size={12} strokeWidth={2.5} aria-hidden="true" />
        Unsaved
      </span>
    )
  }
  const Icon = ICON[decision]
  return (
    <span className={`chip chip-${decision}`}>
      <Icon size={12} strokeWidth={2.5} aria-hidden="true" />
      {LABEL[decision]}
    </span>
  )
}

const PLAN_LABEL: Record<PlanSummary['status'], string> = {
  empty: 'No lines', pending: 'Pending', approved: 'Approved', rejected: 'Rejected', mixed: 'In review',
}

export function PlanStatusChip({ status }: { status: PlanSummary['status'] }) {
  if (status === 'pending' || status === 'approved' || status === 'rejected') {
    return <StatusChip decision={status} />
  }
  return <span className="chip chip-pending">{PLAN_LABEL[status]}</span>
}
