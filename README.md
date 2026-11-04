# PreBuy: inventory pre-buy planner (TBO VoyageHack 4.0)

Decides what hotel inventory a travel distributor should buy ahead, within a maximum budget:
which hotel, which week, how many room-nights, the expected profit and the worst case.

**Status:** Round 1 prototype. Runs on simulated data only; no TBO data yet.

## Run

Needs Python 3.11+.

```bash
python -m pip install numpy scipy matplotlib pytest
python -m pytest -p no:asyncio     # 37 tests, about 2 s
python scripts/proof_chart.py      # about 3.5 min; writes out/proof_chart.png and out/proof_results.csv
```

`-p no:asyncio` is only needed if the pytest-asyncio plugin is installed (it warns on Python 3.14).

## Layout

| Path | What it does |
|---|---|
| `prebuy/demand.py` | Hidden demand: bookings + sold-out searches ÷ searches-per-booking; demand scenarios |
| `prebuy/optimizer.py` | Budget + risk (CVaR) linear program, solved with scipy's built-in HiGHS |
| `prebuy/sim.py` | Simulated December seasons and the strategies we compare |
| `scripts/proof_chart.py` | Round 1 chart: expected profit by budget |
| `PLAN.md` | Team plan, timeline and product shape |
