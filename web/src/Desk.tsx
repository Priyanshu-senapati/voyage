import { useEffect, useState } from 'react'
import { RotateCw, X } from 'lucide-react'
import type { Session } from './session'
import { keyHint } from './session'
import type { Decision } from './types'
import { useDesk, type Notice } from './useDesk'
import { TopBar } from './TopBar'
import { PlanStrip } from './PlanStrip'
import { BuyList } from './BuyList'
import { WhyPanel } from './WhyPanel'
import { MobileDecide } from './MobileDecide'

interface Props {
  session: Session
  onSignOut: (reason?: string) => void
}

export function Desk({ session, onSignOut }: Props) {
  const desk = useDesk(session, onSignOut)
  const { plan } = desk
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const lines = plan?.lines ?? []
  const selected = lines.find((line) => line.id === selectedId) ?? lines[0] ?? null

  async function decide(id: number, decision: Exclude<Decision, 'pending'>) {
    const done = await desk.decide(id, decision)
    if (!done) return
    const next = lines.find((line) => line.rank > (selected?.rank ?? 0) && line.decision === 'pending' && line.id !== id)
    if (next) setSelectedId(next.id)
  }

  const viewer =
    session.mode === 'demo'
      ? { name: 'Ravi', detail: 'Approver · demo', company: 'TBO Demo' }
      : { name: 'Signed in', detail: `key ${keyHint(session.key)}`, company: null }

  return (
    <div className="app">
      <TopBar viewer={viewer} onSignOut={() => onSignOut()} />
      <main className="desk">
        <PlanStrip
          key={plan?.id ?? 'none'}
          plan={plan}
          plans={desk.plans}
          live={desk.live}
          creating={desk.creating}
          onOpen={(id) => {
            setSelectedId(null)
            desk.openPlan(id)
          }}
          onCreate={(budget, risk) => {
            setSelectedId(null)
            desk.createPlan(budget, risk)
          }}
        />
        {desk.state === 'loading' && <LoadingList />}
        {desk.state === 'error' && (
          <div className="state-panel">
            <h2>Plans did not load</h2>
            <p>Check that the Voyance API is running, then try again.</p>
            <button className="btn btn-secondary" type="button" onClick={desk.retry}>
              <RotateCw size={14} strokeWidth={2.25} aria-hidden="true" />
              Try again
            </button>
          </div>
        )}
        {desk.state === 'ready' && !plan && (
          <div className="state-panel">
            <h2>No plans yet</h2>
            <p>
              Set a budget and a risk level above, then create a plan. Each line will say which hotel and week to buy,
              how many rooms, at what price, and why.
            </p>
          </div>
        )}
        {desk.state === 'ready' && plan && selected && (
          <div className="work">
            <BuyList lines={lines} selectedId={selected.id} onSelect={setSelectedId} onExport={desk.exportCsv} />
            <WhyPanel
              key={selected.id}
              line={selected}
              creator={plan.created_by}
              busy={desk.deciding === selected.id}
              onDecide={decide}
            />
          </div>
        )}
      </main>
      {plan && selected && <MobileDecide line={selected} busy={desk.deciding === selected.id} onDecide={decide} />}
      {desk.notice && <Toast notice={desk.notice} onDismiss={desk.dismissNotice} />}
    </div>
  )
}

function LoadingList() {
  return (
    <div className="loading" aria-busy="true" aria-label="Loading plans">
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} className="loading-row" />
      ))}
    </div>
  )
}

function Toast({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  useEffect(() => {
    if (notice.tone === 'error') return
    const timer = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timer)
  }, [notice, onDismiss])

  return (
    <div className={`toast toast-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
      <p>{notice.text}</p>
      <button type="button" aria-label="Dismiss" onClick={onDismiss}>
        <X size={14} strokeWidth={2.5} aria-hidden="true" />
      </button>
    </div>
  )
}
