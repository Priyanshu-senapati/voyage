import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, RotateCw, X } from 'lucide-react'
import type { Session } from './session'
import { useDesk, type Notice } from './useDesk'
import { Shell } from './Shell'
import { PlanMode } from './PlanMode'
import { ReviewMode } from './ReviewMode'
import { PlansPage } from './PlansPage'
import { MarketsPage } from './MarketsPage'
import { AuditPage } from './AuditPage'
import { Segmented } from './ui'
import { go, useRoute } from './route'

interface Props {
  session: Session
  onSignOut: (reason?: string) => void
}

type Mode = 'plan' | 'review'
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function Desk({ session, onSignOut }: Props) {
  const desk = useDesk(session, onSignOut)
  const route = useRoute()
  const [chosen, setChosen] = useState<Mode | null>(null)
  const { me } = desk
  // buyers start by planning; approvers and admins start with what waits for them
  const mode: Mode = chosen ?? (me?.role === 'buyer' ? 'plan' : 'review')
  const waiting = desk.saved?.lines.filter((l) => l.decision === 'pending').length ?? 0

  const viewer = me
    ? { name: capital(me.name), detail: `${capital(me.role)} · ${me.tenant}${desk.live ? '' : ' (demo)'}` }
    : { name: '…', detail: 'Signing in' }

  let content
  if (route === 'plans') {
    content = (
      <PlansPage
        plans={desk.plans}
        openId={desk.saved?.id ?? null}
        onOpen={(id) => {
          desk.openPlan(id)
          setChosen('review')
          go('desk')
        }}
      />
    )
  } else if (route === 'markets') {
    content = <MarketsPage api={desk.api} />
  } else if (route === 'audit') {
    content = <AuditPage api={desk.api} me={me} />
  } else {
    content = (
      <div className="page">
        <header className="page-head page-head-row">
          <div>
            <h1>Buy Desk</h1>
            <p>
              {mode === 'plan'
                ? 'Choose a budget and a risk level, try what-ifs, then save the plan for approval.'
                : 'Go through each line of a saved plan and approve or reject it.'}
            </p>
          </div>
          <Segmented
            label="Buy Desk mode"
            value={mode}
            onChange={setChosen}
            options={[
              { value: 'plan', label: 'Plan' },
              {
                value: 'review',
                label: (
                  <>
                    Review
                    {waiting > 0 && <span className="count">{waiting}</span>}
                  </>
                ),
              },
            ]}
          />
        </header>
        {desk.state === 'loading' && (
          <div className="panel loading" aria-busy="true">
            Loading your plans…
          </div>
        )}
        {desk.state === 'error' && (
          <div className="panel empty-state">
            <h2>Plans didn't load</h2>
            <p>Check that the Voyance API is running, then try again.</p>
            <button className="btn btn-secondary" type="button" onClick={desk.retry}>
              <RotateCw size={14} strokeWidth={2.25} aria-hidden="true" />
              Try again
            </button>
          </div>
        )}
        {desk.state === 'ready' &&
          (mode === 'plan' ? <PlanMode desk={desk} /> : <ReviewMode desk={desk} onMakePlan={() => setChosen('plan')} />)}
      </div>
    )
  }

  return (
    <>
      <Shell active={route} viewer={viewer} onSignOut={() => onSignOut()}>
        {content}
      </Shell>
      {desk.notice && <Toast notice={desk.notice} onDismiss={desk.dismissNotice} />}
    </>
  )
}

const TOAST_ICON = { success: CheckCircle2, error: AlertCircle, info: Info }

function Toast({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  useEffect(() => {
    if (notice.tone === 'error') return
    const timer = setTimeout(onDismiss, 6000)
    return () => clearTimeout(timer)
  }, [notice, onDismiss])
  const Icon = TOAST_ICON[notice.tone]
  return (
    <div className={`toast toast-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
      <Icon size={18} strokeWidth={2} aria-hidden="true" />
      <p>{notice.text}</p>
      <button type="button" className="icon-button" aria-label="Dismiss" onClick={onDismiss}>
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  )
}
