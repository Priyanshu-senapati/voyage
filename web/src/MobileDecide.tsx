import { Check, X } from 'lucide-react'
import type { Decision, PlanLine } from './types'
import { weekLabel } from './format'
import { StatusChip } from './StatusChip'

interface Props {
  line: PlanLine
  onDecide: (id: number, decision: Decision) => void
}

// Phones only: the selected line's decision stays in reach while the list scrolls
export function MobileDecide({ line, onDecide }: Props) {
  return (
    <div className="mobile-decide" role="region" aria-label="Decide the selected line">
      <a className="mobile-decide-line" href="#why">
        <strong>
          {line.id} · {line.city} {line.hotel}
        </strong>
        <span>{weekLabel(line.week)} · see why</span>
      </a>
      {line.decision === 'pending' ? (
        <div className="mobile-decide-actions">
          <button className="btn btn-reject" type="button" aria-label="Reject line" onClick={() => onDecide(line.id, 'rejected')}>
            <X size={16} strokeWidth={2.5} aria-hidden="true" />
          </button>
          <button className="btn btn-primary" type="button" onClick={() => onDecide(line.id, 'approved')}>
            <Check size={16} strokeWidth={2.5} aria-hidden="true" />
            Approve
          </button>
        </div>
      ) : (
        <StatusChip decision={line.decision} />
      )}
    </div>
  )
}
