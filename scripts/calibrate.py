"""Check the simulator against real hotel bookings.

Run from the project root:  python scripts/calibrate.py
Downloads the public hotel-bookings dataset once into data/raw/ (CC BY 4.0, credited in voyance/calibrate.py),
checks its SHA-256, and writes out/calibration.json: real agent-booking facts next to the simulator's settings.
"""

import csv
import io
import json
import logging
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import pandas as pd  # noqa: E402

from voyance.calibrate import DATASET_SHA256, DATASET_URL, fetch_verified, summary  # noqa: E402
from voyance.forecast import agent_bookings, booked_share_by_lead, booking_curves  # noqa: E402
from voyance.sim import DEMAND_CV, WEEK_FACTOR  # noqa: E402

RAW = ROOT / "data" / "raw" / "hotels.csv"
OUT = ROOT / "out" / "calibration.json"
PACE_LEADS = (150, 120, 90, 60, 45, 30, 21, 14, 7, 0)  # days before the week starts


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    data = fetch_verified(RAW, DATASET_URL, DATASET_SHA256)
    rows = list(csv.DictReader(io.StringIO(data.decode("utf-8"), newline="")))
    sim_shape = np.asarray(WEEK_FACTOR, dtype=float)
    real = summary(rows)
    curves = booking_curves(agent_bookings(pd.read_csv(io.BytesIO(data))), leads=PACE_LEADS)
    real["december_booked_share"] = {str(lead): round(share, 4)
                                     for lead, share in sorted(booked_share_by_lead(curves, month=12).items(),
                                                               reverse=True)}
    report = {
        "real_agent_bookings": real,
        "simulator": {"december_shape": (sim_shape / sim_shape.mean()).round(3).tolist(), "demand_cv": DEMAND_CV},
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    logging.info(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
