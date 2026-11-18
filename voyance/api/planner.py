"""Turn the optimizer's buy quantities into plan lines a buyer can read and approve."""

from dataclasses import dataclass
from datetime import date

import numpy as np

from voyance.demand import scenarios
from voyance.optimizer import cvar, optimize, profits
from voyance.sim import ASSUMED_EVENT_LIFT, DEMAND_CV, WORST_SHARE, World, hidden_demand_mean

N_SCENARIOS = 200
PLAN_SEED = 0  # fixed, so the same request always gives the same plan (auditable)


class PlanRequestError(ValueError):
    """The request itself is wrong (e.g. an unknown city); safe to show to the caller."""


@dataclass(frozen=True)
class PlanLine:
    city: str
    week: str
    hotel: str
    rooms: int
    unit_cost: float
    unit_price: float
    expected_sold: float
    expected_profit: float
    reason: str
    why: dict  # the numbers behind `reason`, for the dashboard's charts (schemas.LineWhy)
    worst_case_profit: float  # this line alone, in its worst WORST_SHARE of scenarios
    buy_by: date


@dataclass(frozen=True)
class PlanResult:
    lines: tuple[PlanLine, ...]
    spend: float
    expected_profit: float
    worst_case_profit: float


def build_plan(world: World, budget: float, risk_aversion: float, cities: list[str] | None = None,
               demand_change: float = 0.0, cost_change: float = 0.0, event_lift: float | None = None) -> PlanResult:
    """Best buy plan within budget, best lines first.

    What-ifs re-plan in a different world: demand `demand_change` above the forecast (0.2 = +20%), supplier
    rates `cost_change` dearer, and this season's event weeks lifted `event_lift` times instead of the
    planner's own guess.
    """
    idx = _select(world, cities)
    lift = ASSUMED_EVENT_LIFT if event_lift is None else event_lift
    mean = hidden_demand_mean(world, lift)[idx] * (1 + demand_change)
    demand = scenarios(mean, DEMAND_CV, N_SCENARIOS, np.random.default_rng(PLAN_SEED))
    cost, price, cap = world.cost[idx] * (1 + cost_change), world.price[idx], world.cap[idx]
    buy = optimize(cost, price, cap, demand, budget, risk_aversion, WORST_SHARE)

    per_scenario = profits(buy, cost, price, demand)
    sold = np.minimum(buy, demand).mean(axis=0)
    line_profit = price * sold - cost * buy
    line_scenarios = price * np.minimum(buy, demand) - cost * buy  # scenarios x lines
    buy_by = world.first_night[idx] - world.buy_ahead_days[idx]
    lines = []
    for j, i in enumerate(idx):
        if buy[j] == 0:
            continue
        why = _why(world, i, mean[j], cost[j], price[j])
        lines.append(PlanLine(world.city[i], world.week[i], world.hotel[i], int(buy[j]), float(cost[j]),
                              float(price[j]), float(sold[j]), float(line_profit[j]), _reason(why), why,
                              cvar(line_scenarios[:, j], WORST_SHARE), buy_by[j].item()))
    return PlanResult(
        lines=tuple(sorted(lines, key=lambda line: -line.expected_profit)),
        spend=float(cost @ buy),
        expected_profit=float(per_scenario.mean()),
        worst_case_profit=cvar(per_scenario, WORST_SHARE),
    )


def _select(world: World, cities: list[str] | None) -> np.ndarray:
    if cities is None:
        return np.arange(len(world.city))
    if not cities:
        raise PlanRequestError("pick at least one city")
    unknown = sorted(set(cities) - set(world.city))
    if unknown:
        raise PlanRequestError(f"unknown cities: {', '.join(unknown)}")
    wanted = set(cities)
    return np.array([i for i, city in enumerate(world.city) if city in wanted])


def _why(world: World, i: int, expected_demand: float, cost: float, price: float) -> dict:
    return {
        "expected_demand": float(expected_demand),
        "booked_last_december": float(world.bookings_hist[-1, i]),
        "bookings_past_decembers": world.bookings_hist[:, i].tolist(),  # oldest first
        "soldout_searches_past": world.soldout_searches_hist[:, i].tolist(),
        "event_week": bool(world.event_lift_now[i] > 1),
        "margin": float((price - cost) / price),
    }


def _reason(why: dict) -> str:
    parts = [f"expected demand {why['expected_demand']:.0f} room-nights vs "
             f"{why['booked_last_december']:.0f} booked last December"]
    searches = sum(why["soldout_searches_past"])
    if searches > 0:
        parts.append(f"{searches:,.0f} sold-out searches in past Decembers")
    if why["event_week"]:
        parts.append("event week this year")
    parts.append(f"{why['margin']:.0%} margin")
    return "; ".join(parts)
