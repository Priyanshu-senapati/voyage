"""Turn the optimizer's buy quantities into plan lines a buyer can read and approve."""

from dataclasses import dataclass

import numpy as np

from voyance.demand import scenarios
from voyance.optimizer import cvar, optimize, profits
from voyance.sim import DEMAND_CV, WORST_SHARE, World, hidden_demand_mean

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
    whys = [_why(world, i, m) for i, m in zip(idx, mean)]
    lines = [
        PlanLine(world.city[i], world.week[i], world.hotel[i], int(b), float(world.cost[i]),
                 float(world.price[i]), float(s), float(p), _reason(why), why)
        for i, b, s, p, why in zip(idx, buy, sold, line_profit, whys) if b > 0
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


def _why(world: World, i: int, expected_demand: float) -> dict:
    return {
        "expected_demand": float(expected_demand),
        "booked_last_december": float(world.bookings_hist[-1, i]),
        "bookings_past_decembers": world.bookings_hist[:, i].tolist(),  # oldest first
        "soldout_searches_past": world.soldout_searches_hist[:, i].tolist(),
        "event_week": bool(world.event_lift_now[i] > 1),
        "margin": float((world.price[i] - world.cost[i]) / world.price[i]),
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
