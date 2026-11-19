import { useEffect, useState } from 'react'
import { RotateCw, X } from 'lucide-react'
import type { Session } from './session'
import type { Decision, Me, Plan, PlanLine } from './types'
import { useDesk, type Notice } from './useDesk'
import { TopBar } from './TopBar'
import { PlanStrip } from './PlanStrip'
import { BuyList } from './BuyList'
import { WhyPanel } from './WhyPanel'
import { RiskCurve } from './RiskCurve'
import { MobileDecide } from './MobileDecide'
import { PlansPage } from './PlansPage'
import { MarketsPage } from './MarketsPage'
import { AuditPage } from './AuditPage'
import { go, useRoute } from './route'

interface Props {
  session: Session
  onSignOut: (reason?: string) => void
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Who may decide this line, and what to tell the viewer either way. The API enforces the same rules.
function decisionRule(me: Me | null, plan: Plan, line: PlanLine): { canDecide: boolean; note: string } {
  if (plan.id === null) return { canDecide: false, note: 'Not saved yet. Save the plan to send it for approval.' }
  if (line.decision !== 'pending') return { canDecide: false, note: '' }
  const creator = capital(plan.created_by ?? 'someone')
  if (!me) return { canDecide: false, note: `Made by ${creator}.` }
  if (me.role === 'buyer') return { canDecide: false, note: `Made by ${creator}. An approver or admin decides each line.` }
  if (me.name === plan.created_by) return { canDecide: false, note: 'You made this plan, so someone else must approve it.' }
  return { canDecide: true, note: `Made by ${creator}, so you decide. Final and logged.` }
}

export function Desk({ session, onSignOut }: Props) {
  const desk = useDesk(session, onSignOut)
  const { plan, me } = desk
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [tab, setTab] = useState<'why' | 'curve'>('why')
  const route = useRoute()

  const lines = plan?.lines ?? []
  const selected = lines.find((line) => line.id === selectedId) ?? lines[0] ?? null
  const rule = plan && selected ? decisionRule(me, plan, selected) : null

  async function decide(id: number, decision: Exclude<Decision, 'pending'>) {
    const done = await desk.decide(id, decision)
    if (!done) return
    const next = lines.find((line) => line.rank > (selected?.rank ?? 0) && line.decision === 'pending' && line.id !== id)
    if (next) setSelectedId(next.id)
  }

  const viewer = me
    ? { name: capital(me.name), detail: `${capital(me.role)}${desk.live ? '' : ' · demo'}`, company: me.tenant }
    : { name: '…', detail: 'Signing in', company: null }

  return (
    <div className="app">
      <TopBar viewer={viewer} active={route} onSignOut={() => onSignOut()} />
      <main className="desk">
        {route === 'desk' ? (
        <>
        <PlanStrip
          plan={plan}
          plans={desk.plans}
          draft={desk.draft}
          live={desk.live}
          ready={desk.state === 'ready'}
          previewing={desk.previewing}
          creating={desk.creating}
          canDiscard={desk.saved !== null}
          onDraft={desk.setDraft}
          onOpen={(id) => {
            setSelectedId(null)
            desk.openPlan(id)
          }}
          onSave={() => {
            setSelectedId(null)
            desk.savePlan()
          }}
          onDiscard={desk.discardPreview}
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
            <h2>Working out a first plan…</h2>
            <p>
              This is what the budget and risk above would buy. Each line will say which hotel and week to buy, how
              many rooms, at what price, and why.
            </p>
          </div>
        )}
        {desk.state === 'ready' && plan && selected && rule && (
          <div className="work" aria-busy={desk.previewing || undefined}>
            <BuyList
              lines={lines}
              selectedId={selected.id}
              onSelect={setSelectedId}
              onExport={desk.exportCsv}
              unsaved={plan.id === null}
            />
            <aside className="side" aria-label="Details">
              <div className="tabs" role="tablist" aria-label="Details">
                <button
                  id="tab-why"
                  role="tab"
                  type="button"
                  aria-selected={tab === 'why'}
                  aria-controls="why"
                  onClick={() => setTab('why')}
                >
                  Why this line
                </button>
                <button
                  id="tab-curve"
                  role="tab"
                  type="button"
                  aria-selected={tab === 'curve'}
                  aria-controls="curve"
                  onClick={() => setTab('curve')}
                >
                  Risk curve
                </button>
              </div>
              {tab === 'why' ? (
                <WhyPanel
                  key={selected.id}
                  line={selected}
                  note={rule.note}
                  canDecide={rule.canDecide}
                  unsaved={plan.id === null}
                  busy={desk.deciding === selected.id}
                  onDecide={decide}
                />
              ) : (
                <section id="curve" role="tabpanel" aria-labelledby="tab-curve" className="curve-panel">
                  <RiskCurve
                    api={desk.api}
                    budget={desk.draft.budget}
                    risk={desk.draft.risk}
                    onPick={(risk) => desk.setDraft({ budget: desk.draft.budget, risk })}
                  />
                </section>
              )}
            </aside>
          </div>
        )}
        </>
        ) : route === 'plans' ? (
          <PlansPage
            plans={desk.plans}
            openId={desk.saved?.id ?? null}
            onOpen={(id) => {
              setSelectedId(null)
              desk.openPlan(id)
              go('desk')
            }}
          />
        ) : route === 'markets' ? (
          <MarketsPage api={desk.api} />
        ) : (
          <AuditPage api={desk.api} me={me} />
        )}
      </main>
      {route === 'desk' && plan && selected && rule && (
        <MobileDecide line={selected} busy={desk.deciding === selected.id} canDecide={rule.canDecide} onDecide={decide} />
      )}
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
