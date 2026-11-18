import { useState } from 'react'
import { Download } from 'lucide-react'
import type { PlanLine } from './types'
import { CITIES, CITY_INK, WEEKS, WEEK_STARTS } from './cities'
import { count, inr, sum, weekLabel } from './format'
import { StatusChip } from './StatusChip'

interface Props {
  lines: PlanLine[]
  selectedId: number
  onSelect: (id: number) => void
}

// Fixed size ramp: the dot reads before the number does
function rampSize(searches: number): number {
  if (searches >= 3000) return 13
  if (searches >= 1500) return 10
  if (searches >= 500) return 7
  return searches > 0 ? 4 : 0
}

export function BuyList({ lines, selectedId, onSelect }: Props) {
  const [city, setCity] = useState<string | null>(null)
  const shown = city ? lines.filter((line) => line.city === city) : lines

  return (
    <section className="list" aria-label="Ranked buy list">
      <div className="list-bar">
        <h2>
          Buy list <span>ranked by expected profit · {lines.length} lines</span>
        </h2>
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
        <button className="btn btn-ghost" type="button">
          <Download size={14} strokeWidth={2.25} aria-hidden="true" />
          CSV
        </button>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="c-rank" scope="col">#</th>
              <th className="c-hotel" scope="col">Hotel · week</th>
              <th className="c-run" scope="col">
                <span className="run-head" aria-label="December weeks">
                  <span className="run-month">Dec</span>
                  {WEEK_STARTS.map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </span>
              </th>
              <th className="c-soldout" scope="col">Sold-out searches</th>
              <th className="c-num" scope="col">Rooms</th>
              <th className="c-num" scope="col">Sell at</th>
              <th className="c-num" scope="col">Exp. profit</th>
              <th className="c-status" scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((line) => {
              const searches = sum(line.why.soldout_searches_past)
              const dot = rampSize(searches)
              const ink = CITY_INK[line.city]
              return (
                <tr
                  key={line.id}
                  className={`row row-${line.decision}`}
                  aria-selected={line.id === selectedId}
                  onClick={() => onSelect(line.id)}
                >
                  <td className="c-rank">{line.id}</td>
                  <td className="c-hotel">
                    <button type="button" className="row-select" onClick={() => onSelect(line.id)}>
                      <i className="city-mark" style={{ background: ink }} aria-hidden="true" />
                      <span className="hotel-name">
                        {line.city} <span>{line.hotel}</span>
                      </span>
                      <span className="hotel-week">{weekLabel(line.week)}</span>
                    </button>
                  </td>
                  <td className="c-run">
                    <span
                      className="run"
                      aria-label={`${weekLabel(line.week)}${line.why.event_week ? ', event week' : ''}`}
                    >
                      {WEEKS.map((week) =>
                        week === line.week ? (
                          <span key={week} className="on" style={{ background: ink }}>
                            {line.why.event_week && <sup className="footnote run-mark">E</sup>}
                          </span>
                        ) : (
                          <span key={week} />
                        ),
                      )}
                    </span>
                  </td>
                  <td className="c-soldout" data-label="Sold out">
                    <span className="ramp" aria-hidden="true">
                      {dot > 0 && <span style={{ width: dot, height: dot }} />}
                    </span>
                    {count(searches)}
                  </td>
                  <td className="c-num" data-label="Rooms">{line.rooms}</td>
                  <td className="c-num" data-label="Sell at">{inr(line.unit_price)}</td>
                  <td className="c-num c-profit" data-label="Profit">{inr(line.expected_profit)}</td>
                  <td className="c-status">
                    <StatusChip decision={line.decision} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="legend">
        <span>
          <sup className="footnote">E</sup> Event week this season: festival, match or concert
        </span>
        <span className="legend-ramp">
          <span className="ramp"><span style={{ width: 4, height: 4 }} /></span>
          <span className="ramp"><span style={{ width: 7, height: 7 }} /></span>
          <span className="ramp"><span style={{ width: 10, height: 10 }} /></span>
          <span className="ramp"><span style={{ width: 13, height: 13 }} /></span>
          Searches that found the hotel sold out, past 3 Decembers
        </span>
      </p>
    </section>
  )
}
