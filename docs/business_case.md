# Business case

Who pays, how much it's worth to TBO in rupees, and how it goes to market. Every figure carries its
source or is marked as an assumption. The sizing is reproducible from `out/decision_backtest.json`
(section 2).

## 1. In one line
**For every 1% of TBO's hotel sales it buys ahead, Voyance is worth about ₹4.5–6.3 cr a year in
extra profit.** That's 1.1–1.5% of TBO's FY26 adjusted EBITDA.

The same buying also turns away a third to almost half fewer room-nights on the dates agents want,
while leaving fewer rooms unsold.

## 2. Why pre-buying matters to TBO
- **Hotels are TBO's growth and profit engine.**
  - **Growth:** hotels + ancillaries were **67% of GTV (₹7,889 cr of ₹11,695 cr) in Q2 FY27, up 39%**
    year on year [TBO, 2 Nov 2026][q2fy27].
  - **Profit:** in Q2 FY26 the segment was 64% of GTV but **about 87% of gross profit**, at a take
    rate of about 8.5% (7.9% in Q1 FY27). These figures come from broker notes reported in the press
    [1][2], not TBO's filings. Verify them against TBO's investor presentation before quoting them on stage.
- **Pre-bought rooms earn the contract discount, not a commission.**
  - Wholesale and allotment rates commonly run **15–40% below public rates**, per industry guides,
    mostly from vendors [3][4][5].
  - On the share TBO buys ahead, that is roughly 2–5× its hotel take rate, but TBO carries the risk
    of rooms going unsold.
- **That risk is the problem the brief sets:**
  - plan the pre-buy;
  - maximise bookable inventory;
  - maximise risk-adjusted profit within a maximum budget.
- **Voyance's job:** make the pre-buy pay by buying where demand is hidden, skipping what won't
  sell, and saying by when.

## 3. Sizing: what Voyance adds, per 1% of hotel sales bought ahead
**Inputs:**

| Input | Value | Source |
|---|---|---|
| Hotels + ancillaries GTV, yearly run-rate | ₹31,556 cr (₹7,889 cr × 4) | [TBO Q2 FY27][q2fy27]; annualising one quarter is an assumption |
| 1% of that, bought ahead | ₹315.6 cr of yearly hotel sales | arithmetic |
| Contract margin on pre-bought rooms | 15%, 20% or 30% | assumption, inside the industry range above |
| Status quo | "re-buy last year": the same rooms as the same week last year | the baseline in the real-data test |
| Voyance's gain over the status quo | +6.7% to +12.6% profit; every 95% interval above zero | `out/decision_backtest.json`: walk-forward on real 2017 bookings, 2 Portuguese hotels (`docs/numbers.md`, section 4) |
| FY26 adjusted EBITDA | ₹414 cr | [TBO, 28 May 2026][q4fy26] |

**Method.**
1. The status quo's realised margin on its sales is 11.5–27.2%. That's after its unsold rooms, which
   are lost at cost, computed from the test's rooms bought and unsold.
2. Voyance's gain multiplies that profit.
3. **Extra profit = ₹315.6 cr × realised margin × gain.**

It assumes equal room prices within a hotel-week mix, so it's an approximation.

**Results:**

| Buying lead | Margin 15% | Margin 20% | Margin 30% |
|---|---|---|---|
| 90 days ahead | ₹4.6 cr | ₹5.2 cr | ₹6.3 cr |
| 120 days ahead | ₹4.5 cr | ₹5.1 cr | ₹6.2 cr |
| 150 days ahead | ₹4.6 cr | ₹5.0 cr | ₹5.7 cr |

These are extra profit per year, per 1% of hotel sales bought ahead.

**Scaling:**

| Share of hotel sales TBO buys ahead | Extra profit a year | Share of FY26 adj. EBITDA |
|---|---|---|
| 1% | ₹4.5–6.3 cr | 1.1–1.5% |
| 5% | ₹23–32 cr | 5–8% |
| 10% | ₹45–63 cr | 11–15% |

**Availability** (the brief's headline), from the same real-data test:
- 4–6% more rooms bought;
- **35–46% fewer room-nights turned away**;
- **13–18% fewer rooms left unsold**.

These are the rooms that go to TBO's agents on the dates that sell out.

**Read with care:**
- **The gain is from Voyance's demand forecast,** which isn't yet wired into the planner. The
  planner at its default caution didn't reliably beat the status quo on this data
  (`docs/numbers.md`, sections 4–5). Wiring the forecast in is the first Round 2 engine task.
- **The data is from Portugal, not India,** and the status quo is a simple rule.
- **TBO's real share of pre-bought inventory isn't public,** so the table is per 1%.

A shadow pilot (`docs/pilot_plan.md`) replaces every assumption here with TBO's own numbers.

## 4. Who pays and how much
| Line | Customer | What they get | Pricing (proposal) | Proof point to earn it |
|---|---|---|---|---|
| **Buy Desk** | TBO's contracting and revenue team | A ranked, risk-capped buy plan, approvals, audit | Internal: TBO keeps 100% of the uplift above. Run cost is cloud only; the demo already runs on Google Cloud Run | Shadow pilot beats the holdout |
| **Peak Access** | TBO's 34,529 monthly transacting buyers (Q2 FY27) [q2fy27] | Guaranteed rooms on dates the market sells out | A premium per booking on sold-out dates, or a paid tier for agencies. Size it in the pilot: take-up × premium | The 35–46% fewer room-nights turned away become sellable stock |
| **White-label** | DMCs and tour operators that hold their own allotments | The Buy Desk on their own budget | Platform fee + a **success fee: a share of the measured uplift against a holdout** they keep running | Uplift measured exactly as in the real-data test |

**Pricing benchmarks.**
- Hotel revenue-management tools are priced per room and by quote. IDeaS doesn't publish prices;
  smaller tools list from about $9–20 a month per small property [6].
- Those tools serve one hotel. Voyance serves the **buyer of many hotels**, so value-based pricing (a
  success fee) fits better than per-room pricing.

## 5. Go-to-market
| Phase | When | What happens | Gate to the next phase |
|---|---|---|---|
| 0. Shadow | One season, one city | Voyance plans beside TBO's buyers; nothing is bought on its advice; sold-out searches start being logged if they aren't already | Voyance's plan beats the buyers' and the holdout on profit, unsold rooms and rooms turned away |
| 1. Live, one city | Next season | Buyers approve Voyance lines; **releasable (soft) allotments first** | Profit uplift and unsold rate hold with real money |
| 2. Live, more cities + Peak Access | Year 1 | Roll out city by city; open Peak Access to agencies on sold-out dates | Agency take-up and premium |
| 3. White-label | Year 2 | Sold through TBO to DMCs and tour operators, as new revenue for TBO | Customers keep paying the success fee |

## 6. Why this fits an asset-light TBO
Buying ahead adds inventory risk, so Voyance caps it at every step:
- **Budget cap:** TBO sets the maximum budget, and the plan never exceeds it (tested).
- **Risk setting:** the worst 5% of seasons is part of the objective, so TBO picks how much bad-season
  risk to accept.
- **Release value:** start with releasable allotments. The engine already values unsold rooms that
  can be released (`salvage`).
- **Sign-off on every line,** with an audit log.
- **Shadow first:** no money moves until the pilot proves it.

## 7. Why us, and the moat
- **The moat is TBO's data, not ours.** TBO sees the searches of 34,529 buyers across hundreds of
  thousands of hotels, including every search that hits "sold out". No single hotel or airline sees
  demand across a network like this.
- **Voyance turns that data into a buy list:** hidden demand from sold-outs and look-to-book, the
  brief's own words. It's sized for risk, timed by buy-by dates, and explained line by line.
- **The working product exists today:** a live demo, an API with approvals and audit, 179 automated
  tests, and a real-data test.

## Sources
- [q2fy27]: TBO Tek press release, Q2 FY27 (2 Nov 2026): https://tbo-static-files.s3.eu-west-1.amazonaws.com/tbo-investor-relations/Financial-Reporting/Quarterly-Results/2026-27/Others/Q2/Press-Release.pdf
- [q4fy26]: TBO Tek press release, Q4 FY26 (28 May 2026): https://tbo-static-files.s3.eu-west-1.amazonaws.com/tbo-investor-relations/Financial-Reporting/Quarterly-Results/2025-26/Others/Q4/Press-Release.pdf
- [1]: Q2 FY26 segment mix and take rate (secondary): https://www.travelturtle.world/?p=29185
- [2]: Q1 FY27 take rates, broker note (secondary): https://askfuzz.ai/discover/news/companies/tbo-tek-q1-fy27-net-profit-surges-32-38-to-83-36-crore
- [3]: Wholesale hotel rates guide (vendor): https://dmcquote.com/guides/how-to-get-wholesale-hotel-rates
- [4]: Hotel net rate, definition and examples (vendor): https://www.mews.com/en/blog/hotel-net-rate
- [5]: Allotment (travel industry): https://en.wikipedia.org/wiki/Allotment_(travel_industry)
- [6]: IDeaS G3 RMS pricing overview and alternatives (G2): https://www.g2.com/products/ideas-g3-rms/pricing

[q2fy27]: https://tbo-static-files.s3.eu-west-1.amazonaws.com/tbo-investor-relations/Financial-Reporting/Quarterly-Results/2026-27/Others/Q2/Press-Release.pdf
[q4fy26]: https://tbo-static-files.s3.eu-west-1.amazonaws.com/tbo-investor-relations/Financial-Reporting/Quarterly-Results/2025-26/Others/Q4/Press-Release.pdf
