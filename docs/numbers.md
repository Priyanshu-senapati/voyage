# Numbers behind the Round 1 deck and video

This page lists every figure on the slides and in the video, with its source and period.
- **Simulated results** come from `out/proof_results.csv`, which `scripts/proof_chart.py` writes.
  The deck's build script (`deck/build_round1.js`) reads that file directly.
- **The real-data results** come from `out/decision_backtest.json` and `out/calibration.json`, which
  lane A's `scripts/forecast_backtest.py` and `scripts/calibrate.py` write. The build script reads both.
- **The Buy Desk screenshot** is the live demo (section 7), captured on 19 Nov with
  `web/scripts/capture.mjs` and cropped (`deck/README.md`). It shows one simulated December.
  `docs/sample_plan_round1.json` keeps the same plan as raw API output.

## 1. TBO's scale (from TBO's own press releases)

| Figure | Value | Period | Source |
|---|---|---|---|
| Gross transaction value (GTV) | **₹36,809 cr, +19% YoY** | FY26 (Apr 2025 – Mar 2026) | [TBO press release, 28 May 2026][q4fy26] |
| Adjusted EBITDA | ₹414 cr, +26% YoY | FY26 | [TBO press release, 28 May 2026][q4fy26] |
| Q4 revenue growth driver | "a 90% YoY increase in the revenue for the Hotels + Ancillaries segment" | Q4 FY26 | [TBO press release, 28 May 2026][q4fy26] |
| GTV | ₹11,695 cr, +31% YoY | Q2 FY27 (Jul – Sep 2026) | [TBO press release, 2 Nov 2026][q2fy27] |
| Hotels + Ancillary GTV | **₹7,889 cr, +39% YoY (67% of GTV)** | Q2 FY27 | [TBO press release, 2 Nov 2026][q2fy27] |
| Airlines GTV | ₹3,807 cr, +18% YoY | Q2 FY27 | [TBO press release, 2 Nov 2026][q2fy27] |
| Monthly transacting buyers | **34,529, +13% YoY** (32,751 in Q4 FY26) | Q2 FY27 | [TBO press release, 2 Nov 2026][q2fy27] |
| Revenue from operations | ₹2,677.5 cr | FY26 | Secondary source ([Whalesbook][wb]); not on a slide |

On the slide: *"Hotels + ancillaries are 67% of TBO's GTV (₹7,889 cr of ₹11,695 cr, Q2 FY27), up 39%
year on year, twice air's 18%."*

## 2. Simulated results (not TBO data)

### Setup
- **20 simulated markets** (seeds 0–19). Each one has:
  - 40 hotel-weeks: 5 Indian cities × 4 December weeks × 2 hotels;
  - its own costs, prices and demand;
  - 3 past Decembers of bookings and sold-out searches.
- **Same inputs, same test for every strategy.** Each plans from the same 3 past seasons. Each is
  then scored on the same **500 unseen Decembers**, and the results are averaged over the 20 markets.
- **Worst case** = the average profit in the worst 5% of those Decembers.
- **The planner knows which weeks have events,** not how big they are.
- **Strategies compared:**
  - **Voyance:** the optimizer + hidden demand + events, at risk setting 0.3.
  - **Re-buy past bookings:** the average of the 3 past seasons, scaled down to fit the budget.
  - **Our optimizer, raw bookings:** the same optimizer, without hidden demand or events.
  - **Even split:** the same rupees on every hotel-week.

### Expected profit

| Budget | Voyance | Re-buy past bookings | Our optimizer, raw bookings | Voyance vs re-buy | Voyance vs raw optimizer |
|---|---|---|---|---|---|
| ₹40L | ₹11.4L | ₹9.2L | ₹11.1L | **+24%** (worst case ₹9.3L vs ₹9.1L, +2%) | +2% |
| ₹60L | ₹15.8L | ₹13.9L | ₹15.4L | +14% (worst case −3%) | +3% |
| ₹1.2 cr | ₹24.5L | ₹24.6L | ₹22.4L | about even (−0.3%) | +9% |
| ₹2 cr | ₹25.1L | ₹24.4L | ₹22.4L | +3% | **+12%** |

### At ₹2 cr, a generous budget

| Measure | Voyance | Re-buy past bookings | Our optimizer, raw bookings | Even split |
|---|---|---|---|---|
| Expected profit | **₹25.1L** | ₹24.4L | ₹22.4L | **−₹10.3L** (a loss) |
| Worst case (worst 5%) | ₹17.0L | ₹14.7L | ₹19.2L | −₹22.9L |
| Money spent | ₹1.36 cr | ₹1.52 cr | ₹0.99 cr | ₹1.98 cr |
| Profit per rupee spent | 18.4% | 16.1% | 22.6% | negative |
| Unsold room-nights | 101 | 148 | 17 | 878 |
| Missed room-nights (demand with no room) | 1,275 | 1,085 | 1,785 | 859 |

### On the slides
- **+24%** expected profit vs re-buying past bookings, at a tight ₹40L budget (₹11.4L vs ₹9.2L).
  Most of that comes from optimizing the mix at all: the same optimizer on raw bookings already
  earns +21% there. What hidden demand + events add on their own is the +12% below.
- **+16%** better worst case vs re-buying, at ₹2 cr (₹17.0L vs ₹14.7L).
- **+12%** expected profit vs the same optimizer on raw bookings, at ₹2 cr (₹25.1L vs ₹22.4L).
  This is hidden demand and event flags together. Hidden demand alone does worse than raw
  bookings (section 5).
- **+3% profit on ₹15L less spend, with 32% fewer unsold rooms (101 vs 148)**, vs re-buying at ₹2 cr
  (the Buy Desk line under "How it makes money").
- **Even split** loses ₹10.3L at ₹2 cr.

**Risk setting 0.3 vs no caution (risk 0):** chosen on 12 Nov on the same 20 markets (PLAN.md).
At every budget, 0.3 has the better worst 5%. Its expected profit is equal or higher everywhere
except ₹40L, where it's 0.4% lower. Re-run on 19 Nov at two budgets:

| Budget | Risk 0.3: expected / worst 5% | Risk 0: expected / worst 5% |
|---|---|---|
| ₹40L | ₹11.36L / ₹9.33L | ₹11.40L / ₹8.74L |
| ₹2 cr | ₹25.07L / ₹17.00L | ₹24.66L / ₹14.99L |

**What the video says instead.** It shows the risk curve on the demo plan (₹2 cr, one simulated
market, `web/src/demo/frontier-2cr.json`). There, caution 0.3 gives up ₹0.25L of expected profit
(₹24.99L → ₹24.74L) to lift the bad-season profit by ₹1.46L (₹18.58L → ₹20.04L).
- **Why not "the slider pays for itself":** the 20-market average above shows a small gain at ₹2 cr,
  but on real bookings caution applied one week at a time gave up profit (section 4).

## 3. The simulator, checked against real bookings

Lane A compared the simulator with a public dataset of real hotel bookings
(`python scripts/calibrate.py` downloads it once, checks its SHA-256 and writes `out/calibration.json`).
- **Dataset:** N. Antonio, A. de Almeida, L. Nunes (2019), "Hotel booking demand datasets",
  *Data in Brief* 22: 41–49, [doi:10.1016/j.dib.2018.11.126][hbd], licence CC BY 4.0.
- **Coverage:** two hotels in Portugal, July 2015 – August 2017. "Agent" means bookings through
  travel agents and tour operators.

| Measure | Real bookings | Our simulator |
|---|---|---|
| Bookings in the dataset | 119,390 | n/a |
| Share booked through travel agents and tour operators (TBO's channel) | 82% | n/a |
| **Christmas week (22–28 Dec) vs the December average** | **1.45×** | **1.47×** |
| Each December week vs the December average (1–7 / 8–14 / 15–21 / 22–28 Dec) | 1.16 / 0.68 / 0.70 / 1.45 | 0.65 / 0.82 / 1.06 / 1.47 |
| **How much a week's agent demand swings from one year to the next** (coefficient of variation) | **22%** (124 week pairs) | **35%** |
| Agent bookings later cancelled | 41% | n/a |
| Median days ahead that agent bookings are made | 59 | n/a |

In slide 2's speaker notes: the simulator matches the real Christmas-week peak (1.45× vs our 1.47×).

**What it shows:**
- The Christmas-week peak matches the real data. That's 1 of the 4 weeks: early December doesn't match (below).
- Real demand swings less from year to year than our simulated demand (22% vs 35%).
- Most hotel bookings in the dataset (82%) come through agents and tour operators, the channel TBO sells through.
- Pre-buying is risky. 41% of agent bookings were cancelled, and they arrive about two months ahead,
  so the buy decision is made about two months out.

**What it doesn't show (say so if asked):**
- **It's Portugal, not India,** and only two hotels.
- **Real early December is busier than ours** (1.16× vs 0.65× for 1–7 Dec). There are only 4
  hotel-years of December data (2 hotels × Dec 2015 and Dec 2016), so that shape is rough.
- **It checks the simulator, not Voyance.** The dataset has bookings only, no searches, so hidden
  demand itself isn't tested on real data.

## 4. Buying decisions tested on real bookings

Lane A scored buying strategies on the same real dataset, **walk-forward**: each decision uses only
what was known on the day it was made (`python scripts/forecast_backtest.py` writes
`out/decision_backtest.json` and `out/forecast_backtest.json`).
- **Test set:** Jan–Aug 2017, 2 hotels × 34 weeks = 68 hotel-weeks.
- **What's compared:** 3 buying leads (90, 120 and 150 days ahead) × 3 assumed contract margins (15%,
  20% and 30%), so 9 tests.
  - The buys are the same across margins, so these are 3 sets of decisions, each priced 3 ways.
  - The test period has no December.
- **Strategies:**
  - **Re-buy last year:** last year's rooms for that week.
  - **Our likely forecast:** a LightGBM model on the booking curve.
  - **Our optimizer:** on the forecast's low–high range, at risk 0 and at 0.3.

| Lead | Margin | Our forecast vs re-buy (95% interval) | Optimizer, risk 0.3 | Optimizer, risk 0 |
|---|---|---|---|---|
| 90 days | 15% | **+12.6%** (+3.4% to +22.7%) | +14.6% | +20.0% |
| 90 days | 20% | **+9.8%** (+3.3% to +16.1%) | +5.6% | +12.4% |
| 90 days | 30% | **+7.4%** (+3.7% to +10.8%) | −1.7% | +7.7% |
| 120 days | 15% | **+12.4%** (+3.1% to +22.6%) | +2.3% | +12.0% |
| 120 days | 20% | **+9.6%** (+3.4% to +16.4%) | −5.6% | +6.3% |
| 120 days | 30% | **+7.3%** (+3.4% to +11.4%) | −11.7% | +4.0% |
| 150 days | 15% | **+12.6%** (+4.3% to +23.3%) | −6.4% | +5.4% |
| 150 days | 20% | **+9.4%** (+3.7% to +16.2%) | −13.6% | +0.8% |
| 150 days | 30% | **+6.7%** (+3.2% to +10.6%) | −18.9% | +0.7% |

- **Rooms:** buying by the forecast left 13–18% fewer rooms unsold and turned away 35–46% fewer
  room-nights than re-buying.
- **Forecast accuracy:** at 90–150 days ahead it missed 2017's demand by 9.5–10.7% (WAPE), vs 15.5%
  for re-buying last year. Its low–high range held the actual 72–79% of the time.

On the slide (2): *"+7–13%. Real data: our forecast (not yet in plans) vs re-buying last year.
Jan–Aug 2017 bookings, 2 hotels in Portugal, buying 90–150 days ahead at 15–30% margins: ahead every
time, 13–18% fewer unsold rooms."* The build script computes these from the JSON, and refuses to build if any 95% interval
touches zero.

**Say so if asked:**
- **The real-data win is the forecast's, not the optimizer's.** The optimizer at risk 0.3 beats
  re-buying only at 90 days with thin margins, and loses at longer leads. Lane A's explanation: here
  the caution is applied one week at a time instead of to a whole plan, and 2 hotels with 18 months
  of history can't calibrate the range yet.
- **Re-buying last year is a naive rule.** It ignores what's already on the books.
- **It's still 2 Portuguese hotels.** The dataset has no searches, so hidden demand isn't part of
  this test.

## 5. Limitations
- **About even with re-buying at ₹1.2 cr.**
- **Worst case below re-buying from ₹60L to ₹1.2 cr.** For example, ₹12.9L vs ₹13.3L at ₹60L,
  and ₹18.4L vs ₹19.4L at ₹1.2 cr. It's slightly higher at ₹40L and clearly higher from ₹1.6 cr up.
- **The raw-bookings optimizer has a better worst case and fewer unsold rooms at ₹2 cr.** That's
  because it spends only ₹0.99 cr, leaving ₹2.7L of expected profit unearned.
- **Event weeks are simulated flags today.** The planner is told which weeks have events (not how
  big they are). No festival or holiday calendar is wired in yet. The calendar
  (`data/events/events.csv`) and the ingest are Round 2.
- **At ₹40L to ₹1.2 cr, Voyance leaves more rooms unsold than re-buying** (e.g. 57 vs 46 at ₹1.2 cr).
  It leaves fewer only from ₹1.6 cr up.
- **Hidden demand needs event signals.** Counting sold-out searches without adjusting for past
  event weeks over-buys: "optimizer + hidden demand" alone has a worse worst case than the raw
  optimizer. Event signals correct it, so the two ship together.
- **At big budgets Voyance misses more demand** (1,275 vs 1,085 room-nights), because it skips
  rooms likely to go unsold.
- **Voyance's own results are simulated.** Today the data interface returns the simulator's market.
  The simulator's December peak and year-to-year swing are checked against real bookings (section 3).
  The forecast is tested on real bookings (section 4) but doesn't feed the plans yet. Using TBO's data
  needs search logs that record sold-out results, and wiring them in is Round 2 work.
- **On real bookings, the cautious optimizer didn't reliably beat re-buying** (section 4). The
  real-data win is the forecast's.
- **Scale is measured on 40 hotel-weeks.** The optimizer's model is sized for hundreds of items and
  a few hundred scenarios. In Round 2 we split the work by city and load-test at TBO's catalogue size.

## 6. Tech claims (measured 19 Nov 2026, on a laptop)

| Claim | Evidence |
|---|---|
| 179 automated tests | `python -m pytest -q`: 179 passed in 45.3 s. Run on `pitch/round1` after merging main at 88bc694 |
| 0.2 s for one buy plan over 40 hotel-weeks | `voyance.api.planner.build_plan` on the demo data, risk 0.3, best of 5 after a warm-up, at the same merge: 0.14 s at ₹40L, 0.19 s at ₹60L, 0.21 s at ₹1.2 cr, 0.21 s at ₹2 cr |
| Built today | **Engine:**<br>- Hidden demand (`voyance/demand.py`)<br>- Expected profit vs worst-5% optimizer, HiGHS (`voyance/optimizer.py`)<br>- Plan lines with reasons, a buy-by date and a worst case each, plus city and hotel caps (`voyance/api/planner.py`)<br>- Demand forecast, LightGBM low / likely / high with SHAP reasons (`voyance/forecast.py`)<br>- Real-data tests (`voyance/calibrate.py`, `voyance/backtest.py`)<br>**Buy Desk API** (`voyance/api/`): API keys, buyer / approver / admin roles, approvals, audit log, tenant isolation, rate limits, CSV export, what-if previews, risk frontier, an action queue, SQLite through SQLAlchemy.<br>**Dashboard** (`web/`, React + TypeScript): Buy Desk plan and review, Plans, Markets, Audit log, what-ifs.<br>**Hosted demo** (`Dockerfile`, `deploy/`) |
| Not built yet | The forecast feeding the plans, bulk approve, webhooks, price tiers |
| Round 2 | Go collector, Kafka/Redpanda, ClickHouse, Postgres, Redis, the forecast in the plans, price tiers, webhooks |

## 7. Live demo

https://voyance-1029341879804.asia-south1.run.app (Google Cloud Run, Mumbai; on slide 4).
- **Data:** demo data only.
- **Resets:** the database is wiped and re-seeded on every deploy.
- **Demo keys are public:** the "sign in as" keys are shown to every visitor, so anyone can approve
  plans in the demo company.

[q4fy26]: https://tbo-static-files.s3.eu-west-1.amazonaws.com/tbo-investor-relations/Financial-Reporting/Quarterly-Results/2025-26/Others/Q4/Press-Release.pdf
[q2fy27]: https://tbo-static-files.s3.eu-west-1.amazonaws.com/tbo-investor-relations/Financial-Reporting/Quarterly-Results/2026-27/Others/Q2/Press-Release.pdf
[hbd]: https://doi.org/10.1016/j.dib.2018.11.126
[wb]: https://www.whalesbook.com/corporate-news/English/transportation/TBO-Tek-FY26-Revenue-Rs-2677-Crore-Profit-Rs-244-Crore/6a184c7a0c0232fe81aa1bb0
