import { useState } from 'react'
import type { Api } from './api/client'
import demoMarkets from './demo/markets.json'
import type { MarketItem } from './types'
import { CITIES } from './cities'
import { count, inr, percent, weekLabel } from './format'
import { useLoad } from './useLoad'
import { InfoTip } from './ui'

export function MarketsPage({ api }: { api: Api | null }) {
  const markets = useLoad<MarketItem[]>(api ? 'live' : 'demo', () => (api ? api.markets() : Promise.resolve(demoMarkets)))
  const [city, setCity] = useState('')

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1>Markets</h1>
          <p>Every hotel-week the planner can buy, the most hidden demand first.</p>
        </div>
        <label className="inline-field">
          <span>City</span>
          <select className="select" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">All cities</option>
            {CITIES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </header>
      {markets.status === 'loading' && <div className="panel loading">Loading markets…</div>}
      {markets.status === 'error' && <div className="panel empty-state">{markets.message}</div>}
      {markets.status === 'ready' && <MarketTable items={markets.data} city={city} />}
    </div>
  )
}

function MarketTable({ items, city }: { items: MarketItem[]; city: string }) {
  const most = Math.max(...items.map((m) => m.soldout_searches_total), 1)
  const rows = items
    .filter((m) => !city || m.city === city)
    .sort((a, b) => b.soldout_searches_total - a.soldout_searches_total)
  return (
    <div className="panel table-panel">
      <table className="table" aria-label="Markets">
        <thead>
          <tr>
            <th scope="col">Hotel</th>
            <th scope="col">Week</th>
            <th scope="col" className="bar-col">
              Sold-out searches
              <InfoTip label="sold-out searches">
                Searches in the past three Decembers that found this hotel sold out: people who wanted a room and never
                show up in booking data.
              </InfoTip>
            </th>
            <th scope="col" className="num">Booked a December</th>
            <th scope="col" className="num hide-sm">Rooms on offer</th>
            <th scope="col" className="num hide-sm">Cost</th>
            <th scope="col" className="num hide-sm">Sell at</th>
            <th scope="col" className="num">Margin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={`${m.city}|${m.week}|${m.hotel}`}>
              <td>
                <strong>{m.city}</strong> <span className="muted">· {m.hotel}</span>
              </td>
              <td>
                {weekLabel(m.week)}
                {m.event_this_season && <span className="event-tag">Event</span>}
              </td>
              <td className="bar-col">
                <span className="inline-bar">
                  <span className="inline-bar-fill" style={{ width: `${(m.soldout_searches_total / most) * 100}%` }} />
                </span>
                <span className="num-inline">{count(m.soldout_searches_total)}</span>
              </td>
              <td className="num">{count(m.past_bookings_avg)}</td>
              <td className="num hide-sm">{m.max_rooms}</td>
              <td className="num hide-sm">{inr(m.unit_cost)}</td>
              <td className="num hide-sm">{inr(m.unit_price)}</td>
              <td className="num">{percent((m.unit_price - m.unit_cost) / m.unit_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
