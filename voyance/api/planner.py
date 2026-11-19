"""Turn the optimizer's buy quantities into plan lines a buyer can read and approve."""

from dataclasses import dataclass
from datetime import date

import numpy as np

from voyance.demand import scenarios
from voyance.optimizer import cvar, profits, solve_relaxed, whole_rooms
from voyance.sim import ASSUMED_EVENT_LIFT, DEMAND_CV, WORST_SHARE, World, hidden_demand_mean

N_SCENARIOS = 200
PLAN_SEED = 0  # fixed, so the same request always gives the same plan (auditable)
HURDLE_EPS = 1e-9  # a budget worth less than this per rupee isn't what limits the plan


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
    first_night: date
    limited_by: str  # what stopped it buying more: "hotel" (allotment), "cap" (city/hotel cap), "budget", "demand"
    extra_room_value: float  # risk-adjusted rupees one more room of allotment would add (hotel-limited lines)


@dataclass(frozen=True)
class Passed:
    """A hotel-week the plan buys none of, and what forcing one room in would cost."""

    city: str
    week: str
    hotel: str
    unit_cost: float
    unit_price: float
    expected_demand: float
    earns_here: float        # what one whole room here makes: price x expected sales of it - cost
    earns_elsewhere: float   # what the same money makes in the rest of the plan: hurdle rate x cost
    forced_room_cost: float  # about what the plan would lose with one whole room forced in (risk-adjusted)
    reason: str


@dataclass(frozen=True)
class Exposure:
    """How much of the budget one city or hotel takes, against its cap."""

    kind: str  # "city" or "hotel"
    name: str
    spend: float
    share_of_budget: float
    cap: float | None
    at_cap: bool


@dataclass(frozen=True)
class PlanResult:
    lines: tuple[PlanLine, ...]
    spend: float
    expected_profit: float
    worst_case_profit: float
    hurdle_rate: float  # risk-adjusted rupees one more rupee of budget would earn: what every purchase must beat
    passed: tuple[Passed, ...]  # closest calls first
    exposure: tuple[Exposure, ...]  # every city, then every hotel
    caps_cost: float  # risk-adjusted profit the city / hotel caps give up (0 without caps)


def build_plan(world: World, budget: float, risk_aversion: float, cities: list[str] | None = None,
               demand_change: float = 0.0, cost_change: float = 0.0, event_lift: float | None = None,
               max_city_share: float | None = None, max_hotel_share: float | None = None,
               price_caps: bool = True) -> PlanResult:
    """Best buy plan within budget, best lines first.

    What-ifs re-plan in a different world: demand `demand_change` above the forecast (0.2 = +20%), supplier
    rates `cost_change` dearer, and this season's event weeks lifted `event_lift` times instead of the
    planner's own guess. Caps keep any one city (or hotel) to at most that share of the whole budget, also
    when `cities` narrows the plan; `price_caps=False` skips working out what they cost (one more solve).
    """
    idx = _select(world, cities)
    lift = ASSUMED_EVENT_LIFT if event_lift is None else event_lift
    mean = hidden_demand_mean(world, lift)[idx] * (1 + demand_change)
    demand = scenarios(mean, DEMAND_CV, N_SCENARIOS, np.random.default_rng(PLAN_SEED))
    cost, price, cap = world.cost[idx] * (1 + cost_change), world.price[idx], world.cap[idx]
    city_of = [world.city[i] for i in idx]
    hotel_of = [f"{world.city[i]} · {world.hotel[i]}" for i in idx]  # "Hotel A" is a different hotel per city
    groups, shares = [], []
    for names, share in ((city_of, max_city_share), (hotel_of, max_hotel_share)):
        if share is not None and share < 1:  # a cap of the whole budget can never bind
            for name in dict.fromkeys(names):
                groups.append(np.array([j for j, n in enumerate(names) if n == name]))
                shares.append(share)
    solution = solve_relaxed(cost, price, cap, demand, budget, risk_aversion, WORST_SHARE, groups=groups,
                             group_share=shares)
    buy = whole_rooms(solution.buy, cost, cap, budget)
    # priced on the whole-room plans a buyer sees, by solving once without the caps: per-cap shadow prices
    # split arbitrarily when caps add up to the budget, and miss a cap below one room's cost
    caps_cost = 0.0
    if groups and price_caps:
        free = whole_rooms(solve_relaxed(cost, price, cap, demand, budget, risk_aversion, WORST_SHARE).buy,
                           cost, cap, budget)
        caps_cost = max(0.0, _risk_adjusted(free, cost, price, demand, risk_aversion)
                        - _risk_adjusted(buy, cost, price, demand, risk_aversion))
    exposure = (*_exposure("city", city_of, cost * buy, cost * solution.buy, budget, max_city_share),
                *_exposure("hotel", hotel_of, cost * buy, cost * solution.buy, budget, max_hotel_share))
    capped = {e.name: f"its {e.kind} is at the cap of {e.cap:.0%} of the budget" for e in exposure if e.at_cap}

    per_scenario = profits(buy, cost, price, demand)
    sold = np.minimum(buy, demand).mean(axis=0)
    line_profit = price * sold - cost * buy
    line_scenarios = price * np.minimum(buy, demand) - cost * buy  # scenarios x lines
    buy_by = world.first_night[idx] - world.buy_ahead_days[idx]
    hurdle = solution.budget_value
    lines, passed = [], []
    for j, i in enumerate(idx):
        cap_reason = capped.get(city_of[j]) or capped.get(hotel_of[j])
        if buy[j] == 0:
            passed.append(_passed(world, i, cost[j], price[j], mean[j], demand[:, j], solution.buy[j],
                                  solution.forced_room_cost[j], hurdle, cap_reason))
            continue
        why = _why(world, i, mean[j], cost[j], price[j])
        at_cap = buy[j] >= np.floor(cap[j])  # whole rooms bought, after rounding and the budget trim
        limited_by = ("hotel" if at_cap else "cap" if cap_reason else
                      "budget" if hurdle > HURDLE_EPS else "demand")
        lines.append(PlanLine(world.city[i], world.week[i], world.hotel[i], int(buy[j]), float(cost[j]),
                              float(price[j]), float(sold[j]), float(line_profit[j]), _reason(why), why,
                              cvar(line_scenarios[:, j], WORST_SHARE), buy_by[j].item(),
                              world.first_night[i].item(), limited_by,
                              float(solution.extra_room_value[j]) if at_cap else 0.0))
    return PlanResult(
        lines=tuple(sorted(lines, key=lambda line: -line.expected_profit)),
        spend=float(cost @ buy),
        expected_profit=float(per_scenario.mean()),
        worst_case_profit=cvar(per_scenario, WORST_SHARE),
        hurdle_rate=hurdle,
        passed=tuple(sorted(passed, key=lambda p: p.forced_room_cost)),
        exposure=exposure,
        caps_cost=caps_cost,
    )


def _risk_adjusted(buy: np.ndarray, cost: np.ndarray, price: np.ndarray, demand: np.ndarray,
                   risk_aversion: float) -> float:
    """The optimizer's objective for a whole-room plan: (1 - r) x expected profit + r x worst-share CVaR."""
    per_scenario = profits(buy, cost, price, demand)
    return float((1 - risk_aversion) * per_scenario.mean() + risk_aversion * cvar(per_scenario, WORST_SHARE))


def _exposure(kind: str, names: list[str], spend: np.ndarray, relaxed_spend: np.ndarray, budget: float,
              cap: float | None) -> list[Exposure]:
    out = []
    for name in dict.fromkeys(names):
        at = np.array([n == name for n in names])
        # at the cap in the optimizer's own (fractional) plan; whole rooms then round a little below it
        at_cap = cap is not None and relaxed_spend[at].sum() >= cap * budget * (1 - 1e-6)
        out.append(Exposure(kind, name, float(spend[at].sum()), float(spend[at].sum() / budget), cap, bool(at_cap)))
    return out


def _passed(world: World, i: int, cost: float, price: float, mean: float, demand: np.ndarray,
            fractional_buy: float, shadow_cost: float, hurdle: float, cap_reason: str | None) -> Passed:
    earns_here = float(price * np.minimum(demand, 1).mean() - cost)
    earns_elsewhere = float(hurdle * cost)
    # The LP's shadow price is the rate for a first sliver of a room and can be a degenerate 0. The money
    # comparison approximates one whole room: what it makes vs what its cost makes in the rest of the plan
    # (tests: within 5% of re-solving with the room forced in). Report the larger.
    forced = max(float(shadow_cost), earns_elsewhere - earns_here)
    if earns_here <= 0:
        reason = f"a room here would lose about ₹{-earns_here:,.0f}: demand is too thin for its price"
    elif cap_reason:
        reason = cap_reason
    elif fractional_buy > 1e-6:
        reason = "worth less than one whole room"
    elif hurdle > HURDLE_EPS:
        reason = (f"the money earns more elsewhere: a room here makes about ₹{earns_here:,.0f}; "
                  f"the same ₹{cost:,.0f} makes ₹{earns_elsewhere:,.0f} in the rest of the plan")
    else:
        reason = f"too risky: one room here would lower risk-adjusted profit by about ₹{forced:,.0f}"
    return Passed(world.city[i], world.week[i], world.hotel[i], float(cost), float(price), float(mean),
                  earns_here, earns_elsewhere, forced, reason)


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
