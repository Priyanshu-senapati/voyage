"""Semi-real test of hidden demand: real weekly demand, an allotment that hides its peaks, synthetic searches.

The public bookings have no sold-out search log, so everything here is real except the searches. Each hotel-week's
real room-nights are the truth. Last year's allotment is taken to be the hotel's typical (median) week before the
test, so last year's peaks sold out and only the bookings that fit were recorded. The sold-out searches are drawn
from the demand that didn't fit (Poisson, at a look-to-book ratio). Then re-buying last year's bookings is compared,
on the real outcome, with re-buying last year's hidden demand (bookings + searches / the look-to-book ratio the
planner assumes): with that ratio right, 30% off either way, or with half the searches logged twice.

Two ways to buy from each estimate: re-buy it whole, or size it like the planner (the newsvendor point, buying
until a room's chance of selling no longer pays for its cost, with the real year-to-year swing). Re-buying a full
estimate over-buys at these margins, so the sized comparison is the fair one for hidden demand.
"""

import numpy as np
import pandas as pd
from scipy.stats import norm

from voyance.backtest import outcome
from voyance.demand import unconstrain
from voyance.sim import LOOK_TO_BOOK

DRAWS = 200
YEAR_TO_YEAR_CV = 0.22  # real demand swing for the same week, year to year (out/calibration.json)
CASES = {  # name: (real searches per booking / the assumed ratio, share of searches logged twice)
    "look-to-book as assumed": (1.0, 0.0),
    "30% more searches per booking than assumed": (1.3, 0.0),
    "30% fewer searches per booking than assumed": (0.7, 0.0),
    "50% duplicate searches": (1.0, 0.5),
}


def newsvendor_share(margin: float, cv: float = YEAR_TO_YEAR_CV) -> float:
    """Share of expected demand to buy when a sold room earns `margin` of its price and an unsold one loses the
    rest: the `margin` quantile of a log-normal demand with mean 1 and this coefficient of variation."""
    sigma = float(np.sqrt(np.log1p(cv**2)))
    return float(np.exp(-sigma**2 / 2 + sigma * norm.ppf(margin)))


def censoring_test(frame: pd.DataFrame, test_from: pd.Timestamp, margin: float = 0.2, allotment: float = 1.0,
                   draws: int = DRAWS, seed: int = 0) -> dict:
    """Re-buying last year's bookings against re-buying last year's hidden demand, on every hotel-week from
    `test_from` on. `allotment` scales last year's allotment (1 = the hotel's typical week before the test)."""
    weeks = frame.drop_duplicates(["hotel", "week"])
    typical = weeks[weeks["week"] < test_from].groupby("hotel")["final"].median() * allotment
    test = weeks[(weeks["week"] >= test_from) & weeks["final_last_year"].notna() & (weeks["rate"] > 0)]
    if test.empty:
        raise ValueError("no test weeks with last year's demand and a room rate")
    last = test["final_last_year"].to_numpy(dtype=float)
    booked = np.minimum(last, np.floor(test["hotel"].map(typical).to_numpy(dtype=float)))
    actual, price = test["final"].to_numpy(dtype=float), test["rate"].to_numpy(dtype=float)
    rebuy = outcome(np.floor(booked), actual, price, margin)
    share = newsvendor_share(margin)
    sized_bookings = outcome(np.floor(booked * share), actual, price, margin)
    full = outcome(np.floor(last), actual, price, margin)  # had last year's demand been seen in full
    rng = np.random.default_rng(seed)
    cases = {}
    for name, (ratio, duplicates) in CASES.items():
        runs = []
        for _ in range(draws):
            searches = rng.poisson((last - booked) * LOOK_TO_BOOK * ratio)
            searches = searches + rng.binomial(searches, duplicates)  # agents retrying, logged again
            estimate = unconstrain(booked, searches, LOOK_TO_BOOK)
            sized = outcome(np.floor(estimate * share), actual, price, margin)
            runs.append({**outcome(np.floor(estimate), actual, price, margin),
                         "error_of_last_year": float(np.abs(estimate - last).sum() / last.sum()),
                         **{f"sized_{key}": value for key, value in sized.items()}})
        mean = {key: float(np.mean([run[key] for run in runs])) for key in runs[0]}
        cases[name] = {**mean, "profit_vs_rebuy_bookings": mean["profit"] / rebuy["profit"] - 1,
                       "sized_vs_sized_bookings": mean["sized_profit"] / sized_bookings["profit"] - 1}
    return {"hotel_weeks": len(test), "censored_weeks": int((last > booked).sum()), "margin": margin,
            "allotment": allotment, "bookings_error": float(np.abs(booked - last).sum() / last.sum()),
            "rebuy_bookings": rebuy, "newsvendor_share": share, "sized_bookings": sized_bookings,
            "rebuy_full_demand": {**full, "profit_vs_rebuy_bookings": full["profit"] / rebuy["profit"] - 1},
            "cases": cases}
