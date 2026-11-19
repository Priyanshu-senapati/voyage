"""Booking cancellations: which bought room-nights still earn.

Each booking cancels with probability c, and a share L of cancellations comes too late to sell the room again
(within 7 days of arrival; real agent bookings, `python scripts/calibrate.py`). An early cancellation frees the
room for the next booker, whose booking can cancel too. A room resold whenever it comes back is in the end kept
(its holder stays, 1 - c) or lost (a late cancellation, cL); an early one (c(1 - L)) puts it back on sale. So

    k = (1 - c) / (1 - c(1 - L))      the share of a sold-out room's nights that is kept

With b rooms bought and gross booking demand d, the room-nights that earn are about

    kept = min(b k, d (1 - c))

Sold out: early cancellations are resold to the demand that was turned away, b k. Spare stock: nobody is waiting
for a room, so every cancellation is lost, d (1 - c). Taking out k (d (1 - c) / k = d (1 - c(1 - L))),

    kept = k min(b, d_eff),   d_eff = d (1 - c(1 - L))

so revenue = price x kept = price_eff x min(b, d_eff) with price_eff = price k: the optimizer plans on
(price_eff, d_eff) unchanged. Without cancellations k = 1 and d_eff = d exactly.

The min is an upper bound: it assumes a new booker turns up after every early cancellation of a sold-out room;
between the two regimes fewer do. Unsold and cancelled rooms are worth nothing (salvage 0), and cancellation fees
are ignored, which is conservative (a fee only adds revenue).

Basis: d counts gross bookings, the ones that later cancel included. Demand measured as stays (the real-data
pipeline: forecast.py's "final", calibrate.py, the position monitor) already has cancellations taken out: leave the
rates at 0 for it, or cancellations are counted twice.
"""

import json
from pathlib import Path

import numpy as np
from numpy.typing import ArrayLike

CALIBRATION = Path(__file__).resolve().parent.parent / "out" / "calibration.json"
FALLBACK = (0.41, 0.115)  # real agent bookings, if out/calibration.json is missing


def defaults() -> tuple[float, float]:
    """The real agent cancel rate and late-cancel share (out/calibration.json), else FALLBACK."""
    try:
        real = json.loads(CALIBRATION.read_text(encoding="utf-8"))["real_agent_bookings"]
        return float(real["agent_cancel_rate"]), float(real["agent_late_cancel_share"])
    except (OSError, ValueError, KeyError, TypeError):
        return FALLBACK


def kept_share(cancel_rate: ArrayLike, late_share: ArrayLike) -> np.ndarray:
    """k: the share of a sold-out room's nights kept once early cancellations are resold (1 without any)."""
    c, late = _check(cancel_rate, late_share)
    return (1 - c) / (1 - c * (1 - late))


# shortcut: demand must be gross bookings; add a stays basis (kept = min(b k, stays)) for forecasts of stays.
def effective(price: ArrayLike, demand: ArrayLike, cancel_rate: ArrayLike,
              late_share: ArrayLike) -> tuple[np.ndarray, np.ndarray]:
    """(price_eff, demand_eff): revenue = price_eff x min(buy, demand_eff). demand is gross bookings and may be
    scenarios x items."""
    c, late = _check(cancel_rate, late_share)
    return (np.asarray(price, dtype=float) * kept_share(c, late),
            np.asarray(demand, dtype=float) * (1 - c * (1 - late)))


def kept_rooms(buy: ArrayLike, demand: ArrayLike, cancel_rate: ArrayLike, late_share: ArrayLike) -> np.ndarray:
    """Room-nights that stay booked and earn: min(buy k, demand (1 - c)), broadcast like numpy (rates too)."""
    c, late = _check(cancel_rate, late_share)
    return np.minimum(np.asarray(buy, dtype=float) * kept_share(c, late), np.asarray(demand, dtype=float) * (1 - c))


def _check(cancel_rate: ArrayLike, late_share: ArrayLike) -> tuple[np.ndarray, np.ndarray]:
    c, late = np.asarray(cancel_rate, dtype=float), np.asarray(late_share, dtype=float)
    if not ((0 <= c) & (c < 1)).all():  # NaN fails too
        raise ValueError("cancel_rate must be in [0, 1)")
    if not ((0 <= late) & (late <= 1)).all():
        raise ValueError("late_share must be in [0, 1]")
    return c, late
