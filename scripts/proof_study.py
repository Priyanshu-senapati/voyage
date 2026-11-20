"""The Round 1 simulation, run on many more worlds across every CPU core, with 95% intervals.

Run from the project root:  python scripts/proof_study.py [worlds]     (default 500; ~5 min on 24 cores)
Writes out/proof_study.json, which the Round 1 deck (deck/build_round1.js) reads. It leaves
out/proof_results.csv (the older 20-world table) untouched. Each strategy is scored on the same worlds, so the
comparison is paired: the interval comes from resampling worlds.
"""

import json
import logging
import os
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from voyance.backtest import _bootstrap_ci  # noqa: E402
from voyance.sim import run  # noqa: E402

BUDGETS_LAKH = (40, 60, 80, 100, 120, 160, 200, 240)
OURS, BASELINE = "Optimizer + hidden demand + events", "Repeat past bookings"
OUT = ROOT / "out" / "proof_study.json"
OUT_CANCELLING = ROOT / "out" / "proof_study_cancellations.json"


def one(job: tuple[int, int, float]) -> tuple[int, int, dict]:
    seed, budget, cancel_rate = job
    # separate processes: no shared solver state
    return seed, budget, run(seed=seed, budget=budget * 1e5, cancel_rate=cancel_rate)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    worlds = int(sys.argv[1]) if len(sys.argv) > 1 else 500
    cancel_rate = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0  # e.g. 0.41, the measured agent rate
    out = OUT_CANCELLING if cancel_rate > 0 else OUT
    jobs = [(seed, budget, cancel_rate) for budget in BUDGETS_LAKH for seed in range(worlds)]
    with ProcessPoolExecutor(max_workers=os.cpu_count()) as pool:
        results = list(pool.map(one, jobs, chunksize=4))
    rng = np.random.default_rng(0)
    rows = []
    for budget in BUDGETS_LAKH:
        runs = [r for _, b, r in sorted(results) if b == budget]
        ours = np.array([r[OURS]["mean_profit"] for r in runs])
        base = np.array([r[BASELINE]["mean_profit"] for r in runs])
        ours_worst = np.array([r[OURS]["worst_5pct_profit"] for r in runs])
        base_worst = np.array([r[BASELINE]["worst_5pct_profit"] for r in runs])
        rows.append({
            "budget_lakh": budget,
            "means": {name: {metric: float(np.mean([r[name][metric] for r in runs])) for metric in runs[0][name]}
                      for name in runs[0]},
            "profit_vs_rebuy": float(ours.sum() / base.sum() - 1),
            "profit_vs_rebuy_95ci": _bootstrap_ci(ours, base, rng),
            "worst_case_vs_rebuy": float(ours_worst.sum() / base_worst.sum() - 1),
            "worst_case_vs_rebuy_95ci": _bootstrap_ci(ours_worst, base_worst, rng),
            "worlds_where_ours_earns_more": float((ours > base).mean()),
        })
    report = {"worlds": worlds, **({"cancel_rate": cancel_rate} if cancel_rate else {}), "budgets": rows}
    out.write_text(json.dumps(report, indent=1) + "\n", encoding="utf-8")
    logging.info(f"{worlds} worlds x {len(BUDGETS_LAKH)} budgets on {os.cpu_count()} cores -> {out.relative_to(ROOT)}")
    logging.info("budget   profit vs re-buy [95%]        worst 5% vs re-buy [95%]       worlds better")
    for row in rows:
        p, w = row["profit_vs_rebuy_95ci"], row["worst_case_vs_rebuy_95ci"]
        logging.info(f"Rs {row['budget_lakh']:>3}L  {row['profit_vs_rebuy']:+6.1%} [{p[0]:+.1%}, {p[1]:+.1%}]   "
                     f"{row['worst_case_vs_rebuy']:+6.1%} [{w[0]:+.1%}, {w[1]:+.1%}]   "
                     f"{row['worlds_where_ours_earns_more']:.0%}")


if __name__ == "__main__":
    main()
