import type {
  AuditEvent, Decision, FrontierPoint, MarketItem, Me, PlanCreate, PlanLineOut, PlanOut, PlanPreview, PlanSummary,
  PositionOut, PreviewRequest, QueueOut, ReplayOut,
} from '../types'

// What-ifs the preview and the frontier accept (lane A's WhatIf); event_lift null means the planner's own guess
export type WhatIfParams = Pick<PreviewRequest, 'demand_change' | 'cost_change' | 'event_lift'>

// The exposure caps a plan is made with (share of the whole budget; null = no cap)
export type CapParams = Pick<PreviewRequest, 'max_city_share' | 'max_hotel_share'>

// Same origin by default: Vite proxies /v1 to the API in dev and preview.
const BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  readonly status: number
  readonly retryAfter?: number

  constructor(status: number, message: string, retryAfter?: number) {
    super(message)
    this.status = status
    this.retryAfter = retryAfter
  }
}

async function request<T>(key: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: { 'X-API-Key': key, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, "Can't reach the Voyance API. Check that it is running.")
  }
  if (!res.ok) {
    const retry = Number(res.headers.get('Retry-After')) || undefined
    throw new ApiError(res.status, await errorText(res), retry)
  }
  const type = res.headers.get('content-type') ?? ''
  return (type.includes('json') ? res.json() : res.text()) as Promise<T>
}

async function errorText(res: Response): Promise<string> {
  if (res.status === 401) return 'That API key was not accepted.'
  try {
    const { detail } = await res.json()
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail[0]?.msg) return `${detail[0].loc?.at(-1) ?? 'value'}: ${detail[0].msg}`
  } catch {
    // body was not JSON
  }
  return `Request failed (${res.status})`
}

export function apiFor(key: string) {
  return {
    me: () => request<Me>(key, '/v1/me'),
    markets: () => request<MarketItem[]>(key, '/v1/markets'),
    audit: () => request<AuditEvent[]>(key, '/v1/audit?limit=200'),
    preview: (body: PreviewRequest, signal?: AbortSignal) =>
      request<PlanPreview>(key, '/v1/plans/preview', { method: 'POST', body: JSON.stringify(body), signal }),
    frontier: (budget: number, whatIf?: WhatIfParams, caps?: CapParams) => {
      const query = new URLSearchParams({ budget_inr: String(budget) })
      if (caps?.max_city_share != null) query.set('max_city_share', String(caps.max_city_share))
      if (caps?.max_hotel_share != null) query.set('max_hotel_share', String(caps.max_hotel_share))
      if (whatIf?.demand_change) query.set('demand_change', String(whatIf.demand_change))
      if (whatIf?.cost_change) query.set('cost_change', String(whatIf.cost_change))
      if (whatIf?.event_lift != null) query.set('event_lift', String(whatIf.event_lift))
      return request<FrontierPoint[]>(key, `/v1/frontier?${query}`)
    },
    plans: () => request<PlanSummary[]>(key, '/v1/plans?limit=20'),
    plan: (id: number) => request<PlanOut>(key, `/v1/plans/${id}`),
    createPlan: (body: PlanCreate) =>
      request<PlanOut>(key, '/v1/plans', { method: 'POST', body: JSON.stringify(body) }),
    decide: (planId: number, lineId: number, decision: Exclude<Decision, 'pending'>) =>
      request<PlanLineOut>(key, `/v1/plans/${planId}/lines/${lineId}`, {
        method: 'PATCH',
        body: JSON.stringify({ decision }),
      }),
    exportCsv: (planId: number) => request<string>(key, `/v1/plans/${planId}/export.csv`),
    position: (planId: number, asOf: string) =>
      request<PositionOut>(key, `/v1/plans/${planId}/position?as_of=${encodeURIComponent(asOf)}`),
    queue: (planId: number, asOf?: string) =>
      request<QueueOut>(key, `/v1/plans/${planId}/queue${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ''}`),
    replay: () => request<ReplayOut>(key, '/v1/replay'),
  }
}

export type Api = ReturnType<typeof apiFor>
