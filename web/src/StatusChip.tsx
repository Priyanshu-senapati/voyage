import { Check, Clock, PencilLine, X } from 'lucide-react'
import type { Decision } from './types'

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
