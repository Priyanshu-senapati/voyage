# data/events/

A real, sourced calendar of what moves hotel demand in Voyance's five cities: Goa, Jaipur, Udaipur,
Manali and Kochi. It covers December 2026 (the season the demo plans) plus earlier Decembers where
dates are known. Lane C owns this folder. Lane A reads `events.csv` to replace the simulated event
flags (Round 2).

## Columns (`events.csv`)
| Column | Meaning |
|---|---|
| `city` | One of the five cities, or `All` for national dates |
| `start`, `end` | Inclusive dates, `YYYY-MM-DD` |
| `name` | What it is |
| `kind` | `holiday_season`, `long_weekend`, `public_holiday`, `religious`, `festival`, `arts_festival`, `crafts_festival`, `wedding_season`, `wedding_pause` |
| `impact` | Our judgement of the effect on hotel demand in that city, before any data:<br>- `high`: mainstream hotels can sell out<br>- `medium`: a clear lift<br>- `low`: a small lift<br>- `negative`: a dip. Kharmas pauses Hindu weddings, so Jaipur and Udaipur lose wedding demand |
| `status` | `confirmed` if organisers or press reported these dates. `expected` if the event repeats on a stable pattern and the 2026 dates aren't announced yet |
| `source_url` | Where the dates come from |

The `status` column extends the agreed `city, start, end, name, kind, impact, source_url` contract,
so read columns by name.

## Notes
- **Sunburn is not a Goa event in 2026.** The festival moved its main event to Mumbai
  (18–19 Dec 2026), according to recent listings, so it's left out.
- **Wedding dates vary by panchang.**
  - **Muhurat days:** sources agree on roughly 1–6 and 11–12 December 2026, so the row spans
    1–12 Dec.
  - **Kharmas:** it starts around 15–16 December. Confirm the exact days with Drik Panchang before
    relying on them.
- **The Kochi-Muziris Biennale is biennial.** The 6th edition ran 12 Dec 2025 – 31 Mar 2026. No 2026
  edition is listed.
- **`impact` is a hypothesis.** Lane A calibrates the actual lift per kind and city against bookings
  once real data is available. The demo's simulator assumes event weeks lift demand 1.5× (`voyance/sim.py`).
- **Check sources before quoting a row on stage.** Several are travel guides, not organisers.
