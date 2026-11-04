# PreBuy: inventory pre-buy planner (TBO VoyageHack 4.0)

Decides what hotel inventory a travel distributor should buy ahead, within a maximum budget:
which hotel, which week, how many room-nights, the expected profit and the worst case.

**Status:** Round 1 prototype. Runs on simulated data only; no TBO data yet.

## Run

Needs Python 3.11+.

```bash
python -m pip install -e ".[test]"
python -m pytest                   # 72 tests, about 12 s
python scripts/proof_chart.py      # about 3.5 min; writes out/proof_chart.png and out/proof_results.csv
```

## Buy Desk API

```bash
python scripts/seed_demo.py                                   # prints demo API keys once; copy them
uvicorn prebuy.api.app:create_app --factory --reload          # http://127.0.0.1:8000/docs
```

Send the key in the `X-API-Key` header. Demo users: **asha** (buyer), **ravi** (approver),
**meera** (admin) at "TBO Demo", and **zed** (admin) at "Other Distributor", who can't see TBO Demo's plans.

| Endpoint | Who | What |
|---|---|---|
| `GET /v1/markets` | anyone | Hotel-weeks that can be bought, with past bookings and sold-out searches |
| `POST /v1/plans` | anyone | Budget + risk (+ cities) in, ranked buy plan out, each line with a reason |
| `GET /v1/plans`, `GET /v1/plans/{id}` | anyone | Your company's plans |
| `PATCH /v1/plans/{id}/lines/{line}` | approver, admin | Approve or reject a line; never your own plan |
| `GET /v1/plans/{id}/export.csv` | anyone | Plan as a spreadsheet |
| `GET /v1/audit` | admin | Who did what |

Settings: `PREBUY_DATABASE_URL` (default `sqlite:///prebuy.db`, any SQLAlchemy URL works) and
`PREBUY_CORS_ORIGINS` (comma-separated dashboard origins, e.g. `http://localhost:5173`; `*` is refused).

### Security model

- Keys belong to a person at a company; only SHA-256 hashes are stored, and keys can be revoked
  (`prebuy.api.auth.revoke_api_key`). The seed keys are for demos only.
- A company never sees another company's plans, lines or audit log (it gets 404).
- Nobody approves their own plan, even with a second key. A decision is final, and two approvers
  clicking at once can't both win.
- Each person can create 30 plans a minute (429 after that); at most 4 plans solve at once (503 if busy).
  Both limits are per process for now.
- Keys travel in a header, so run it behind HTTPS outside a laptop demo.

## Layout

| Path | What it does |
|---|---|
| `prebuy/demand.py` | Hidden demand: bookings + sold-out searches ÷ searches-per-booking; demand scenarios |
| `prebuy/optimizer.py` | Budget + risk (CVaR) linear program, solved with scipy's built-in HiGHS |
| `prebuy/sim.py` | Simulated December seasons and the strategies we compare |
| `prebuy/api/` | Buy Desk API: planner, storage, API-key auth, approvals, audit log |
| `scripts/proof_chart.py` | Round 1 chart: expected profit by budget |
| `scripts/seed_demo.py` | Demo companies and API keys |
| `PLAN.md` | Team plan, timeline and product shape |
