# Voyance: inventory pre-buy planner (TBO VoyageHack 4.0)

Decides what hotel inventory a travel distributor should buy ahead, within a maximum budget:
which hotel, which week, how many room-nights, the expected profit and the worst case.

**Status:** Round 1 prototype. Runs on simulated data; no TBO data yet. Compared with 119,390 real hotel
bookings (`out/calibration.json`): the Christmas-week peak matches (1.45× vs our 1.47×); real demand swings
less from year to year (about 22%) than we simulate (35%), so our test is the harder one; real early December
is busier than ours (only 4 hotel-years of December data, so that shape is rough).
Forecast on the same real bookings, made walk-forward (each from only what was known on the day of the
decision; `out/forecast_backtest.json`): at 90-150 days ahead, where buy-by dates fall, it misses 2017's demand
by 9.5-10.7% vs 15.5% for re-buying last year. Its low-high range holds the actual 72-79% of the time, and
misses mostly on the high side (2017 grew). Buying by the likely forecast (`out/decision_backtest.json`,
Jan-Aug 2017, 2 hotels, 34 weeks) earned 7-13% more than re-buying last year at every lead (90-150 days) and
assumed contract margin (15-30%), with every 95% interval above zero, 13-18% fewer unsold rooms and 35-46%
fewer room-nights turned away. Re-buying last year is a naive rule: it ignores what is already on the books.
The optimizer on the forecast's range beats re-buying at 90 days (+8-20%) but not reliably further out, and
not the likely forecast; its 0.3 caution, applied one week at a time instead of to a whole plan, gives up
profit. Two hotels and 18 months of history can't calibrate the range well enough yet.

## Run

Needs Python 3.11+.

```bash
python -m pip install -e ".[test]"
python -m pytest                   # 171 tests, about 40 s
python scripts/proof_chart.py      # about 3.5 min; writes out/proof_chart.png and out/proof_results.csv
python scripts/calibrate.py        # downloads 16 MB once; writes out/calibration.json
python scripts/forecast_backtest.py  # forecast + buying decisions vs re-buying last year on real 2017 bookings
```

## Buy Desk API

```bash
python scripts/seed_demo.py                                   # prints demo API keys once; copy them
uvicorn voyance.api.app:create_app --factory --reload          # http://127.0.0.1:8000/docs
```

Send the key in the `X-API-Key` header. Demo users: **asha** (buyer), **ravi** (approver),
**meera** (admin) at "TBO Demo", and **zed** (admin) at "Other Distributor", who can't see TBO Demo's plans.

| Endpoint | Who | What |
|---|---|---|
| `GET /v1/me` | anyone | Your name, role and company |
| `GET /v1/markets` | anyone | Hotel-weeks that can be bought, with past bookings and sold-out searches |
| `POST /v1/plans` | anyone | Budget + risk (+ cities) in, ranked buy plan out. Each line has a reason and its numbers (`why`), its own worst case, and a buy-by date (before 90% of that week's agent bookings, measured on real data) |
| `POST /v1/plans/preview` | anyone | The same plan without saving it, for sliders (120 a minute). What-ifs: `demand_change`, `cost_change`, `event_lift` re-plan in a different world through the same optimizer |
| `GET /v1/frontier` | anyone | Expected profit and worst case at risk 0, 0.1 … 1 for one budget, optionally in a what-if (10 a minute) |
| `GET /v1/plans`, `GET /v1/plans/{id}` | anyone | Your company's plans. Each has its hurdle rate (what a rupee must earn to get in), what limits each line (hotel, budget or demand), every hotel-week passed with why, and its exposure per city and hotel. Optional caps (`max_city_share`, `max_hotel_share`, on plans, previews and the frontier) keep any one city or hotel to a share of the budget, and the plan says what they cost |
| `GET /v1/plans/{id}/queue?as_of=` | anyone | What to do on a day: buy now (due within 14 days), scheduled buys, watch (ask a hotel for more rooms, close calls), skip |
| `PATCH /v1/plans/{id}/lines/{line}` | approver, admin | Approve or reject a line; never your own plan |
| `GET /v1/plans/{id}/export.csv` | anyone | Plan as a spreadsheet |
| `GET /v1/audit` | admin | Who did what |

Settings: `VOYANCE_DATABASE_URL` (default `sqlite:///voyance.db`, any SQLAlchemy URL works) and
`VOYANCE_CORS_ORIGINS` (comma-separated dashboard origins, e.g. `http://localhost:5173`; `*` is refused).
For a hosted demo, `VOYANCE_DEMO_KEY_ASHA` (and `_RAVI`, `_MEERA`, `_ZED`) give `seed_demo.py` fixed keys.
There are no database migrations yet: after pulling a schema change, delete `voyance.db` and seed again.

### Security model

- Keys belong to a person at a company; only SHA-256 hashes are stored, and keys can be revoked
  (`voyance.api.auth.revoke_api_key`). The seed keys are for demos only.
- A company never sees another company's plans, lines or audit log (it gets 404).
- Nobody approves their own plan, even with a second key. A decision is final, and two approvers
  clicking at once can't both win.
- Each person can create 30 plans a minute (429 after that); at most 4 plans solve at once (503 if busy).
  Both limits are per process for now.
- Keys travel in a header, so run it behind HTTPS outside a laptop demo.

## Layout

| Path | What it does |
|---|---|
| `voyance/demand.py` | Hidden demand: bookings + sold-out searches ÷ searches-per-booking; demand scenarios |
| `voyance/optimizer.py` | Budget + risk (CVaR) linear program, solved with scipy's built-in HiGHS |
| `voyance/sim.py` | Simulated December seasons and the strategies we compare |
| `voyance/api/` | Buy Desk API: planner, storage, API-key auth, approvals, audit log |
| `voyance/calibrate.py` | Demand facts measured on real bookings (December shape, year-to-year swing, buy-ahead days) |
| `voyance/forecast.py` | Forecast from the booking curve: LightGBM low / likely / high, with SHAP reasons |
| `voyance/backtest.py` | Scores buying strategies on real outcomes: re-buy last year, the forecast, the optimizer |
| `scripts/proof_chart.py` | Round 1 chart: expected profit by budget |
| `scripts/calibrate.py` | Checks the simulator against the real bookings dataset |
| `scripts/seed_demo.py` | Demo companies and API keys |
| `PLAN.md` | Team plan, timeline and product shape |

## Data credit

`scripts/calibrate.py` downloads the "Hotel booking demand" dataset: N. Antonio, A. de Almeida, L. Nunes (2019),
*Data in Brief* 22: 41–49, licence CC BY 4.0. It is checked by SHA-256 and kept out of this repo.
