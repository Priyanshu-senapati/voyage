import type { LineWhy, MarketItem, PlanLineOut } from './types'

const DEMAND = /expected demand ([\d,.]+) room-nights vs ([\d,.]+) booked last December/
const SEARCHES = /([\d,]+) sold-out searches/
const num = (s: string) => Number(s.replace(/,/g, ''))

export const marketKey = (m: { city: string; week: string; hotel: string }) => `${m.city}|${m.week}|${m.hotel}`

// Rebuild a line's facts from the planner's reason text and the market it was bought in.
export function deriveWhy(line: PlanLineOut, market?: MarketItem): LineWhy {
  const demand = line.reason.match(DEMAND)
  const searches = line.reason.match(SEARCHES)
  return {
    expected_demand: demand ? num(demand[1]) : line.expected_sold,
    booked_last_december: demand ? num(demand[2]) : 0,
    soldout_searches_total: market?.soldout_searches_total ?? (searches ? num(searches[1]) : 0),
    event_week: market?.event_this_season ?? line.reason.includes('event week'),
    margin: (line.unit_price - line.unit_cost) / line.unit_price,
    booked_avg: market?.past_bookings_avg,
  }
}
