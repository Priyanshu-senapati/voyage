"""Score buying strategies on what really happened: real demand and real room rates.

For each hotel-week a buyer pre-buys room-nights `lead` days before the week starts; then the real bookings
arrive. Rooms not sold are lost (no release). The contract cost is an assumption, (1 - margin) x that week's
average agent rate, so results are reported for several margins.

Two baselines: re-buying last year's final demand, and rebuy_plus_pickup (on the books now plus the rooms last
year's week still picked up from the same lead). The optimizer_risk_* strategies decide each hotel-week alone,
so their worst case is that one week's: much harsher than the Buy Desk's. The planner_risk_* strategies decide
each calendar month's hotel-weeks together as one plan, as the Buy Desk does, on scenarios whose weeks are
correlated by a rho estimated on the year before the test (and, for sensitivity, at rho = 0 and rho = 1).

Exploratory, added after the raw-range planner beat re-buying in only 4 of 9 settings: the *_rescaled strategies
take the same decisions on a range rescaled by the empirical 10/50/90% quantiles of final / likely, ignoring the
model's own low and high. The quantiles are learned walk-forward, per lead and decision month, only from weeks
finished before that month began (the range is left as forecast below MIN_RESCALING_ROWS of them). It is a
rescaling, not a calibration: 10-90% test coverage goes from 72-79% to 69-81% by lead.

Disclosures:
- Monthly plans: a month's hotel-weeks are planned together although their buy dates differ by 14-28 days (mean
  23). A review bounded the effect by buying each month on its first buy date: at most -1.3 points for
  planner_risk_0.3_rescaled (measured on an earlier, non-walk-forward rescaling) and at most -3.5 for
  planner_risk_0.3; every rescaled cell kept its sign.
- rebuy_plus_pickup is weak on this data: 2017's on-the-books ran 21-33% above 2016's by lead, inflated by
  bookings that later cancel, while finals rose 9%. vs_pickup is not a headline metric.
- The 9 lead x margin settings are one experiment, not nine: the same 68 hotel-weeks at each lead, and the
  margin only rescales cost.
- rho is estimated on 2016 with hindsight within that year, never on 2017; planner_risk_0.3 at rho = 0 differs
  from it by at most about 2 points, so it is a sensitivity setting, not a tuned parameter.
"""

from collections.abc import Iterable

import numpy as np
import pandas as pd

from voyance.forecast import QUANTILES, correlated_scenarios, scenarios_from_range, walk_forward
from voyance.optimizer import optimize
from voyance.sim import WORST_SHARE

RISK_SETTINGS = (0.0, 0.3)  # 0 = most expected profit; 0.3 = the Buy Desk default (meant for a whole portfolio)
N_SCENARIOS = 200
BOOTSTRAP_DRAWS = 2000
BOOTSTRAP_SEED = 0  # fixed, so the intervals are reproducible
SENSITIVITY_RISK = 0.3  # the planner at this risk is also run with uncorrelated and fully correlated weeks
FALLBACK_RHO = 0.5      # used when the year before the test has too few month groups to estimate rho
MIN_RHO_GROUPS = 3
MIN_RESCALING_ROWS = 20  # fewer finished rows at a lead by a decision month: its range is left as forecast
RHO_NOTE = ("estimated on 2016 weeks with hindsight within that year, never on 2017; planner_risk_0.3 at rho = 0 "
            "differs by at most about 2 points: a sensitivity setting, not a tuned parameter")


def strategy_names(risk_settings: Iterable[float] = RISK_SETTINGS) -> tuple[str, ...]:
    risk_settings = tuple(risk_settings)
    return ("rebuy_last_year", "likely_forecast", *(f"optimizer_risk_{risk:g}" for risk in risk_settings),
            "rebuy_plus_pickup", *(f"planner_risk_{risk:g}" for risk in risk_settings),
            f"planner_risk_{SENSITIVITY_RISK:g}_rho0", f"planner_risk_{SENSITIVITY_RISK:g}_rho1",
            "likely_rescaled", *(f"planner_risk_{risk:g}_rescaled" for risk in risk_settings))


def rebuy_plus_pickup(on_books: np.ndarray, final_last_year: np.ndarray,
                      on_books_last_year: np.ndarray) -> np.ndarray:
    """On the books now plus what last year's week still picked up from the same lead, in whole rooms (rounded
    down). Last year's final when last year's on-the-books is unknown."""
    on_books, final_last_year, on_books_last_year = (np.asarray(a, dtype=float)
                                                     for a in (on_books, final_last_year, on_books_last_year))
    pickup = on_books + np.maximum(0, final_last_year - on_books_last_year)
    return np.floor(np.where(np.isnan(on_books_last_year), final_last_year, pickup))


def outcome(buy: np.ndarray, actual: np.ndarray, price: np.ndarray, margin: float) -> dict[str, float]:
    """Profit, rooms bought, rooms left unsold and room-nights turned away for one strategy's buys, and the
    capital it ties up: spend (what the rooms cost) and profit per unit spent."""
    buy, actual, price = (np.asarray(a, dtype=float) for a in (buy, actual, price))
    sold = np.minimum(buy, actual)
    profit, spend = float(price @ sold - price * (1 - margin) @ buy), float(price * (1 - margin) @ buy)
    return {"profit": profit, "rooms_bought": float(buy.sum()),
            "unsold": float((buy - sold).sum()), "turned_away": float((actual - sold).sum()),
            "spend": spend, "profit_per_spend": profit / spend if spend > 0 else None}


def decision_backtest(frame: pd.DataFrame, test_from: pd.Timestamp, leads: Iterable[int],
                      margins: Iterable[float], risk_settings: Iterable[float] = RISK_SETTINGS) -> dict:
    """Learn the forecast on weeks before `test_from`; then, for every later hotel-week, lead and margin,
    compare re-buying last year's demand (alone and plus pickup), buying the likely forecast, and the optimizer
    on the forecast's range: per hotel-week (optimizer_risk_*) and per monthly plan (planner_risk_*).

    The per-week optimizer's worst case is that one week's: much harsher than the Buy Desk, where it is the
    whole plan's and good weeks offset bad ones. The planner's is the month's plan's.
    """
    leads, margins, risk_settings = tuple(leads), tuple(margins), tuple(risk_settings)
    if not all(0 < m < 1 for m in margins):
        raise ValueError("each margin must be between 0 and 1")
    test = frame[(frame["week"] >= test_from) & frame["final_last_year"].notna() & (frame["rate"] > 0)]
    if test.empty:
        raise ValueError("no test weeks with last year's demand and a room rate")
    ranges, _ = walk_forward(frame, test)
    fold, fold_ranges = pre_test_fold(frame, test_from, leads)
    correlation = estimate_rho(fold, fold_ranges)
    rho = correlation["rho"]
    # every row whose final is known by some decision month: the rescaling learns from those finished before it
    known = pd.concat([fold[["lead", "week", "final"]].assign(likely=fold_ranges[:, 1]),
                       test[["lead", "week", "final"]].assign(likely=ranges[:, 1])])
    names, per_week = strategy_names(risk_settings), 2 + len(risk_settings)
    paired = [f"planner_risk_{risk:g}{kind}" for kind in ("", "_rescaled") for risk in risk_settings]
    blocked = [name for name in ("likely_forecast", f"planner_risk_{SENSITIVITY_RISK:g}",
                                 f"planner_risk_{SENSITIVITY_RISK:g}_rescaled") if name in names]
    # each generation of intervals draws from its own stream, so adding one leaves the earlier ones' draws alone:
    # the per-week strategies' vs_rebuy; the planner's and every vs_pickup; the rescaled ones; vs_likely and the
    # month blocks
    rng, later, latest, paired_draws = (np.random.default_rng(BOOTSTRAP_SEED + i) for i in range(4))
    rescaled = names[names.index("likely_rescaled"):]
    newer = {name: latest if name in rescaled else later for name in names}
    first = {name: rng if name in names[:per_week] else newer[name] for name in names}
    results, coverage, rescaling = [], {}, {}
    for lead in leads:
        at = (test["lead"] == lead).to_numpy()
        rows = test[at]
        low, likely, high = ranges[at].T
        actual, price = rows["final"].to_numpy(), rows["rate"].to_numpy()
        decided = _decision_month(rows)
        by_month = range_rescaling(known[known["lead"] == lead], decided)
        scale = np.array([[by_month[month][q] for q in ("q10", "q50", "q90")] for month in decided])
        low_c, likely_c, high_c = rescaled_range(likely, scale).T
        rescaling[int(lead)] = {
            "by_decision_month": {month.strftime("%Y-%m"): q for month, q in by_month.items()},
            "fell_back_rows": int(sum(by_month[month]["rows"] < MIN_RESCALING_ROWS for month in decided))}
        coverage[int(lead)] = {"before": float(((low <= actual) & (actual <= high)).mean()),
                               "after": float(((low_c <= actual) & (actual <= high_c)).mean())}
        week_months = _year_month(pd.Series(np.unique(rows["week"].to_numpy())))  # matches _weekly_profit's order
        for margin in margins:
            plan = (rows["week"], low, likely, high, price, margin, lead)
            # whole rooms, rounded down for every strategy, as the optimizer does
            buys = [np.floor(rows["final_last_year"].to_numpy()), np.floor(likely),
                    *(_optimizer_buys(low, likely, high, price, margin, risk) for risk in risk_settings),
                    rebuy_plus_pickup(rows["on_books"], rows["final_last_year"], rows["on_books_last_year"]),
                    *(_planner_buys(*plan, risk, rho) for risk in risk_settings),
                    _planner_buys(*plan, SENSITIVITY_RISK, 0.0), _planner_buys(*plan, SENSITIVITY_RISK, 1.0),
                    np.floor(likely_c),
                    *(_planner_buys(rows["week"], low_c, likely_c, high_c, price, margin, lead, risk, rho)
                      for risk in risk_settings)]
            strategies = {name: outcome(buy, actual, price, margin) for name, buy in zip(names, buys)}
            weekly = [_weekly_profit(rows["week"], buy, actual, price, margin) for buy in buys]
            for name, profits in zip(names[1:], weekly[1:]):
                strategies[name]["vs_rebuy"] = float(profits.sum() / weekly[0].sum() - 1)
                strategies[name]["vs_rebuy_95ci"] = _bootstrap_ci(profits, weekly[0], first[name])
            pickup = weekly[names.index("rebuy_plus_pickup")]
            for name, profits in zip(names[1:], weekly[1:]):
                if name != "rebuy_plus_pickup":
                    strategies[name]["vs_pickup"] = float(profits.sum() / pickup.sum() - 1)
                    strategies[name]["vs_pickup_95ci"] = _bootstrap_ci(profits, pickup, newer[name])
            weekly = dict(zip(names, weekly))
            base, plain = weekly["rebuy_last_year"], weekly["likely_forecast"]
            for name in paired:
                strategies[name]["vs_likely"] = float(weekly[name].sum() / plain.sum() - 1)
                strategies[name]["vs_likely_95ci"] = _bootstrap_ci(weekly[name], plain, paired_draws)
            for name in blocked:
                strategies[name]["vs_rebuy_95ci_month_block"] = _month_block_ci(weekly[name], base, week_months,
                                                                                paired_draws)
                if name in paired:
                    strategies[name]["vs_likely_95ci_month_block"] = _month_block_ci(weekly[name], plain,
                                                                                     week_months, paired_draws)
            results.append({"lead": int(lead), "margin": margin, "hotel_weeks": len(rows),
                            "strategies": strategies})
    return {"test_weeks": [test["week"].min().date().isoformat(), test["week"].max().date().isoformat()],
            **correlation, "rho_note": RHO_NOTE, "range_rescaling": rescaling, "test_range_coverage": coverage,
            "results": results}


def pre_test_fold(frame: pd.DataFrame, test_from: pd.Timestamp,
                  leads: Iterable[int]) -> tuple[pd.DataFrame, np.ndarray]:
    """The calendar year before the test (weeks with last year's demand, at these leads) and its low / likely /
    high, forecast walk-forward: each model learned only on weeks finished before its decision month, as for
    the test."""
    fold = frame[(frame["week"].dt.year == test_from.year - 1) & (frame["week"] < test_from)
                 & frame["final_last_year"].notna() & frame["lead"].isin(tuple(leads))]
    return fold, (walk_forward(frame, fold)[0] if not fold.empty else np.empty((0, len(QUANTILES))))


def estimate_rho(fold: pd.DataFrame, ranges: np.ndarray) -> dict:
    """How much forecast misses move together within a month's plan, learned on the pre-test fold: misses
    scaled by their range's width, then their intraclass correlation within (lead, month of the week) groups.
    Falls back to FALLBACK_RHO with too few groups."""
    groups = 0
    if not fold.empty:
        low, likely, high = ranges.T
        errors = (fold["final"].to_numpy() - likely) / np.maximum(high - low, 1)
        rho, groups = intraclass_correlation(errors, [fold["lead"].to_numpy(), _year_month(fold["week"])])
        if groups >= MIN_RHO_GROUPS:
            return {"rho": rho, "rho_source": "estimated", "rho_groups": groups}
    return {"rho": FALLBACK_RHO, "rho_source": "fallback", "rho_groups": groups}


def range_rescaling(known: pd.DataFrame, decided: pd.Series) -> dict[pd.Timestamp, dict]:
    """For each decision month in `decided`: the 10/50/90% quantiles of final / max(likely, 1) over the rows of
    `known` (one lead's: week, final, likely) whose week had finished before that month began, the cut
    walk_forward learns with, and how many rows that was; (1, 1, 1), the range left as forecast, below
    MIN_RESCALING_ROWS rows."""
    by_month = {}
    for start in sorted(decided.unique()):
        seen = known[known["week"] + pd.Timedelta(days=6) < start]
        ratio = seen["final"].to_numpy(dtype=float) / np.maximum(seen["likely"].to_numpy(dtype=float), 1)
        q = np.quantile(ratio, QUANTILES) if ratio.size >= MIN_RESCALING_ROWS else np.ones(len(QUANTILES))
        by_month[start] = {"q10": float(q[0]), "q50": float(q[1]), "q90": float(q[2]), "rows": int(ratio.size)}
    return by_month


def rescaled_range(likely: np.ndarray, scale: np.ndarray) -> np.ndarray:
    """Low, likely and high (rows x 3): each likely forecast times its row's (q10, q50, q90), in order."""
    return np.sort(np.asarray(likely, dtype=float)[:, None] * np.asarray(scale, dtype=float), axis=1)


def _decision_month(rows: pd.DataFrame) -> pd.Series:
    """The calendar month each row is decided in (`lead` days before its week), as walk_forward groups them."""
    return (rows["week"] - pd.to_timedelta(rows["lead"], unit="D")).dt.to_period("M").dt.start_time


def intraclass_correlation(values: np.ndarray, groups) -> tuple[float, int]:
    """One-way ANOVA intraclass correlation, (MSB - MSW) / (MSB + (k - 1) MSW) with k the mean group size,
    clipped to [0, 1], over the groups with 2 or more values; and how many such groups there were (NaN below
    MIN_RHO_GROUPS)."""
    stats = pd.Series(np.asarray(values, dtype=float)).groupby(groups).agg(["size", "mean", "var"])
    stats = stats[stats["size"] >= 2]
    g = len(stats)
    if g < MIN_RHO_GROUPS:
        return float("nan"), g
    n, total = stats["size"], stats["size"].sum()
    grand = (n * stats["mean"]).sum() / total
    msb = (n * (stats["mean"] - grand) ** 2).sum() / (g - 1)
    msw = ((n - 1) * stats["var"]).sum() / (total - g)
    spread = msb + (n.mean() - 1) * msw
    return (float(np.clip((msb - msw) / spread, 0, 1)) if spread > 0 else 0.0), g


def _year_month(weeks: pd.Series) -> np.ndarray:
    return (weeks.dt.year * 100 + weeks.dt.month).to_numpy()


def _weekly_profit(weeks: pd.Series, buy: np.ndarray, actual: np.ndarray, price: np.ndarray,
                   margin: float) -> np.ndarray:
    """Profit per calendar week (all hotels together), so the bootstrap resamples whole weeks."""
    profit = price * np.minimum(buy, actual) - price * (1 - margin) * buy
    return pd.Series(profit, index=weeks.to_numpy()).groupby(level=0).sum().to_numpy()


def _bootstrap_ci(profits: np.ndarray, base: np.ndarray, rng: np.random.Generator) -> list[float]:
    """95% interval for (total profit / a baseline's total profit - 1), resampling calendar weeks."""
    picks = rng.integers(0, profits.size, size=(BOOTSTRAP_DRAWS, profits.size))
    ratios = profits[picks].sum(axis=1) / base[picks].sum(axis=1) - 1
    return [float(np.quantile(ratios, 0.025)), float(np.quantile(ratios, 0.975))]


def _month_block_ci(profits: np.ndarray, base: np.ndarray, months: np.ndarray,
                    rng: np.random.Generator) -> list[float]:
    """Like _bootstrap_ci, but resampling calendar months (all of a month's weeks together), since weeks in the
    same month move together. `months` labels each week."""
    def by_month(weekly: np.ndarray) -> np.ndarray:
        return pd.Series(weekly).groupby(np.asarray(months)).sum().to_numpy()
    return _bootstrap_ci(by_month(profits), by_month(base), rng)


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


def _planner_buys(weeks: pd.Series, low: np.ndarray, likely: np.ndarray, high: np.ndarray, price: np.ndarray,
                  margin: float, lead: int, risk_aversion: float, rho: float) -> np.ndarray:
    """Each calendar month's hotel-weeks (by the month their week starts) decided together as one plan."""
    month = _year_month(weeks)
    cost = price * (1 - margin)
    buys = np.zeros(price.size)
    for ym in np.unique(month):
        at = month == ym
        # seeded by lead and month: reproducible, and the same draws for every margin, risk and rho
        demand = correlated_scenarios(low[at], likely[at], high[at], N_SCENARIOS, rho, seed=[int(lead), int(ym)])
        cap = np.ceil(demand.max(axis=0))
        # a budget that never binds: caution over the plan's shared worst case, not money, shapes the buys
        buys[at] = optimize(cost[at], price[at], cap, demand, budget=float(cost[at] @ cap),
                            risk_aversion=risk_aversion, alpha=WORST_SHARE)
    return buys
