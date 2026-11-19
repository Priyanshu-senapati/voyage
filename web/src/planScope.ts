import type { Api } from './api/client'
import demoPlan from './demo/plan-2cr.json'
import type { PlanOut, PlanSummary } from './types'
import { percent } from './format'
import { useLoad, type Load } from './useLoad'

// The saved plan the Action queue, Position monitor and Exposure caps pages look at
export interface PlanScope {
  api: Api | null
  plans: PlanSummary[]
  planId: number | null
  onPlan: (id: number) => void
}

export const DEMO_PLAN = demoPlan as unknown as PlanOut

// The whole saved plan (lines, passed hotel-weeks, exposure), fetched each time a page opens
export function usePlanDetail(api: Api | null, planId: number | null): Load<PlanOut> {
  return useLoad<PlanOut>(`${api ? 'live' : 'demo'}|${planId}`, () =>
    planId === null ? null : api ? api.plan(planId) : Promise.resolve(DEMO_PLAN),
  )
}

export function capsLabel(plan: Pick<PlanSummary, 'max_city_share' | 'max_hotel_share'>): string {
  const parts = [
    plan.max_city_share != null && `city ≤ ${percent(plan.max_city_share)}`,
    plan.max_hotel_share != null && `hotel ≤ ${percent(plan.max_hotel_share)}`,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : ''
}
