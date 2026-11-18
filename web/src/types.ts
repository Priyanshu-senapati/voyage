import type { components } from './api/schema'

type Schemas = components['schemas']

export type Decision = 'pending' | 'approved' | 'rejected'
export type PlanSummary = Schemas['PlanSummary']
export type PlanCreate = Schemas['PlanCreate']
export type MarketItem = Schemas['MarketItem']
export type PlanLineOut = Schemas['PlanLineOut']

// The facts behind a line's reason. Not in the API yet (requested from lane A), so for live plans
// they are rebuilt from the reason text and /v1/markets; the demo fixture carries them in full.
export interface LineWhy {
  expected_demand: number
  booked_last_december: number
  soldout_searches_total: number
  event_week: boolean
  margin: number
  booked_avg?: number
  bookings_past_decembers?: number[]
  soldout_searches_past?: number[]
}

export interface PlanLine extends PlanLineOut {
  rank: number
  why: LineWhy
}

export interface Plan extends Omit<Schemas['PlanOut'], 'lines'> {
  lines: PlanLine[]
}
