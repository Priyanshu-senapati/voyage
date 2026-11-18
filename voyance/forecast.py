"""Demand forecast from the booking curve: what is on the books some days ahead -> final room-nights.

Learned on real agent bookings (the dataset in voyance.calibrate). One LightGBM model per quantile gives a
low / likely / high range, and LightGBM's own SHAP values say what moved each forecast.
"""

import calendar
from dataclasses import dataclass

import lightgbm as lgb
import numpy as np
import pandas as pd

from voyance.calibrate import AGENT_CHANNEL

LEADS = (7, 14, 30, 60, 90, 120, 150)  # days before the week starts that a forecast is made
QUANTILES = (0.1, 0.5, 0.9)          # low, likely, high
FEATURES = ("lead", "on_books", "week_of_year", "hotel", "final_last_year", "on_books_last_year",
            "on_books_4_weeks_earlier")
MODEL_PARAMS = {"n_estimators": 300, "learning_rate": 0.03, "num_leaves": 15, "min_child_samples": 10,
                "deterministic": True, "force_row_wise": True, "n_jobs": 1, "random_state": 0, "verbose": -1}
KEYS = ["hotel", "week", "lead"]
MONTHS = {name: number for number, name in enumerate(calendar.month_name) if name}


def agent_bookings(raw: pd.DataFrame) -> pd.DataFrame:
    """One row per agent booking: hotel, arrival week (its Monday), when it was booked and cancelled, room-nights."""
    rows = raw[raw["distribution_channel"] == AGENT_CHANNEL]
    arrival = pd.to_datetime(pd.DataFrame({"year": rows["arrival_date_year"].astype(int),
                                           "month": rows["arrival_date_month"].map(MONTHS),
                                           "day": rows["arrival_date_day_of_month"].astype(int)}))
    kept = rows["is_canceled"].astype(int) == 0
    return pd.DataFrame({
        "hotel": rows["hotel"],
        "arrival": arrival,
        "week": arrival - pd.to_timedelta(arrival.dt.weekday, unit="D"),
        "booked": arrival - pd.to_timedelta(rows["lead_time"].astype(int), unit="D"),
        "cancelled_on": pd.to_datetime(rows["reservation_status_date"]).where(~kept),
        "nights": rows["stays_in_weekend_nights"].astype(int) + rows["stays_in_week_nights"].astype(int),
        "kept": kept,
    }).reset_index(drop=True)


def booking_curves(bookings: pd.DataFrame, leads: tuple[int, ...] = LEADS) -> pd.DataFrame:
    """Per hotel, arrival week and lead: room-nights on the books `lead` days before the week, and the final.

    On the books = booked by then and not yet cancelled. Final = room-nights of bookings that were kept.
    Weeks the data covers only in part are left out.
    """
    final = bookings[bookings["kept"]].groupby(["hotel", "week"])["nights"].sum()
    full = ((final.index.get_level_values("week") >= bookings["arrival"].min())
            & (final.index.get_level_values("week") + pd.Timedelta(days=6) <= bookings["arrival"].max()))
    final = final[full]
    parts = []
    for lead in leads:
        as_of = bookings["week"] - pd.Timedelta(days=lead)
        held = (bookings["booked"] <= as_of) & (bookings["cancelled_on"].isna() | (bookings["cancelled_on"] > as_of))
        on_books = bookings[held].groupby(["hotel", "week"])["nights"].sum().reindex(final.index, fill_value=0)
        parts.append(pd.DataFrame({"lead": lead, "on_books": on_books, "final": final}))
    if not parts or final.empty:
        return pd.DataFrame(columns=[*KEYS, "on_books", "final"])
    return pd.concat(parts).reset_index()[[*KEYS, "on_books", "final"]]


def with_history(curves: pd.DataFrame) -> pd.DataFrame:
    """Adds the season, last year (same hotel, 52 weeks earlier) and the pace of the week 4 weeks earlier."""
    last_year = (curves.assign(week=curves["week"] + pd.Timedelta(weeks=52))
                 .rename(columns={"on_books": "on_books_last_year", "final": "final_last_year"}))
    # the week 4 weeks earlier, at the same lead, was forecast 4 weeks earlier: known by now
    earlier = (curves.assign(week=curves["week"] + pd.Timedelta(weeks=4))[[*KEYS, "on_books"]]
               .rename(columns={"on_books": "on_books_4_weeks_earlier"}))
    return (curves.assign(week_of_year=curves["week"].dt.isocalendar().week.astype(int))
            .merge(last_year, on=KEYS, how="left").merge(earlier, on=KEYS, how="left"))


@dataclass(frozen=True)
class Forecaster:
    models: tuple[lgb.LGBMRegressor, ...]  # one per QUANTILES
    hotels: tuple[str, ...]

    def predict(self, frame: pd.DataFrame) -> np.ndarray:
        """Low, likely and high final room-nights, one row per row of `frame`."""
        x = _design(frame, self.hotels)
        ranges = np.column_stack([model.predict(x) for model in self.models])
        return np.clip(np.sort(ranges, axis=1), 0, None)  # quantile models can cross; keep low <= likely <= high

    def explain(self, frame: pd.DataFrame) -> pd.DataFrame:
        """How much each feature moved the likely forecast (SHAP values), plus the base value they start from."""
        contributions = self.models[QUANTILES.index(0.5)].predict(_design(frame, self.hotels), pred_contrib=True)
        return pd.DataFrame(contributions, columns=[*FEATURES, "base"], index=frame.index)


def fit(frame: pd.DataFrame) -> Forecaster:
    if frame.empty:
        raise ValueError("no weeks to learn from")
    hotels = tuple(sorted(frame["hotel"].unique()))
    x = _design(frame, hotels)
    models = tuple(lgb.LGBMRegressor(objective="quantile", alpha=q, **MODEL_PARAMS).fit(x, frame["final"])
                   for q in QUANTILES)
    return Forecaster(models, hotels)


def _design(frame: pd.DataFrame, hotels: tuple[str, ...]) -> pd.DataFrame:
    unknown = set(frame["hotel"]) - set(hotels)
    if unknown:
        raise ValueError(f"no forecast trained for: {', '.join(sorted(unknown))}")
    x = frame[list(FEATURES)].copy()
    x["hotel"] = pd.Categorical(x["hotel"], categories=list(hotels))  # same codes in training and forecasting
    return x


def wape(forecast: np.ndarray, actual: np.ndarray) -> float:
    """Weighted absolute percentage error: total miss / total demand."""
    return float(np.abs(np.asarray(forecast) - np.asarray(actual)).sum() / np.asarray(actual).sum())


def backtest(frame: pd.DataFrame, test_from: pd.Timestamp) -> dict:
    """Learn on weeks before `test_from`, score the weeks from it on, against re-buying last year's demand."""
    train, test = frame[frame["week"] < test_from], frame[frame["week"] >= test_from]
    test = test[test["final_last_year"].notna()]  # score both on the same weeks
    if test.empty:
        raise ValueError("no test weeks with a last year to compare against")
    model = fit(train)
    low, likely, high = model.predict(test).T
    by_lead = []
    for lead in sorted(test["lead"].unique()):
        at = (test["lead"] == lead).to_numpy()
        actual = test["final"].to_numpy()[at]
        by_lead.append({
            "lead": int(lead),
            "hotel_weeks": int(at.sum()),
            "wape_last_year": wape(test["final_last_year"].to_numpy()[at], actual),
            "wape_forecast": wape(likely[at], actual),
            "range_coverage": float(((low[at] <= actual) & (actual <= high[at])).mean()),
            "share_on_books": float(test["on_books"].to_numpy()[at].sum() / actual.sum()),
        })
    shap = model.explain(test).drop(columns="base").abs().mean()
    return {
        "train_weeks": [train["week"].min().date().isoformat(), train["week"].max().date().isoformat()],
        "test_weeks": [test["week"].min().date().isoformat(), test["week"].max().date().isoformat()],
        "by_lead": by_lead,
        "mean_abs_shap": {feature: float(shap[feature]) for feature in FEATURES},
    }
