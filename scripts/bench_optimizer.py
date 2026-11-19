"""How the buy-plan optimizer's solve time grows with the number of hotel-weeks, and what solving
cities in parallel buys.

Run from the project root:  python scripts/bench_optimizer.py
Writes out/bench_optimizer.json and prints a table.

Synthetic items like the simulator's (random cost, price, capacity and demand), 200 demand scenarios,
risk 0.3, and a budget of 30% of what buying every room would cost. One plan is one call to
`voyance.optimizer.optimize`, including rounding to whole rooms. Sizes grow until a single solve takes
longer than SLOW_S, so the run stays short on a laptop; the largest size reached is the honest limit
of today's formulation (see the note in voyance/optimizer.py about scaling to TBO's catalogue).
"""

import json
import os
import platform
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from voyance.demand import scenarios  # noqa: E402
from voyance.optimizer import optimize  # noqa: E402

SIZES = (40, 100, 200, 400, 1000, 2000, 4000, 8000)
N_SCENARIOS = 200
RISK = 0.3
SLOW_S = 60.0              # stop growing once one solve takes longer than this
CITIES, PER_CITY = 16, 400  # the parallel run: 16 cities x 400 hotel-weeks, each city its own plan
OUT = ROOT / "out" / "bench_optimizer.json"


def instance(n: int, seed: int):
    rng = np.random.default_rng(seed)
    cost = rng.uniform(3_500, 9_000, n)
    price = cost * rng.uniform(1.12, 1.35, n)
    mean = rng.uniform(30, 160, n)
    cap = np.ceil(mean * 1.5)
    demand = scenarios(mean, 0.35, N_SCENARIOS, rng)
    return cost, price, cap, demand, 0.3 * float(cost @ cap)


def solve(n: int, seed: int) -> float:
    cost, price, cap, demand, budget = instance(n, seed)
    start = time.perf_counter()
    optimize(cost, price, cap, demand, budget, RISK, 0.05)
    return time.perf_counter() - start


def main() -> None:
    solve(40, 0)  # warm-up: imports and the solver thread
    sizes = []
    for n in SIZES:
        runs = 3 if n <= 1000 else 1
        seconds = min(solve(n, seed) for seed in range(runs))
        sizes.append({"hotel_weeks": n, "seconds": round(seconds, 3), "runs": runs,
                      "lp_columns": n * (N_SCENARIOS + 1) + N_SCENARIOS + 1})
        print(f"{n:>6} hotel-weeks  {seconds:8.2f} s  (best of {runs})")
        if seconds > SLOW_S:
            print(f"stopping: one solve took over {SLOW_S:.0f} s")
            break

    start = time.perf_counter()
    for c in range(CITIES):
        solve(PER_CITY, 100 + c)
    one_by_one = time.perf_counter() - start
    workers = min(CITIES, os.cpu_count() or 1)
    start = time.perf_counter()
    with ProcessPoolExecutor(max_workers=workers) as pool:
        list(pool.map(solve, [PER_CITY] * CITIES, range(100, 100 + CITIES)))
    parallel = time.perf_counter() - start  # includes starting the worker processes
    print(f"{CITIES} cities x {PER_CITY} hotel-weeks: one by one {one_by_one:.1f} s, "
          f"in parallel on {workers} processes {parallel:.1f} s ({CITIES * PER_CITY / parallel:.0f} hotel-weeks a second)")

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({
        "machine": {"cpus": os.cpu_count(), "platform": platform.platform(), "python": platform.python_version()},
        "scenarios": N_SCENARIOS, "risk_aversion": RISK, "sizes": sizes,
        "parallel": {"cities": CITIES, "hotel_weeks_per_city": PER_CITY, "workers": workers,
                     "one_by_one_seconds": round(one_by_one, 2), "parallel_seconds": round(parallel, 2)},
    }, indent=2), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
