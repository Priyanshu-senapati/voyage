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
from voyance.calibrate import fetch_verified, summary  # noqa: E402
from voyance.sim import DEMAND_CV, WEEK_FACTOR  # noqa: E402

URL = "https://raw.githubusercontent.com/rfordatascience/tidytuesday/master/data/2020/2020-02-11/hotels.csv"
SHA256 = "7c2ae42a7353905ea136e5c2287f17c92c5435826598bfbb8491c6f0c7b1fc06"
RAW = ROOT / "data" / "raw" / "hotels.csv"
OUT = ROOT / "out" / "calibration.json"


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    data = fetch_verified(RAW, URL, SHA256)
    rows = list(csv.DictReader(io.StringIO(data.decode("utf-8"), newline="")))
    sim_shape = np.asarray(WEEK_FACTOR, dtype=float)
    report = {
        "real_agent_bookings": summary(rows),
        "simulator": {"december_shape": (sim_shape / sim_shape.mean()).round(3).tolist(), "demand_cv": DEMAND_CV},
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    logging.info(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
