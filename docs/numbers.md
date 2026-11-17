# Numbers sheet: Round 1 deck and video

Every number on a slide or in the video comes from this page. Each one has a source and a period.
Lane C keeps this page. Lane A checks the simulated results and the tech claims.

## 1. TBO's scale (real, from TBO's own press releases)

| Figure | Value | Period | Source |
|---|---|---|---|
| Gross transaction value (GTV) | **₹36,809 cr, +19% YoY** | FY26 (Apr 2025 – Mar 2026) | [TBO press release, 28 May 2026][q4fy26] |
| Adjusted EBITDA | ₹414 cr, +26% YoY | FY26 | [TBO press release, 28 May 2026][q4fy26] |
| Q4 revenue growth driver | "a 90% YoY increase in the revenue for the Hotels + Ancillaries segment" | Q4 FY26 | [TBO press release, 28 May 2026][q4fy26] |
| Revenue from operations | ₹2,677.5 cr | FY26 | Secondary ([Whalesbook][wb]); confirm in the audited results on BSE before using |
| GTV | ₹11,695 cr, +31% YoY | Q2 FY27 (Jul – Sep 2026) | [TBO press release, 2 Nov 2026][q2fy27] |
| Hotels + Ancillary GTV | **₹7,889 cr, +39% YoY (67% of GTV)** | Q2 FY27 | [TBO press release, 2 Nov 2026][q2fy27] |
| Airlines GTV | ₹3,807 cr, +18% YoY | Q2 FY27 | [TBO press release, 2 Nov 2026][q2fy27] |
| Monthly transacting buyers | **34,529, +13% YoY** | Q2 FY27 | [TBO press release, 2 Nov 2026][q2fy27] |

**Corrections to PLAN.md:**
- PLAN.md's 32,751 buyers is the Q4 FY26 figure (Jan – Mar 2026). It's not for the full year. The
  newest figure is **34,529 (Q2 FY27)**. Use that, and always say which quarter it's from.
- ₹36,809 cr GTV (+19%) is confirmed for FY26.
- "Hotels + Ancillaries is the fastest-growing segment" is confirmed. In Q2 FY27 hotels grew 39%,
  air grew 18%, and hotels were two-thirds of GTV.

How we say it on the slide: *"Hotels are two-thirds of TBO's ₹11,695 cr quarterly GTV and growing
39% a year (Q2 FY27)."*

## 2. Simulated results (from `out/proof_results.csv`)

**Label every one of these "simulated, not TBO data".** The setup:
- 20 simulated December seasons, 40 hotel-weeks across 5 Indian cities.
- Every method sees the same 3 past seasons.
- The planner knows when events happen but not how big they are.
- "Our planner" is `Optimizer + hidden demand + events` at risk setting 0.3.
- The baseline is `Repeat past bookings`: re-buying what sold last year.

| Budget | Our planner (expected profit) | Re-buy past bookings | Difference |
|---|---|---|---|
| ₹60L | ₹15.8L | ₹13.9L | **+14%** |
| ₹1.2 cr | ₹24.5L | ₹24.6L | about even (−0.3%) |
| ₹2 cr | ₹25.1L | ₹24.4L | +3% |

At ₹2 cr, the generous budget:

| Measure | Our planner | Re-buy past bookings | Even split of the budget |
|---|---|---|---|
| Expected profit | ₹25.1L | ₹24.4L | **−₹10.3L (a loss)** |
| Worst case (average of the worst 5% of seasons) | **₹17.0L** | ₹14.7L | −₹22.9L |
| Money spent | **₹1.36 cr** | ₹1.52 cr | ₹1.98 cr |
| Profit per rupee spent | **18.4%** | 16.1% | negative |
| Unsold room-nights | **101** | 148 | 878 |
| Missed room-nights (demand we had no room for) | 1,275 | 1,085 | 859 |

The slide callouts we use:
- **+14%** expected profit at a tight ₹60L budget.
- **+16%** better worst case at ₹2 cr (₹17.0L vs ₹14.7L).
- **−32%** unsold room-nights at ₹2 cr (101 vs 148).

"The risk slider pays for itself" (PLAN.md, tested 12 Nov on the same 20 seeds): at ₹2 cr the
cautious setting (0.3) earns ₹25.1L vs ₹24.7L at 0.4, and its worst case is ₹17.0L vs ₹15.0L.
So caution costs nothing here.

### Weak spots (don't overclaim; prepare answers)
- At ₹1.2 cr our planner is **about even** with re-buying (the chart says so in its subtitle).
- Our worst case is **lower** than re-buying at every budget from ₹60L to ₹1.2 cr. For example,
  ₹12.9L vs ₹13.3L at ₹60L, and ₹18.4L vs ₹19.4L at ₹1.2 cr. It's slightly higher at ₹40L and
  clearly higher from ₹1.6 cr up.
- "Optimizer + hidden demand" *without* event signals has a worse worst case than the optimizer on
  raw bookings. Hidden demand alone over-buys. Event signals are what make it safe. If a judge asks,
  this is why the two belong together.
- At big budgets we **miss more demand** (1,275 vs 1,085 room-nights), because we spend less. That's
  deliberate: the rooms we skip are the ones likely to go unsold.
- Honest pitch line: *strong when money is tight, safer when money is loose*.

## 3. Tech claims (lane A to confirm before submission)

| Claim on slide 2 | Source | Status |
|---|---|---|
| Under 1 s to plan a whole December across 5 cities | Measured 18 Nov: `voyance.sim.run(seed=1, budget=2e7)` took 0.63 s after a warm-up, on a laptop. That's 5 cities × 4 weeks × 2 hotels, every strategy | **Measured**; lane A may re-time |
| 72 automated tests | `python -m pytest -q` on `main` at be62864, 18 Nov: 72 passed in 12.6 s | **Confirmed** |
| Built today: hidden demand, CVaR budget optimizer (HiGHS), Buy Desk API with API keys, roles, approvals, audit log, tenant isolation, rate limits, CSV export | README.md, `voyance/` | Confirmed from the code |
| Planned for Round 2: Go collector, Kafka/Redpanda, ClickHouse, Redis, LightGBM forecast + SHAP, price tiers, webhooks, dashboard | PLAN.md | Shown as "Round 2" on the slide |

[q4fy26]: https://tbo-static-files.s3.eu-west-1.amazonaws.com/tbo-investor-relations/Financial-Reporting/Quarterly-Results/2025-26/Others/Q4/Press-Release.pdf
[q2fy27]: https://tbo-static-files.s3.eu-west-1.amazonaws.com/tbo-investor-relations/Financial-Reporting/Quarterly-Results/2026-27/Others/Q2/Press-Release.pdf
[wb]: https://www.whalesbook.com/corporate-news/English/transportation/TBO-Tek-FY26-Revenue-Rs-2677-Crore-Profit-Rs-244-Crore/6a184c7a0c0232fe81aa1bb0
