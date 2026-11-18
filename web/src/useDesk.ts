import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, apiFor, type Api } from './api/client'
import demoPlan from './demo/plan-2cr.json'
import type { Session } from './session'
import type { Decision, Me, Plan, PlanLine, PlanOut, PlanPreview, PlanSummary } from './types'
import { inr } from './format'

export type Notice = { tone: 'error' | 'info' | 'success'; text: string }
export type LoadState = 'loading' | 'ready' | 'error'
export type Draft = { budget: number; risk: number }

export const DEFAULT_DRAFT: Draft = { budget: 2e7, risk: 0.3 }
const DEMO_ME: Me = { name: 'ravi', role: 'approver', tenant: 'TBO Demo' }
const PREVIEW_DELAY_MS = 300 // lane A asks for a pause after the slider stops

const ranked = <T,>(lines: T[]) => lines.map((line, i) => ({ ...line, rank: i + 1 }))

function savedPlan(raw: PlanOut): Plan {
  return { ...raw, lines: ranked(raw.lines) }
}

function previewPlan(raw: PlanPreview): Plan {
  return {
    ...raw,
    id: null,
    created_at: null,
    created_by: null,
    status: raw.lines.length ? 'pending' : 'empty',
    // preview lines have no ids yet: negative ranks keep selection working without colliding with real ids
    lines: raw.lines.map((line, i) => ({
      ...line, id: -(i + 1), rank: i + 1, decision: 'pending', decided_by: null, decided_at: null,
    })),
  }
}

// Mirrors the API's plan status so the header stays right between reloads
function statusOf(lines: PlanLine[]): Plan['status'] {
  if (lines.length === 0) return 'empty'
  const kinds = new Set(lines.map((line) => line.decision))
  return kinds.size > 1 ? 'mixed' : (lines[0].decision as Plan['status'])
}

const draftOf = (plan: Plan | null): Draft =>
  plan ? { budget: plan.budget_inr, risk: plan.risk_aversion } : DEFAULT_DRAFT

const sameDraft = (a: Draft, b: Draft) => a.budget === b.budget && a.risk === b.risk

async function loadDesk(api: Api) {
  const [me, list] = await Promise.all([api.me(), api.plans()])
  const latest = list.length ? savedPlan(await api.plan(list[0].id)) : null
  return { me, list, latest }
}

export function useDesk(session: Session, onSignOut: (reason?: string) => void) {
  const api = useMemo(() => (session.mode === 'live' ? apiFor(session.key) : null), [session])
  const [me, setMe] = useState<Me | null>(api ? null : DEMO_ME)
  const [saved, setSaved] = useState<Plan | null>(() => (api ? null : savedPlan(demoPlan as unknown as PlanOut)))
  const [plans, setPlans] = useState<PlanSummary[]>(() => (saved ? [summaryOf(saved)] : []))
  const [draft, setDraftState] = useState<Draft>(() => draftOf(saved))
  const [preview, setPreview] = useState<Plan | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [state, setState] = useState<LoadState>(api ? 'loading' : 'ready')
  const [attempt, setAttempt] = useState(0)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [creating, setCreating] = useState(false)
  const [deciding, setDeciding] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inflight = useRef<AbortController>(undefined)
  const dismissNotice = useCallback(() => setNotice(null), [])

  const fail = useCallback(
    (error: unknown, fallback: string) => {
      if (error instanceof ApiError && error.status === 401) return onSignOut(error.message)
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : fallback })
    },
    [onSignOut],
  )

  const cancelPreview = useCallback(() => {
    clearTimeout(timer.current)
    inflight.current?.abort()
    setPreviewing(false)
  }, [])

  const runPreview = useCallback(
    (next: Draft) => {
      if (!api) return
      cancelPreview()
      timer.current = setTimeout(async () => {
        const controller = new AbortController()
        inflight.current = controller
        setPreviewing(true)
        try {
          const result = await api.preview({ budget_inr: next.budget, risk_aversion: next.risk }, controller.signal)
          setPreview(previewPlan(result))
        } catch (error) {
          if (controller.signal.aborted) return
          fail(error, 'Could not preview that plan')
        } finally {
          if (inflight.current === controller) setPreviewing(false)
        }
      }, PREVIEW_DELAY_MS)
    },
    [api, cancelPreview, fail],
  )

  // a newly opened, created or loaded plan resets the sliders to its own settings
  const showSaved = useCallback(
    (plan: Plan | null) => {
      cancelPreview()
      setSaved(plan)
      setPreview(null)
      setDraftState(draftOf(plan))
      if (!plan) runPreview(DEFAULT_DRAFT) // nothing saved yet: show what the default budget would buy
    },
    [cancelPreview, runPreview],
  )

  useEffect(() => {
    if (!api) return
    let current = true
    loadDesk(api).then(
      ({ me: who, list, latest }) => {
        if (!current) return
        setMe(who)
        setPlans(list)
        showSaved(latest)
        setState('ready')
      },
      (error) => {
        if (!current) return
        setState('error')
        fail(error, 'Could not load plans')
      },
    )
    return () => {
      current = false
    }
  }, [api, attempt, fail, showSaved])

  useEffect(() => () => cancelPreview(), [cancelPreview])

  function setDraft(next: Draft) {
    setDraftState(next)
    if (!api) return
    if (saved && sameDraft(next, draftOf(saved))) {
      cancelPreview()
      setPreview(null)
    } else runPreview(next)
  }

  async function openPlan(id: number) {
    if (!api || id === saved?.id) return
    try {
      showSaved(savedPlan(await api.plan(id)))
    } catch (error) {
      fail(error, 'Could not open that plan')
    }
  }

  async function savePlan() {
    if (!api) {
      setNotice({ tone: 'info', text: 'The demo shows one saved plan. Sign in with an API key to run the planner.' })
      return
    }
    cancelPreview()
    setCreating(true)
    try {
      const created = savedPlan(await api.createPlan({ budget_inr: draft.budget, risk_aversion: draft.risk }))
      showSaved(created)
      setPlans((list) => [summaryOf(created), ...list])
      setNotice({
        tone: 'success',
        text: `Plan #${created.id} saved: ${created.lines.length} lines, ${inr(created.spend)} of ${inr(draft.budget)}.`,
      })
    } catch (error) {
      if (error instanceof ApiError && error.retryAfter && error.status === 503) {
        setNotice({ tone: 'error', text: `The planner is busy. Try again in ${error.retryAfter} s.` })
      } else fail(error, 'Could not save the plan')
    } finally {
      setCreating(false)
    }
  }

  function discardPreview() {
    cancelPreview()
    setPreview(null)
    setDraftState(draftOf(saved))
  }

  function applyLine(updated: Partial<PlanLine> & { id: number }) {
    setSaved((current) => {
      if (!current) return current
      const lines = current.lines.map((line) => (line.id === updated.id ? { ...line, ...updated } : line))
      return { ...current, lines, status: statusOf(lines) }
    })
  }

  async function decide(lineId: number, decision: Exclude<Decision, 'pending'>): Promise<boolean> {
    if (!saved?.id) return false
    if (!api) {
      applyLine({ id: lineId, decision, decided_by: DEMO_ME.name, decided_at: new Date().toISOString() })
      return true
    }
    setDeciding(lineId)
    try {
      applyLine(await api.decide(saved.id, lineId, decision))
      return true
    } catch (error) {
      fail(error, 'Could not record the decision')
      // someone else decided first: show what is true now
      if (error instanceof ApiError && error.status === 409) setSaved(savedPlan(await api.plan(saved.id)))
      return false
    } finally {
      setDeciding(null)
    }
  }

  async function exportCsv() {
    if (!saved?.id) return
    if (!api) {
      setNotice({ tone: 'info', text: 'Sign in with an API key to export a plan.' })
      return
    }
    try {
      const csv = await api.exportCsv(saved.id)
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
      const link = Object.assign(document.createElement('a'), { href: url, download: `plan-${saved.id}.csv` })
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      fail(error, 'Could not export the plan')
    }
  }

  return {
    api, me, plans, saved, preview, draft, previewing, state, notice, creating, deciding,
    plan: preview ?? saved,
    live: api !== null,
    retry: () => {
      setState('loading')
      setAttempt((n) => n + 1)
    },
    setDraft, openPlan, savePlan, discardPreview, decide, exportCsv,
    dismissNotice,
    notify: setNotice,
  }
}

function summaryOf(plan: Plan): PlanSummary {
  const { lines: _lines, id, created_at, created_by, ...totals } = plan
  return { ...totals, id: id ?? 0, created_at: created_at ?? '', created_by: created_by ?? '' }
}
