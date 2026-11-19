import type { components } from './api/schema'

type Schemas = components['schemas']

export type Decision = 'pending' | 'approved' | 'rejected'
export type Me = Schemas['MeOut']
export type PlanSummary = Schemas['PlanSummary']
export type PlanCreate = Schemas['PlanCreate']
export type PlanOut = Schemas['PlanOut']
export type PlanPreview = Schemas['PlanPreview']
export type PreviewRequest = Schemas['PreviewRequest']
export type PlanLineOut = Schemas['PlanLineOut']
export type LineWhy = Schemas['LineWhy']
export type FrontierPoint = Schemas['FrontierPoint']
export type MarketItem = Schemas['MarketItem']
export type AuditEvent = Schemas['AuditOut']

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

export type PositionOut = Schemas['PositionOut']
// The demo's stored readings leave out the API's sentence: the page writes its own from the numbers
export type PositionLine = Omit<Schemas['PositionLineOut'], 'note'>
export type Position = Omit<PositionOut, 'lines'> & { lines: PositionLine[] }
export type ReplayOut = Schemas['ReplayOut']
export type ReplayWeek = Schemas['ReplayWeek']
export type ReplayOutcome = Schemas['ReplayOutcome']
export type QueueOut = Schemas['QueueOut']
export type QueueItem = Schemas['QueueItem']
export type PassedOut = Schemas['PassedOut']
export type ExposureOut = Schemas['ExposureOut']
export type LimitedBy = PlanLineOut['limited_by']
