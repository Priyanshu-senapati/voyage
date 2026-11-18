import type { Decision, MarketItem, PlanCreate, PlanLineOut, PlanSummary } from '../types'
import type { components } from './schema'

type PlanOut = components['schemas']['PlanOut']

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
  } catch {
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
    markets: () => request<MarketItem[]>(key, '/v1/markets'),
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
  }
}

export type Api = ReturnType<typeof apiFor>
