"""Stress test: does the planner still beat the simple rules when its own assumptions are wrong?

Run from the project root:  python scripts/stress_test.py [worlds]     (default 100)
Writes out/stress_test.json and prints a table. Same simulated worlds as the Round 1 study (`voyance.sim`).

Each stress changes only what the planner believes or sees, never how it is scored, except
"Demand falls 20%", where this season's true demand is lower for every strategy alike:
- look-to-book: the planner converts sold-out searches into lost bookings with the wrong rate;
- duplicates / missing / noise: the sold-out search log it reads is inflated, half-empty or noisy;
- event size: it assumes the wrong lift for event weeks (past weeks deflated, this season's inflated).
"Repeat past bookings" and "Optimizer, bookings only" never read searches, so only the demand shift touches them.

A separate section, "Real cancellation rate", keeps the same worlds but lets this season's bookings cancel, and
scores every plan on the room-nights kept (sim.kept_rooms). It is not scored on the planner's own exact rates: each
test season draws its cancel rate and late share from Beta distributions around the measured agent rates
(sim.AGENT_CANCEL_RATE, sim.LATE_CANCEL_SHARE), standard deviation SEASON_RATE_SD. Strategies: our planner told the
measured rate (as build_plan does), told a cancel rate of 0.30 or 0.50, not told (0), re-buying past bookings and
re-buying the share of them that stayed (repeat_past_bookings with stay_share = 1 - rate).
"""

import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from voyance.demand import scenarios, unconstrain  # noqa: E402
from voyance.optimizer import optimize  # noqa: E402
from voyance.sim import (AGENT_CANCEL_RATE, ASSUMED_EVENT_LIFT, DEMAND_CV, LATE_CANCEL_SHARE,  # noqa: E402
                         LOOK_TO_BOOK, WORST_SHARE, _assumed_lift, bookings_mean, evaluate, hidden_demand_mean,
                         make_world, repeat_past_bookings, stay_factors)

BUDGETS_LAKH = (40, 200)
RISK = 0.3                 # the Buy Desk default, as in the Round 1 study
N_SCENARIOS, N_TEST = 200, 500
OUT = ROOT / "out" / "stress_test.json"
SEASON_RATE_SD = 0.05      # how far a season's cancel rate and late share stray from the real ones (scoring only)
TOLD_CANCEL = {"ours_aware": AGENT_CANCEL_RATE, "ours_told_0.30": 0.30, "ours_told_0.50": 0.50, "ours_unaware": 0.0}
BEATEN = ("ours_told_0.30", "ours_told_0.50", "ours_unaware", "rebuy_gross", "rebuy_kept")

# name: (look-to-book multiplier the planner assumes, multiplier on the sold-out searches it reads,
#        log-normal noise on those searches, event lift it assumes, true demand multiplier this season)
STRESSES = {
    "As designed": (1.0, 1.0, 0.0, ASSUMED_EVENT_LIFT, 1.0),
    "Look-to-book 30% too low (counts too much lost demand)": (0.7, 1.0, 0.0, ASSUMED_EVENT_LIFT, 1.0),
    "Look-to-book 30% too high (counts too little)": (1.3, 1.0, 0.0, ASSUMED_EVENT_LIFT, 1.0),
    "Agents retry: 50% duplicate sold-out searches": (1.0, 1.5, 0.0, ASSUMED_EVENT_LIFT, 1.0),
    "Only half of sold-out searches logged": (1.0, 0.5, 0.0, ASSUMED_EVENT_LIFT, 1.0),
    "Noisy search logs (log-normal, sigma 0.5)": (1.0, 1.0, 0.5, ASSUMED_EVENT_LIFT, 1.0),
    "Event weeks: no lift assumed": (1.0, 1.0, 0.0, 1.0, 1.0),
    "Event weeks: 2.2x lift assumed (top of range)": (1.0, 1.0, 0.0, 2.2, 1.0),
    "Demand falls 20% this season": (1.0, 1.0, 0.0, ASSUMED_EVENT_LIFT, 0.8),
    "Everything wrong at once, towards over-buying": (0.7, 1.5, 0.5, 2.2, 0.8),
}


def one_world(seed: int) -> dict:
    """Every stress and budget on one world; the same test seasons and scenario noise throughout."""
    world = make_world(seed)
    plan_rng, test_rng = (np.random.default_rng(s) for s in np.random.SeedSequence(seed).spawn(2))
    base_test = scenarios(world.true_mean, DEMAND_CV, N_TEST, test_rng)
    noise = scenarios(np.ones(world.cost.size), DEMAND_CV, N_SCENARIOS, plan_rng)
    log_noise = np.random.default_rng([seed, 2027]).normal(0.0, 1.0, world.soldout_searches_hist.shape)
    out = {}
    for name, (ltb, dup, sigma, lift, shift) in STRESSES.items():
        searches = world.soldout_searches_hist * dup * np.exp(sigma * log_noise - sigma**2 / 2)
        past = unconstrain(world.bookings_hist, searches, LOOK_TO_BOOK * ltb)
        estimate = (past / _assumed_lift(world.event_lift_hist, lift)).mean(axis=0) * _assumed_lift(world.event_lift_now, lift)
        test = base_test * shift
        for budget_lakh in BUDGETS_LAKH:
            budget = budget_lakh * 1e5
            plans = {
                "ours": optimize(world.cost, world.price, world.cap, estimate * noise, budget, RISK, WORST_SHARE),
                "rebuy": repeat_past_bookings(world, budget),
                "raw": optimize(world.cost, world.price, world.cap, bookings_mean(world) * noise, budget, RISK, WORST_SHARE),
            }
            out[(name, budget_lakh)] = {k: evaluate(world, buy, test) for k, buy in plans.items()}
    return out


def cancel_world(seed: int) -> dict:
    """Real cancellation rate on one world: the same test seasons and scenario noise as one_world; each test season
    cancels at its own rates around the real ones."""
    world = make_world(seed)
    plan_rng, test_rng = (np.random.default_rng(s) for s in np.random.SeedSequence(seed).spawn(2))
    test = scenarios(world.true_mean, DEMAND_CV, N_TEST, test_rng)
    noise = scenarios(np.ones(world.cost.size), DEMAND_CV, N_SCENARIOS, plan_rng)
    rate_rng = np.random.default_rng([seed, 41])
    season_cancel = _beta(rate_rng, AGENT_CANCEL_RATE, SEASON_RATE_SD, N_TEST)
    season_late = _beta(rate_rng, LATE_CANCEL_SHARE, SEASON_RATE_SD, N_TEST)
    mean = hidden_demand_mean(world)  # the "As designed" estimate
    told = {name: stay_factors(c) for name, c in TOLD_CANCEL.items()}  # (keep, paid)
    out = {}
    for budget_lakh in BUDGETS_LAKH:
        budget = budget_lakh * 1e5
        # as build_plan: demand x keep at price x paid
        plans = {name: optimize(world.cost, world.price * paid, world.cap, mean * keep * noise, budget, RISK,
                                WORST_SHARE) for name, (keep, paid) in told.items()}
        plans["rebuy_gross"] = repeat_past_bookings(world, budget)
        plans["rebuy_kept"] = repeat_past_bookings(world, budget, stay_share=1 - AGENT_CANCEL_RATE)
        out[budget_lakh] = {k: evaluate(world, buy, test, cancel_rates=season_cancel, late_shares=season_late)
                            for k, buy in plans.items()}
    return out


def _beta(rng: np.random.Generator, mean: float, sd: float, n: int) -> np.ndarray:
    """n draws from the Beta distribution with this mean and standard deviation."""
    total = mean * (1 - mean) / sd**2 - 1
    return rng.beta(mean * total, (1 - mean) * total, n)


def summarise_cancellations(per_world: list[dict]) -> list[dict]:
    rows = []
    for budget_lakh in BUDGETS_LAKH:
        cells = [w[budget_lakh] for w in per_world]
        mean = {s: {m: float(np.mean([c[s][m] for c in cells])) for m in cells[0][s]} for s in cells[0]}
        profit = {s: np.array([c[s]["mean_profit"] for c in cells]) for s in cells[0]}
        rows.append({"budget_lakh": budget_lakh, "means": mean, "worlds_where_aware_earns_more_than": {
            s: float((profit["ours_aware"] > profit[s]).mean()) for s in BEATEN}})
    return rows


def summarise(per_world: list[dict]) -> list[dict]:
    rows = []
    for name in STRESSES:
        for budget_lakh in BUDGETS_LAKH:
            cells = [w[(name, budget_lakh)] for w in per_world]
            mean = {s: {m: float(np.mean([c[s][m] for c in cells])) for m in cells[0][s]} for s in cells[0]}
            ours = np.array([c["ours"]["mean_profit"] for c in cells])
            rebuy = np.array([c["rebuy"]["mean_profit"] for c in cells])
            rows.append({
                "stress": name, "budget_lakh": budget_lakh, "means": mean,
                "profit_vs_rebuy": _change(mean["ours"]["mean_profit"], mean["rebuy"]["mean_profit"]),
                "worst_case_vs_rebuy": _change(mean["ours"]["worst_5pct_profit"], mean["rebuy"]["worst_5pct_profit"]),
                "profit_vs_raw_optimizer": _change(mean["ours"]["mean_profit"], mean["raw"]["mean_profit"]),
                "worlds_where_ours_earns_more_than_rebuy": float((ours > rebuy).mean()),
            })
    return rows


def _change(ours: float, base: float) -> float | None:
    """Relative change, or None when the baseline is a loss or close to zero (a ratio would mislead)."""
    return ours / base - 1 if base > 1e5 else None  # a lakh of profit or more


def _pct(x: float | None) -> str:
    return "   n/a" if x is None else f"{x:+6.1%}"


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # the ₹ sign, on any Windows console
    worlds = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    with ProcessPoolExecutor(max_workers=os.cpu_count()) as pool:
        per_world = list(pool.map(one_world, range(worlds)))
        per_world_cancel = list(pool.map(cancel_world, range(worlds)))
    rows = summarise(per_world)
    cancel_rows = summarise_cancellations(per_world_cancel)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({"worlds": worlds, "risk_aversion": RISK, "rows": rows, "cancellations": {
        "cancel_rate": AGENT_CANCEL_RATE, "late_cancel_share": LATE_CANCEL_SHARE, "season_rate_sd": SEASON_RATE_SD,
        "rows": cancel_rows}}, indent=2), encoding="utf-8")
    print(f"{worlds} simulated worlds, risk {RISK}. Expected profit and worst-5% profit in ₹ lakh for ours and for "
          "re-buying past bookings, ours vs the same optimizer on raw bookings, and the share of worlds where ours "
          "earns more than re-buying. n/a = the baseline is a loss, so a percentage would mislead.")
    for r in rows:
        m = r["means"]
        print(f"{r['stress'][:52]:52} ₹{r['budget_lakh']:>3}L  profit {m['ours']['mean_profit'] / 1e5:6.1f} vs "
              f"{m['rebuy']['mean_profit'] / 1e5:6.1f} ({_pct(r['profit_vs_rebuy'])})  worst "
              f"{m['ours']['worst_5pct_profit'] / 1e5:6.1f} vs {m['rebuy']['worst_5pct_profit'] / 1e5:6.1f}  "
              f"vs raw {_pct(r['profit_vs_raw_optimizer'])}  wins {r['worlds_where_ours_earns_more_than_rebuy']:5.0%}")
    print()
    print(f"Real cancellation rate: each test season's bookings cancel at about {AGENT_CANCEL_RATE:.0%}, "
          f"{LATE_CANCEL_SHARE:.1%} of those too late to resell (Beta, sd {SEASON_RATE_SD}). Profit / worst-5% in "
          "₹ lakh on the room-nights kept.")
    print(f"{'':16}" + "".join(f"  ₹{r['budget_lakh']:>3}L profit / worst" for r in cancel_rows))
    for name in cancel_rows[0]["means"]:
        print(f"{name:16}" + "".join(f"  {r['means'][name]['mean_profit'] / 1e5:12.1f} / "
                                     f"{r['means'][name]['worst_5pct_profit'] / 1e5:5.1f}" for r in cancel_rows))
    for name in BEATEN:
        print(f"ours_aware earns more than {name:14} in " + ", ".join(
            f"{r['worlds_where_aware_earns_more_than'][name]:4.0%} of worlds at ₹{r['budget_lakh']}L"
            for r in cancel_rows))
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
