"""How well the booking-curve forecast predicts real demand, against re-buying last year's.

Run from the project root:  python scripts/forecast_backtest.py
Uses the real bookings dataset (downloaded once by scripts/calibrate.py, checked by SHA-256). Learns on weeks
before 2017 and scores Jan-Aug 2017 at every lead; writes out/forecast_backtest.json.
"""

import io
import json
import logging
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from voyance.calibrate import DATASET_SHA256, DATASET_URL, fetch_verified  # noqa: E402
from voyance.forecast import agent_bookings, backtest, booking_curves, with_history  # noqa: E402

RAW = ROOT / "data" / "raw" / "hotels.csv"
OUT = ROOT / "out" / "forecast_backtest.json"
TEST_FROM = pd.Timestamp("2017-01-02")  # first Monday of 2017


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    raw = pd.read_csv(io.BytesIO(fetch_verified(RAW, DATASET_URL, DATASET_SHA256)))
    frame = with_history(booking_curves(agent_bookings(raw)))
    result = backtest(frame, test_from=TEST_FROM)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    logging.info("lead  weeks  re-buy last year  forecast  range caught actual  already booked")
    for row in result["by_lead"]:
        logging.info(f"{row['lead']:>4}  {row['hotel_weeks']:>5}  {row['wape_last_year']:>16.1%}  "
                     f"{row['wape_forecast']:>8.1%}  {row['range_coverage']:>19.0%}  {row['share_on_books']:>14.0%}")


if __name__ == "__main__":
    main()
