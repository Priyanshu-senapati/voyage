"""Score buying strategies on what really happened: real demand and real room rates.

For each hotel-week a buyer pre-buys room-nights `lead` days before the week starts; then the real bookings
arrive. Rooms not sold are lost (no release). The contract cost is an assumption, (1 - margin) x that week's
average agent rate, so results are reported for several margins.
"""

from collections.abc import Iterable

import numpy as np
import pandas as pd

from voyance.forecast import scenarios_from_range, walk_forward
from voyance.optimizer import optimize
from voyance.sim import WORST_SHARE

RISK_SETTINGS = (0.0, 0.3)  # 0 = most expected profit; 0.3 = the Buy Desk default (meant for a whole portfolio)
N_SCENARIOS = 200
BOOTSTRAP_DRAWS = 2000
BOOTSTRAP_SEED = 0  # fixed, so the intervals are reproducible
PLAN_SHUFFLE_SEED = 1  # fixed: which scenario of one week meets which of another in a whole-plan run


def strategy_names(risk_settings: Iterable[float] = RISK_SETTINGS) -> tuple[str, ...]:
    risk_settings = tuple(risk_settings)
    return ("rebuy_last_year", "pickup", "likely_forecast", *(f"optimizer_risk_{risk:g}" for risk in risk_settings),
            *(f"optimizer_plan_risk_{risk:g}" for risk in risk_settings if risk > 0))


def pickup_buys(rows: pd.DataFrame) -> np.ndarray:
    """The classic hotel pickup forecast: what is on the books now plus what last year picked up from the same
    lead (last year's final where its pace is unknown), in whole rooms."""
    picked_up = (rows["final_last_year"] - rows["on_books_last_year"]).to_numpy(dtype=float)
    forecast = np.where(np.isnan(picked_up), rows["final_last_year"].to_numpy(dtype=float),
                        rows["on_books"].to_numpy(dtype=float) + picked_up)
    return np.floor(np.clip(forecast, 0, None))


def outcome(buy: np.ndarray, actual: np.ndarray, price: np.ndarray, margin: float) -> dict[str, float]:
    """Profit, rooms bought, rooms left unsold and room-nights turned away for one strategy's buys."""
    buy, actual, price = (np.asarray(a, dtype=float) for a in (buy, actual, price))
    sold = np.minimum(buy, actual)
    return {"profit": float(price @ sold - price * (1 - margin) @ buy), "rooms_bought": float(buy.sum()),
            "unsold": float((buy - sold).sum()), "turned_away": float((actual - sold).sum())}


def decision_backtest(frame: pd.DataFrame, test_from: pd.Timestamp, leads: Iterable[int],
                      margins: Iterable[float], risk_settings: Iterable[float] = RISK_SETTINGS) -> dict:
    """Learn the forecast on weeks before `test_from`; then, for every later hotel-week, lead and margin,
    compare re-buying last year's demand, the pickup forecast (this year's bookings + last year's pickup), buying
    the likely forecast, and the optimizer on the forecast's range: each hotel-week decided alone (its own worst
    case, as if every week went wrong together) and, for risk > 0, the whole test window as one plan with one worst
    case (as if weeks went wrong independently). The truth is between the two. Uplifts are against re-buying and
    against pickup, with 95% intervals.
    """
    margins, risk_settings = tuple(margins), tuple(risk_settings)
    if not all(0 < m < 1 for m in margins):
        raise ValueError("each margin must be between 0 and 1")
    test = frame[(frame["week"] >= test_from) & frame["final_last_year"].notna() & (frame["rate"] > 0)]
    if test.empty:
        raise ValueError("no test weeks with last year's demand and a room rate")
    ranges, _ = walk_forward(frame, test)
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    added_rng = np.random.default_rng(BOOTSTRAP_SEED + 1)  # newer comparisons: the original draws stay as published
    results = []
    for lead in leads:
        at = (test["lead"] == lead).to_numpy()
        rows = test[at]
        low, likely, high = ranges[at].T
        actual, price = rows["final"].to_numpy(), rows["rate"].to_numpy()
        for margin in margins:
            # whole rooms, rounded down for every strategy, as the optimizer does
            names = strategy_names(risk_settings)
            buys = [np.floor(rows["final_last_year"].to_numpy()), pickup_buys(rows), np.floor(likely),
                    *(_optimizer_buys(low, likely, high, price, margin, risk) for risk in risk_settings),
                    *(_plan_buys(low, likely, high, price, margin, risk) for risk in risk_settings if risk > 0)]
            strategies = {name: outcome(buy, actual, price, margin) for name, buy in zip(names, buys)}
            weekly = {name: _weekly_profit(rows["week"], buy, actual, price, margin) for name, buy in zip(names, buys)}
            original = [n for n in names[1:] if n != "pickup" and not n.startswith("optimizer_plan")]
            added = [n for n in names[1:] if n not in original]
            for base, key, compared, draws in (("rebuy_last_year", "vs_rebuy", original, rng),
                                               ("rebuy_last_year", "vs_rebuy", added, added_rng),
                                               ("pickup", "vs_pickup", names[2:], added_rng)):
                for name in compared:
                    strategies[name][key] = float(weekly[name].sum() / weekly[base].sum() - 1)
                    strategies[name][f"{key}_95ci"] = _bootstrap_ci(weekly[name], weekly[base], draws)
            results.append({"lead": int(lead), "margin": margin, "hotel_weeks": len(rows),
                            "strategies": strategies})
    return {"test_weeks": [test["week"].min().date().isoformat(), test["week"].max().date().isoformat()],
            "results": results}


def _weekly_profit(weeks: pd.Series, buy: np.ndarray, actual: np.ndarray, price: np.ndarray,
                   margin: float) -> np.ndarray:
    """Profit per calendar week (all hotels together), so the bootstrap resamples whole weeks."""
    profit = price * np.minimum(buy, actual) - price * (1 - margin) * buy
    return pd.Series(profit, index=weeks.to_numpy()).groupby(level=0).sum().to_numpy()


def _bootstrap_ci(profits: np.ndarray, base: np.ndarray, rng: np.random.Generator) -> list[float]:
    """95% interval for (total profit / re-buy's total profit - 1), resampling calendar weeks."""
    picks = rng.integers(0, profits.size, size=(BOOTSTRAP_DRAWS, profits.size))
    ratios = profits[picks].sum(axis=1) / base[picks].sum(axis=1) - 1
    return [float(np.quantile(ratios, 0.025)), float(np.quantile(ratios, 0.975))]


def _plan_buys(low: np.ndarray, likely: np.ndarray, high: np.ndarray, price: np.ndarray, margin: float,
               risk_aversion: float) -> np.ndarray:
    """The optimizer with one worst case for all these hotel-weeks together, as the Buy Desk plans a season.
    The forecast's scenarios put the same quantile in every week (weeks that go wrong together); shuffling each
    week's scenarios on its own treats them as independent instead."""
    demand = np.random.default_rng(PLAN_SHUFFLE_SEED).permuted(
        scenarios_from_range(low, likely, high, N_SCENARIOS), axis=0)
    cost = price * (1 - margin)
    cap = np.ceil(demand.max(axis=0))
    return np.asarray(optimize(cost, price, cap, demand, budget=float(cost @ cap), risk_aversion=risk_aversion,
                               alpha=WORST_SHARE), dtype=float)


def _optimizer_buys(low: np.ndarray, likely: np.ndarray, high: np.ndarray, price: np.ndarray, margin: float,
                    risk_aversion: float) -> np.ndarray:
    demand = scenarios_from_range(low, likely, high, N_SCENARIOS)
    cost = price * (1 - margin)
    buys = []
    for j in range(price.size):  # each hotel-week is its own decision, taken on its own date
        cap = float(np.ceil(demand[:, j].max()))
        buys.append(optimize([cost[j]], [price[j]], [cap], demand[:, [j]], budget=cost[j] * cap,
                             risk_aversion=risk_aversion, alpha=WORST_SHARE)[0])
    return np.array(buys, dtype=float)
