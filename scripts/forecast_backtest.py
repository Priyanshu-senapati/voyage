"""The forecast and the buying decisions, scored on real 2017 bookings against re-buying last year's demand.

Run from the project root:  python scripts/forecast_backtest.py
Uses the real bookings dataset (downloaded once by scripts/calibrate.py, checked by SHA-256). Learns on weeks
before 2017 and scores Jan-Aug 2017. Writes out/forecast_backtest.json (accuracy at every lead),
out/decision_backtest.json (profit, unsold and turned-away rooms per strategy, lead and assumed margin) and
voyance/data/replay_2017.json (week by week, what we believed, decided and saw; served at GET /v1/replay).
"""

import io
import json
import logging
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from voyance.backtest import decision_backtest  # noqa: E402
from voyance.calibrate import DATASET_SHA256, DATASET_URL, fetch_verified  # noqa: E402
from voyance.forecast import agent_bookings, backtest, booking_curves, with_history  # noqa: E402
from voyance.replay import build_replay  # noqa: E402

RAW = ROOT / "data" / "raw" / "hotels.csv"
OUT = ROOT / "out"
REPLAY = ROOT / "voyance" / "data" / "replay_2017.json"  # shipped in the package: the API serves it
REPLAY_LEAD, REPLAY_MARGIN = 120, 0.20
TEST_FROM = pd.Timestamp("2017-01-02")  # first Monday of 2017
DECISION_LEADS = (90, 120, 150)  # buy-by dates fall 93-139 days ahead
MARGINS = (0.15, 0.20, 0.30)     # assumed: contract cost = (1 - margin) x the week's agent rate


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    raw = pd.read_csv(io.BytesIO(fetch_verified(RAW, DATASET_URL, DATASET_SHA256)))
    frame = with_history(booking_curves(agent_bookings(raw)))
    OUT.mkdir(exist_ok=True)

    accuracy = backtest(frame, test_from=TEST_FROM)
    _write("forecast_backtest.json", accuracy)
    logging.info("lead  weeks  re-buy last year  forecast  range caught actual  already booked")
    for row in accuracy["by_lead"]:
        logging.info(f"{row['lead']:>4}  {row['hotel_weeks']:>5}  {row['wape_last_year']:>16.1%}  "
                     f"{row['wape_forecast']:>8.1%}  {row['range_coverage']:>19.0%}  {row['share_on_books']:>14.0%}")

    decisions = decision_backtest(frame, TEST_FROM, DECISION_LEADS, MARGINS)
    _write("decision_backtest.json", decisions)
    replay = build_replay(frame, TEST_FROM, lead=REPLAY_LEAD, margin=REPLAY_MARGIN)
    REPLAY.write_text(json.dumps(replay, indent=1) + "\n", encoding="utf-8")
    t = replay["totals"]
    logging.info(f"\nreplay ({len(replay['weeks'])} hotel-weeks, {REPLAY_LEAD} days ahead, {REPLAY_MARGIN:.0%} margin): "
                 f"Voyance {t['voyance']['profit']:,.0f} EUR vs re-buy {t['rebuy_last_year']['profit']:,.0f} EUR "
                 f"-> {REPLAY.relative_to(ROOT)}")
    logging.info("\nprofit vs re-buying last year [95% interval] | rooms unsold / room-nights turned away")
    logging.info("lead  margin  likely forecast     optimizer risk 0    optimizer risk 0.3  | re-buy         likely")
    for row in decisions["results"]:
        s = row["strategies"]
        logging.info(f"{row['lead']:>4}  {row['margin']:>6.0%}  {_vs(s['likely_forecast'])}  "
                     f"{_vs(s['optimizer_risk_0'])}  {_vs(s['optimizer_risk_0.3'])}"
                     f" | {_rooms(s['rebuy_last_year'])}  {_rooms(s['likely_forecast'])}")
    logging.info("\nagainst the pickup forecast (bookings now + last year's pickup from the same lead) [95% interval]")
    logging.info("lead  margin  pickup vs re-buy    likely forecast     optimizer risk 0    risk 0.3 per week   "
                 "risk 0.3 whole plan")
    for row in decisions["results"]:
        s = row["strategies"]
        others = (_vs(s[name], "vs_pickup") for name in
                  ("likely_forecast", "optimizer_risk_0", "optimizer_risk_0.3", "optimizer_plan_risk_0.3"))
        logging.info(f"{row['lead']:>4}  {row['margin']:>6.0%}  {_vs(s['pickup'])}  " + "  ".join(others))


def _rooms(result: dict) -> str:
    return f"{result['unsold']:,.0f} / {result['turned_away']:,.0f}"


def _vs(result: dict, key: str = "vs_rebuy") -> str:
    low, high = result[f"{key}_95ci"]
    return f"{result[key]:+.0%} [{low:+.0%},{high:+.0%}]".ljust(18)


def _write(name: str, result: dict) -> None:
    (OUT / name).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
