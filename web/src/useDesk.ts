import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, apiFor, type Api } from './api/client'
import demoPlan from './demo/plan-2cr.json'
import type { Session } from './session'
import type { Decision, LineWhy, MarketItem, Plan, PlanLine, PlanLineOut, PlanSummary } from './types'
import { deriveWhy, marketKey } from './why'
import { inr, sum } from './format'
import type { components } from './api/schema'

type PlanOut = components['schemas']['PlanOut']
export type Notice = { tone: 'error' | 'info' | 'success'; text: string }
export type LoadState = 'loading' | 'ready' | 'error'

type FixtureLine = PlanLineOut & { why: Omit<LineWhy, 'soldout_searches_total'> & { soldout_searches_past: number[] } }

function fixturePlan(): Plan {
  const raw = demoPlan as unknown as Omit<PlanOut, 'lines'> & { lines: FixtureLine[] }
  return {
    ...raw,
    lines: raw.lines.map((line, i) => ({
      ...line,
      rank: i + 1,
      why: { ...line.why, soldout_searches_total: sum(line.why.soldout_searches_past) },
    })),
  }
}

function toPlan(raw: PlanOut, markets: Map<string, MarketItem>): Plan {
  return {
    ...raw,
    lines: raw.lines.map((line, i) => ({ ...line, rank: i + 1, why: deriveWhy(line, markets.get(marketKey(line))) })),
  }
}

async function loadDesk(api: Api) {
  const [list, items] = await Promise.all([api.plans(), api.markets()])
  const byKey = new Map(items.map((m) => [marketKey(m), m]))
  const latest = list.length ? toPlan(await api.plan(list[0].id), byKey) : null
  return { list, byKey, latest }
}

// Mirrors the API's plan status so the header stays right between reloads
function statusOf(lines: PlanLine[]): Plan['status'] {
  if (lines.length === 0) return 'empty'
  const kinds = new Set(lines.map((line) => line.decision))
  return kinds.size > 1 ? 'mixed' : (lines[0].decision as Plan['status'])
}

function summaryOf(plan: Plan): PlanSummary {
  const { lines: _lines, ...summary } = plan
  return summary
}

export function useDesk(session: Session, onSignOut: (reason?: string) => void) {
  const api = useMemo(() => (session.mode === 'live' ? apiFor(session.key) : null), [session])
  const [plan, setPlan] = useState<Plan | null>(() => (api ? null : fixturePlan()))
  const [plans, setPlans] = useState<PlanSummary[]>(() => (plan ? [summaryOf(plan)] : []))
  const [markets, setMarkets] = useState<Map<string, MarketItem>>(new Map())
  const [state, setState] = useState<LoadState>(api ? 'loading' : 'ready')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [creating, setCreating] = useState(false)
  const [deciding, setDeciding] = useState<number | null>(null)

  const fail = useCallback(
    (error: unknown, fallback: string) => {
      if (error instanceof ApiError && error.status === 401) return onSignOut(error.message)
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : fallback })
    },
    [onSignOut],
  )

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!api) return
    let current = true
    loadDesk(api).then(
      ({ list, byKey, latest }) => {
        if (!current) return
        setMarkets(byKey)
        setPlans(list)
        setPlan(latest)
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
  }, [api, attempt, fail])

  async function openPlan(id: number) {
    if (!api || id === plan?.id) return
    try {
      setPlan(toPlan(await api.plan(id), markets))
    } catch (error) {
      fail(error, 'Could not open that plan')
    }
  }

  async function createPlan(budget: number, risk: number) {
    if (!api) {
      setNotice({ tone: 'info', text: 'The demo shows one saved plan. Sign in with an API key to run the planner.' })
      return
    }
    setCreating(true)
    try {
      const created = toPlan(await api.createPlan({ budget_inr: budget, risk_aversion: risk }), markets)
      setPlan(created)
      setPlans((list) => [summaryOf(created), ...list])
      setNotice({
        tone: 'success',
        text: `Plan #${created.id}: ${created.lines.length} lines, ${inr(created.spend)} of ${inr(budget)}.`,
      })
    } catch (error) {
      if (error instanceof ApiError && error.retryAfter && error.status === 503) {
        setNotice({ tone: 'error', text: `The planner is busy. Try again in ${error.retryAfter} s.` })
      } else fail(error, 'Could not create the plan')
    } finally {
      setCreating(false)
    }
  }

  function applyLine(updated: Partial<PlanLine> & { id: number }) {
    setPlan((current) => {
      if (!current) return current
      const lines = current.lines.map((line) => (line.id === updated.id ? { ...line, ...updated } : line))
      const next = { ...current, lines, status: statusOf(lines) }
      setPlans((list) => list.map((p) => (p.id === next.id ? { ...p, status: next.status } : p)))
      return next
    })
  }

  async function decide(lineId: number, decision: Exclude<Decision, 'pending'>): Promise<boolean> {
    if (!plan) return false
    if (!api) {
      applyLine({ id: lineId, decision, decided_by: 'ravi', decided_at: new Date().toISOString() })
      return true
    }
    setDeciding(lineId)
    try {
      applyLine(await api.decide(plan.id, lineId, decision))
      return true
    } catch (error) {
      fail(error, 'Could not record the decision')
      // someone else decided first: show what is true now
      if (error instanceof ApiError && error.status === 409) setPlan(toPlan(await api.plan(plan.id), markets))
      return false
    } finally {
      setDeciding(null)
    }
  }

  async function exportCsv() {
    if (!plan) return
    if (!api) {
      setNotice({ tone: 'info', text: 'Sign in with an API key to export a plan.' })
      return
    }
    try {
      const csv = await api.exportCsv(plan.id)
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
      const link = Object.assign(document.createElement('a'), { href: url, download: `plan-${plan.id}.csv` })
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      fail(error, 'Could not export the plan')
    }
  }

  return {
    plan, plans, state, notice, creating, deciding,
    live: api !== null,
    retry: () => {
      setState('loading')
      setAttempt((n) => n + 1)
    },
    openPlan, createPlan, decide, exportCsv,
    dismissNotice: () => setNotice(null),
  }
}
