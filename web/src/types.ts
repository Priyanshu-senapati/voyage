// Mirrors voyance/api/schemas.py (the API contract). Replace with types generated from /openapi.json.

export type Decision = 'pending' | 'approved' | 'rejected'
export type PlanStatus = 'empty' | 'pending' | 'approved' | 'rejected' | 'mixed'

// Not in the API yet: requested from lane A as structured fields instead of the reason text.
export interface LineWhy {
  expected_demand: number
  booked_last_december: number
  bookings_past_decembers: number[]
  soldout_searches_past: number[]
  event_week: boolean
  margin: number
}

export interface PlanLine {
  id: number
  city: string
  week: string
  hotel: string
  rooms: number
  unit_cost: number
  unit_price: number
  expected_sold: number
  sell_through: number
  expected_profit: number
  reason: string
  decision: Decision
  decided_by: string | null
  decided_at: string | null
  why: LineWhy
}

export interface Plan {
  id: number
  created_at: string
  created_by: string
  budget_inr: number
  risk_aversion: number
  cities: string[] | null
  spend: number
  expected_profit: number
  worst_case_profit: number
  status: PlanStatus
  lines: PlanLine[]
}
