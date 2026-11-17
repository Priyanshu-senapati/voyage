# Numbers behind the Round 1 deck and video

This page lists every figure on the slides and in the video, with its source and period.
- **Simulated results** come from `out/proof_results.csv`, which `scripts/proof_chart.py` writes.
  The deck's build script (`deck/build_round1.js`) reads that file directly.
- **The Buy Desk rows** come from `docs/sample_plan_round1.json`, real output of today's API.

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
| ₹60L | ₹15.8L | ₹13.9L | ₹15.4L | **+14%** | +3% |
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
- **+14%** expected profit vs re-buying past bookings, at a tight ₹60L budget.
- **+16%** better worst case vs re-buying, at ₹2 cr (₹17.0L vs ₹14.7L).
- **+12%** expected profit vs the same optimizer on raw bookings, at ₹2 cr (₹25.1L vs ₹22.4L).
  This is the gain from hidden demand + events.
- **18.4% vs 16.1%** profit per rupee pre-bought, vs re-buying, at ₹2 cr.
- **Even split** loses ₹10.3L at ₹2 cr.

**Risk setting:** chosen on 12 Nov, on the same 20 markets (PLAN.md). At every budget, 0.3 has a
better worst 5% than 0.4. Its expected profit is equal or higher everywhere except ₹40L, where it's
0.4 points lower. At ₹2 cr, for example, 0.3 earns ₹25.1L with a ₹17.0L worst case; 0.4 earns
₹24.7L with ₹15.0L.

## 3. Limitations
- **About even with re-buying at ₹1.2 cr.**
- **Worst case below re-buying from ₹60L to ₹1.2 cr.** For example, ₹12.9L vs ₹13.3L at ₹60L,
  and ₹18.4L vs ₹19.4L at ₹1.2 cr. It's slightly higher at ₹40L and clearly higher from ₹1.6 cr up.
- **The raw-bookings optimizer has a better worst case and fewer unsold rooms at ₹2 cr.** That's
  because it spends only ₹0.99 cr, leaving ₹2.7L of expected profit unearned.
- **Hidden demand needs event signals.** Counting sold-out searches without adjusting for past
  event weeks over-buys: "optimizer + hidden demand" alone has a worse worst case than the raw
  optimizer. Event signals correct it, so the two ship together.
- **At big budgets Voyance misses more demand** (1,275 vs 1,085 room-nights), because it skips
  rooms likely to go unsold.
- **All data is simulated.** Today the data interface returns the simulator's market. Using TBO's
  data needs search logs that record sold-out results, and wiring them in is Round 2 work.
- **Scale is measured on 40 hotel-weeks.** The optimizer's model is sized for hundreds of items and
  a few hundred scenarios. In Round 2 we split the work by city and load-test at TBO's catalogue size.

## 4. Tech claims (measured 18 Nov 2026, on a laptop, at commit be62864)

| Claim | Evidence |
|---|---|
| 72 automated tests | `python -m pytest -q`: 72 passed in 12.6 s |
| 0.2 s for one buy plan over 40 hotel-weeks | `voyance.api.planner.build_plan` on the demo data, ₹2 cr, risk 0.3: 0.215 s (best of 5, after a warm-up) |
| Built today | Hidden demand (`voyance/demand.py`). Expected profit vs worst-5% optimizer, HiGHS (`voyance/optimizer.py`). Plan lines with reasons (`voyance/api/planner.py`). Buy Desk API (`voyance/api/`): API keys, buyer / approver / admin roles, approvals, audit log, tenant isolation, rate limits, CSV export, SQLite through SQLAlchemy |
| Round 2 | Go collector, Kafka/Redpanda, ClickHouse, Postgres, Redis, LightGBM demand range + SHAP, price tiers, webhooks, React dashboard |

[q4fy26]: https://tbo-static-files.s3.eu-west-1.amazonaws.com/tbo-investor-relations/Financial-Reporting/Quarterly-Results/2025-26/Others/Q4/Press-Release.pdf
[q2fy27]: https://tbo-static-files.s3.eu-west-1.amazonaws.com/tbo-investor-relations/Financial-Reporting/Quarterly-Results/2026-27/Others/Q2/Press-Release.pdf
[wb]: https://www.whalesbook.com/corporate-news/English/transportation/TBO-Tek-FY26-Revenue-Rs-2677-Crore-Profit-Rs-244-Crore/6a184c7a0c0232fe81aa1bb0
