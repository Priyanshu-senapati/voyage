"""Turn the optimizer's buy quantities into plan lines a buyer can read and approve."""

from dataclasses import dataclass

import numpy as np

from prebuy.demand import scenarios
from prebuy.optimizer import cvar, optimize, profits
from prebuy.sim import DEMAND_CV, WORST_SHARE, World, hidden_demand_mean

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


@dataclass(frozen=True)
class PlanResult:
    lines: tuple[PlanLine, ...]
    spend: float
    expected_profit: float
    worst_case_profit: float


def build_plan(world: World, budget: float, risk_aversion: float,
               cities: list[str] | None = None) -> PlanResult:
    """Best buy plan within budget, best lines first."""
    idx = _select(world, cities)
    mean = hidden_demand_mean(world)[idx]
    demand = scenarios(mean, DEMAND_CV, N_SCENARIOS, np.random.default_rng(PLAN_SEED))
    cost, price, cap = world.cost[idx], world.price[idx], world.cap[idx]
    buy = optimize(cost, price, cap, demand, budget, risk_aversion, WORST_SHARE)

    per_scenario = profits(buy, cost, price, demand)
    sold = np.minimum(buy, demand).mean(axis=0)
    line_profit = price * sold - cost * buy
    lines = [
        PlanLine(world.city[i], world.week[i], world.hotel[i], int(b), float(world.cost[i]),
                 float(world.price[i]), float(s), float(p), _reason(world, i, m))
        for i, b, s, p, m in zip(idx, buy, sold, line_profit, mean) if b > 0
    ]
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


def _reason(world: World, i: int, expected_demand: float) -> str:
    parts = [f"expected demand {expected_demand:.0f} room-nights vs "
             f"{world.bookings_hist[-1, i]:.0f} booked last December"]
    searches = world.soldout_searches_hist[:, i].sum()
    if searches > 0:
        parts.append(f"{searches:,.0f} sold-out searches in past Decembers")
    if world.event_lift_now[i] > 1:
        parts.append("event week this year")
    parts.append(f"{(world.price[i] - world.cost[i]) / world.price[i]:.0%} margin")
    return "; ".join(parts)
