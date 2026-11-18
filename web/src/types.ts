import type { components } from './api/schema'

type Schemas = components['schemas']

export type Decision = 'pending' | 'approved' | 'rejected'
export type Me = Schemas['MeOut']
export type PlanSummary = Schemas['PlanSummary']
export type PlanCreate = Schemas['PlanCreate']
export type PlanOut = Schemas['PlanOut']
export type PlanPreview = Schemas['PlanPreview']
export type PlanLineOut = Schemas['PlanLineOut']
export type LineWhy = Schemas['LineWhy']
export type FrontierPoint = Schemas['FrontierPoint']

export interface PlanLine extends PlanLineOut {
  rank: number
}

// A saved plan, or an unsaved preview (id null) while the sliders are being tried
export interface Plan extends Omit<PlanOut, 'id' | 'created_at' | 'created_by' | 'status' | 'lines'> {
  id: number | null
  created_at: string | null
  created_by: string | null
  status: PlanOut['status']
  lines: PlanLine[]
}
