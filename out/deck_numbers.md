# Deck numbers (lane A, 18 Nov)

Every number here is **simulated, not TBO data**. Say so on the slide.
Source: `out/proof_results.csv` and `out/proof_chart.png`: 20 simulated Decembers, 40 hotel-weeks across
5 Indian cities. Every method sees the same 3 past seasons; our planner knows which weeks have events, not how big they are.
"Re-buying past bookings" is the simple rule a buyer would use today.

## Copy-ready lines
1. **Tight budget:** +24% expected profit at ₹40L and +14% at ₹60L vs re-buying past bookings.
2. **Big budget:** at ₹2 cr, 3% more profit while spending ₹15L less, with 32% fewer unsold rooms (101 vs 148)
   and a 16% better worst case. The planner knows when to stop buying.
3. **Hidden demand:** an optimizer fed only booking data spends just ₹99L of a ₹2 cr budget and turns away
   1,785 room-nights, because bookings can never exceed what was held. Counting sold-out searches back in,
   with event weeks separated, lifts profit 12% and turns away 29% fewer (1,275).
4. **Why both ideas are needed:** hidden demand on its own *lowers* profit 1–5%, because it over-buys last
   year's festival weeks. It pays only once event weeks are separated.
5. **The risk slider pays for itself:** at ₹2 cr, the default risk setting (0.3) vs none: profit ₹25.1L vs ₹24.7L,
   worst 5% of seasons ₹17.0L vs ₹15.0L. Caution also guards against our own forecast being off.
6. **Feasible today:** a full buy plan (40 hotel-weeks, 200 demand scenarios) solves in under a second on a
   laptop (0.25–0.7 s, depending on the budget); cities run in parallel. The working API already has plans,
   four-eyes approvals, an audit log and CSV export, with 107 automated tests.

## Checked against real bookings (`out/calibration.json`, `python scripts/calibrate.py`)
Public dataset of 119,390 real bookings at two hotels, 2015–17 (Portugal, CC BY 4.0).
7. **The channel is TBO's:** 82% of the bookings came through travel agents and tour operators.
8. **Our peak is realistic:** Christmas week runs 1.45× an average December week in the real data; we simulate 1.47×.
9. **Our test is harder than reality:** a week's real agent demand swings about 22% from one year to the next;
   we simulate 35%.
10. **Why pre-buying is risky:** 41% of agent bookings were cancelled, and they arrive a median of 59 days ahead,
    so the buy decision is made about two months out.
- Be upfront: the data is from Portugal, not India; real early December is busier than in our simulation, and
  there are only 4 hotel-years of December data.

## Table for a slide (our planner vs re-buying past bookings)
| Budget | Expected profit | Worst 5% of seasons | Money spent | Unsold rooms |
|---|---|---|---|---|
| ₹40L | +24% | +2% | same | 5 vs 0 |
| ₹60L | +14% | −3% | same | 11 vs 1 |
| ₹1.2 cr | about even | −5% | same | 57 vs 46 |
| ₹2 cr | +3% | +16% | ₹15L less | 101 vs 148 |

## If a judge pushes (be upfront)
- At ₹1–1.2 cr we only match re-buying past bookings (−0.3% to +1.7%).
- From ₹60L to ₹1.2 cr our worst case is 3–7% weaker than that rule.
- At big budgets we turn away more room-nights than re-buying (1,275 vs 1,085), because we skip buys
  whose risk isn't worth it.
- Splitting the budget evenly *loses* ₹10.3L at ₹2 cr: naive spending is the real danger.
- Do not use the old "+17% everywhere" figure: it came from an unfair early simulation.

## TBO scale (lane C: check against TBO's filings before using)
FY26 GTV ₹36,809 cr (+19%), revenue ₹2,677.5 cr, 32,751 monthly transacting buyers. **Not yet verified.**
