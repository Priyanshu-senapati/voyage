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


def strategy_names(risk_settings: Iterable[float] = RISK_SETTINGS) -> tuple[str, ...]:
    return ("rebuy_last_year", "likely_forecast", *(f"optimizer_risk_{risk:g}" for risk in risk_settings))


def outcome(buy: np.ndarray, actual: np.ndarray, price: np.ndarray, margin: float) -> dict[str, float]:
    """Profit, rooms bought, rooms left unsold and room-nights turned away for one strategy's buys."""
    buy, actual, price = (np.asarray(a, dtype=float) for a in (buy, actual, price))
    sold = np.minimum(buy, actual)
    return {"profit": float(price @ sold - price * (1 - margin) @ buy), "rooms_bought": float(buy.sum()),
            "unsold": float((buy - sold).sum()), "turned_away": float((actual - sold).sum())}


def decision_backtest(frame: pd.DataFrame, test_from: pd.Timestamp, leads: Iterable[int],
                      margins: Iterable[float], risk_settings: Iterable[float] = RISK_SETTINGS) -> dict:
    """Learn the forecast on weeks before `test_from`; then, for every later hotel-week, lead and margin,
    compare re-buying last year's demand, buying the likely forecast, and the optimizer on the forecast's range.

    Each hotel-week is decided alone, so the optimizer's worst case is that one week's: much harsher than the
    Buy Desk, where it is the whole plan's and good weeks offset bad ones.
    """
    margins, risk_settings = tuple(margins), tuple(risk_settings)
    if not all(0 < m < 1 for m in margins):
        raise ValueError("each margin must be between 0 and 1")
    test = frame[(frame["week"] >= test_from) & frame["final_last_year"].notna() & (frame["rate"] > 0)]
    if test.empty:
        raise ValueError("no test weeks with last year's demand and a room rate")
    ranges, _ = walk_forward(frame, test)
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    results = []
    for lead in leads:
        at = (test["lead"] == lead).to_numpy()
        rows = test[at]
        low, likely, high = ranges[at].T
        actual, price = rows["final"].to_numpy(), rows["rate"].to_numpy()
        for margin in margins:
            # whole rooms, rounded down for every strategy, as the optimizer does
            buys = [np.floor(rows["final_last_year"].to_numpy()), np.floor(likely),
                    *(_optimizer_buys(low, likely, high, price, margin, risk) for risk in risk_settings)]
            strategies = {name: outcome(buy, actual, price, margin)
                          for name, buy in zip(strategy_names(risk_settings), buys)}
            weekly = [_weekly_profit(rows["week"], buy, actual, price, margin) for buy in buys]
            for name, profits in zip(strategy_names(risk_settings)[1:], weekly[1:]):
                strategies[name]["vs_rebuy"] = float(profits.sum() / weekly[0].sum() - 1)
                strategies[name]["vs_rebuy_95ci"] = _bootstrap_ci(profits, weekly[0], rng)
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
