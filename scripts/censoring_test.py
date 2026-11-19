"""Semi-real test of hidden demand on the real bookings (see voyance/censoring.py).

Run from the project root:  python scripts/censoring_test.py
Writes out/censoring_test.json and prints a table: for each allotment and margin, how much of last year's demand
its bookings missed, and what re-buying last year's hidden demand earns against re-buying its bookings, with the
look-to-book ratio right, 30% off, or with duplicated searches. Same test weeks as scripts/forecast_backtest.py.
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
from voyance.censoring import CASES, censoring_test  # noqa: E402
from voyance.forecast import agent_bookings, booking_curves, with_history  # noqa: E402

RAW = ROOT / "data" / "raw" / "hotels.csv"
OUT = ROOT / "out" / "censoring_test.json"
TEST_FROM = pd.Timestamp("2017-01-02")  # first Monday of 2017, as in forecast_backtest.py
ALLOTMENTS = (1.0, 1.2)  # last year's allotment: the hotel's typical week, or 20% more
MARGINS = (0.15, 0.20, 0.30)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    raw = pd.read_csv(io.BytesIO(fetch_verified(RAW, DATASET_URL, DATASET_SHA256)))
    frame = with_history(booking_curves(agent_bookings(raw)))
    results = [censoring_test(frame, TEST_FROM, margin=margin, allotment=allotment)
               for allotment in ALLOTMENTS for margin in MARGINS]
    report = {"test_from": TEST_FROM.date().isoformat(), "source": "real agent bookings at 2 hotels; searches "
              "synthetic (see voyance/censoring.py)", "results": results}
    OUT.write_text(json.dumps(report, indent=1) + "\n", encoding="utf-8")
    logging.info(f"-> {OUT.relative_to(ROOT)}")
    logging.info("allotment margin  censored  bookings miss | hidden demand vs re-buying bookings: "
                 + " | ".join(CASES) + " | full demand")
    for r in results:
        cases = "  ".join(f"re-buy {c['profit_vs_rebuy_bookings']:+6.1%} sized {c['sized_vs_sized_bookings']:+6.1%} "
                          f"(miss {c['error_of_last_year']:.1%})" for c in r["cases"].values())
        logging.info(f"{r['allotment']:>8.1f}x {r['margin']:>6.0%}  {r['censored_weeks']:>3}/{r['hotel_weeks']:<3}"
                     f"  {r['bookings_error']:>12.1%} | {cases} | {r['rebuy_full_demand']['profit_vs_rebuy_bookings']:+.1%}")


if __name__ == "__main__":
    main()
