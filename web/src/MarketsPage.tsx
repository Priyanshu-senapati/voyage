import { useState } from 'react'
import type { Api } from './api/client'
import demoMarkets from './demo/markets.json'
import type { MarketItem } from './types'
import { CITIES, CITY_INK } from './cities'
import { count, inr, percent, rampSize, weekLabel } from './format'
import { useLoad } from './useLoad'

export function MarketsPage({ api }: { api: Api | null }) {
  const markets = useLoad<MarketItem[]>(api ? 'live' : 'demo', () => (api ? api.markets() : Promise.resolve(demoMarkets)))
  const [city, setCity] = useState<string | null>(null)

  return (
    <section className="page" aria-labelledby="markets-title">
      <header className="page-head">
        <h1 id="markets-title">Markets</h1>
        <p>
          Every hotel-week the planner can buy, busiest hidden demand first. Sold-out searches are people who wanted a
          room and found none: booking data never sees them.
        </p>
      </header>
      {markets.status === 'loading' && <p className="state-panel">Loading markets…</p>}
      {markets.status === 'error' && <p className="state-panel">{markets.message}</p>}
      {markets.status === 'ready' && (
        <>
          <div className="list-bar">
            <div className="filters" role="group" aria-label="Filter by city">
              <button type="button" aria-pressed={city === null} onClick={() => setCity(null)}>
                All
              </button>
              {CITIES.map((name) => (
                <button key={name} type="button" aria-pressed={city === name} onClick={() => setCity(name)}>
                  <i style={{ background: CITY_INK[name] }} aria-hidden="true" />
                  {name}
                </button>
              ))}
            </div>
          </div>
          <div className="table-wrap page-table">
            <table className="table" aria-label="Markets">
              <thead>
                <tr>
                  <th scope="col" className="c-hotel">Hotel · week</th>
                  <th scope="col" className="c-soldout">Sold-out searches</th>
                  <th scope="col" className="c-num">Booked (avg)</th>
                  <th scope="col" className="c-num">Max rooms</th>
                  <th scope="col" className="c-num">Cost / room</th>
                  <th scope="col" className="c-num">Sell at</th>
                  <th scope="col" className="c-num">Margin</th>
                </tr>
              </thead>
              <tbody>
                {[...markets.data]
                  .filter((m) => !city || m.city === city)
                  .sort((a, b) => b.soldout_searches_total - a.soldout_searches_total)
                  .map((m) => {
                    const dot = rampSize(m.soldout_searches_total)
                    return (
                      <tr key={`${m.city}|${m.week}|${m.hotel}`} className="row row-static">
                        <td className="c-hotel">
                          <span className="row-select">
                            <i className="city-mark" style={{ background: CITY_INK[m.city] }} aria-hidden="true" />
                            <span className="hotel-name">
                              {m.city} <span>{m.hotel}</span>
                            </span>
                            <span className="hotel-week">
                              {weekLabel(m.week)}
                              {m.event_this_season && (
                                <sup className="footnote" title="Event week this season">
                                  E
                                </sup>
                              )}
                            </span>
                          </span>
                        </td>
                        <td className="c-soldout">
                          <span className="ramp" aria-hidden="true">
                            {dot > 0 && <span style={{ width: dot, height: dot }} />}
                          </span>
                          {count(m.soldout_searches_total)}
                        </td>
                        <td className="c-num">{count(m.past_bookings_avg)}</td>
                        <td className="c-num">{m.max_rooms}</td>
                        <td className="c-num">{inr(m.unit_cost)}</td>
                        <td className="c-num">{inr(m.unit_price)}</td>
                        <td className="c-num">{percent((m.unit_price - m.unit_cost) / m.unit_price)}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
          <p className="legend">
            <span>
              <sup className="footnote">E</sup> Event week this season
            </span>
            <span>Simulated data · past 3 Decembers</span>
          </p>
        </>
      )}
    </section>
  )
}
