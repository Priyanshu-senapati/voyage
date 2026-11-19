"""Decision memory on real bookings: for each hotel-week, what we believed, what we decided, what happened.

Built on the walk-forward forecast (voyance.forecast), so every belief uses only what was known on the day the
decision would have been made. Two buyers: re-buying last year's demand, and Voyance buying the likely
forecast (the strategy the decision backtest validated). The contract cost is an assumption:
(1 - margin) x that week's average agent rate.
"""

import numpy as np
import pandas as pd

from voyance.forecast import walk_forward

DRIVER_LABELS = {
    "lead": "days ahead",
    "on_books": "already booked",
    "week_of_year": "season",
    "hotel": "the hotel",
    "final_last_year": "same week last year",
    "on_books_last_year": "booked by now last year",
    "on_books_4_weeks_earlier": "pace of recent weeks",
}
TOP_DRIVERS = 3
STRATEGIES = ("voyance", "rebuy_last_year")


def build_replay(frame: pd.DataFrame, test_from: pd.Timestamp, lead: int, margin: float) -> dict:
    """Every hotel-week from `test_from` on, decided `lead` days ahead, in date order, with running profits."""
    if not 0 < margin < 1:
        raise ValueError("margin must be between 0 and 1")
    test = frame[(frame["week"] >= test_from) & (frame["lead"] == lead) & frame["final_last_year"].notna()
                 & (frame["rate"] > 0)].sort_values(["week", "hotel"])
    if test.empty:
        raise ValueError("no hotel-weeks with last year's demand and a room rate at this lead")
    ranges, explanations = walk_forward(frame, test)
    running = dict.fromkeys(STRATEGIES, 0.0)
    totals = {name: dict.fromkeys(("profit", "rooms", "sold", "unsold", "turned_away"), 0.0) for name in STRATEGIES}
    weeks = []
    for row, (low, likely, high), (_, shap) in zip(test.itertuples(), ranges, explanations.iterrows()):
        actual, rate = float(row.final), float(row.rate)
        rooms = {"voyance": np.floor(likely), "rebuy_last_year": np.floor(row.final_last_year)}
        strategies = {name: _outcome(rooms[name], actual, rate, margin) for name in STRATEGIES}
        for name, outcome in strategies.items():
            running[name] += outcome["profit"]
            for key in totals[name]:
                totals[name][key] += outcome[key]
        weeks.append({
            "week": row.week.date().isoformat(),
            "hotel": str(row.hotel),
            "decided_on": (row.week - pd.Timedelta(days=lead)).date().isoformat(),
            "forecast": {"low": float(low), "likely": float(likely), "high": float(high),
                         "drivers": _drivers(shap.drop("base"))},
            "on_books": float(row.on_books),
            "last_year": float(row.final_last_year),
            "actual": actual,
            "rate": rate,
            "strategies": strategies,
            "running_profit": dict(running),
        })
    return {"assumptions": {"lead_days": int(lead), "margin": float(margin), "test_from": test_from.date().isoformat()},
            "weeks": weeks, "totals": totals}


def _outcome(rooms: float, actual: float, rate: float, margin: float) -> dict[str, float]:
    sold = min(rooms, actual)
    return {"rooms": float(rooms), "sold": float(sold), "unsold": float(rooms - sold),
            "turned_away": float(actual - sold), "profit": float(rate * sold - rate * (1 - margin) * rooms)}


def _drivers(contributions: pd.Series) -> list[dict]:
    """The biggest SHAP contributions to the likely forecast, in room-nights, biggest first."""
    top = contributions.reindex(contributions.abs().sort_values(ascending=False).index)[:TOP_DRIVERS]
    return [{"label": DRIVER_LABELS[feature], "room_nights": float(value)} for feature, value in top.items()]
