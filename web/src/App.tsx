import { useMemo, useState } from 'react'
import demoPlan from './demo/plan-2cr.json'
import type { Decision, Plan } from './types'
import { TopBar } from './TopBar'
import { PlanStrip } from './PlanStrip'
import { BuyList } from './BuyList'
import { WhyPanel } from './WhyPanel'
import { MobileDecide } from './MobileDecide'

const plan = demoPlan as Plan
const VIEWER = { name: 'Ravi', role: 'Approver', company: 'TBO Demo' }

export default function App() {
  const [decisions, setDecisions] = useState<Record<number, Decision>>(() =>
    Object.fromEntries(plan.lines.map((line) => [line.id, line.decision])),
  )
  const [selectedId, setSelectedId] = useState(plan.lines[0].id)

  const lines = useMemo(
    () =>
      plan.lines.map((line) => {
        const decision = decisions[line.id]
        const changed = decision !== line.decision
        return changed ? { ...line, decision, decided_by: 'ravi', decided_at: new Date().toISOString() } : line
      }),
    [decisions],
  )
  const selected = lines.find((line) => line.id === selectedId) ?? lines[0]

  function decide(id: number, decision: Decision) {
    setDecisions((current) => ({ ...current, [id]: decision }))
    const next = lines.find((line) => line.id > id && decisions[line.id] === 'pending')
    if (next) setSelectedId(next.id)
  }

  return (
    <div className="app">
      <TopBar viewer={VIEWER} />
      <main className="desk">
        <PlanStrip plan={plan} lines={lines} />
        <div className="work">
          <BuyList lines={lines} selectedId={selected.id} onSelect={setSelectedId} />
          <WhyPanel key={selected.id} line={selected} creator={plan.created_by} onDecide={decide} />
        </div>
      </main>
      <MobileDecide line={selected} onDecide={decide} />
    </div>
  )
}
