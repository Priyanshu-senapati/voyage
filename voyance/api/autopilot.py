"""Autopilot: once a plan is bought, read each line's bookings so far and say whether to top up, hold or release.

Pace = what is on the books against what the forecast expected by now (the real December booking curve, see
voyance.sim.BOOKED_SHARE). The projection trusts bookings in proportion to how much of the week is booked:
projected = booked so far + the forecast's share still to come. Autopilot keeps the plan's own stance: its target
is the plan's rooms scaled by projected demand / forecast, so a week on pace is held. It then moves toward the
target one room at a time, but only while each room pays: a top-up room must expect to sell for more than
today's late price, a released room must be worth less held than its refund.

On real 2017 bookings a rule like this kept profit level and turned away about a third fewer guests (see the
decision backtest): it guards service and risk, it is not a profit promise.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta

import numpy as np

from voyance.demand import scenarios
from voyance.sim import DEMAND_CV, World, booked_share, on_books

RELEASE_DAYS = 30        # assumed: rooms can be handed back up to 30 days before the week starts
REFUND_SHARE = 0.5       # assumed: half the contract cost comes back for a released room
FULL_MARGIN_DAYS = 120   # assumed: a room bought later earns its margin x days left / 120
PACE_BAND = 0.15         # within 15% of the expected pace counts as on pace
MIN_VALUE = 500.0        # a move worth less than this (Rs, expected) isn't worth a buyer's attention
MIN_STILL_TO_COME = 0.05  # never assume a week is fully booked before it starts
N_SCENARIOS = 400
SEED = 0                 # fixed, so the same position always gives the same advice
ASSUMPTIONS = {"release_days": RELEASE_DAYS, "refund_share": REFUND_SHARE, "full_margin_days": FULL_MARGIN_DAYS}


@dataclass(frozen=True)
class PositionLine:
    city: str
    week: str
    hotel: str
    line_id: int | None
    rooms: int
    forecast: float          # expected demand when the plan was made
    on_books: float
    expected_by_now: float   # forecast x the typical share booked by now
    pace: float              # on_books / expected_by_now
    projected_demand: float
    status: str              # short / healthy / over / started
    action: str              # top_up / hold / release / none
    rooms_change: int
    expected_value: float    # expected profit change from the action, Rs
    reason: str


@dataclass(frozen=True)
class Position:
    as_of: date
    lines: list[PositionLine]
    summary: dict[str, int]
    expected_value: float
    assumptions: dict = field(default_factory=lambda: dict(ASSUMPTIONS))


def position(world: World, lines, as_of: date) -> Position:
    """Autopilot's reading of each line that isn't rejected, on `as_of`."""
    booked = on_books(world, as_of)
    out = [_check(line, float(booked[world.labels.index(f"{line.city} {line.week} {line.hotel}")]), as_of)
           for line in lines if getattr(line, "decision", "pending") != "rejected"]
    summary = {action: sum(item.action == action for item in out) for action in ("top_up", "hold", "release", "none")}
    return Position(as_of, out, summary, float(sum(item.expected_value for item in out)))


def _check(line, booked: float, as_of: date) -> PositionLine:
    forecast, rooms = float(line.why["expected_demand"]), int(line.rooms)
    days = (line.first_night - as_of).days
    base = {"city": line.city, "week": line.week, "hotel": line.hotel, "line_id": getattr(line, "id", None),
            "rooms": rooms, "forecast": forecast, "on_books": booked}
    if days <= 0:
        return PositionLine(**base, expected_by_now=forecast, pace=booked / forecast if forecast else 1.0,
                            projected_demand=booked, status="started", action="none", rooms_change=0,
                            expected_value=0.0, reason=f"the week began on {line.first_night:%d %b %Y}")
    share = float(booked_share(days))
    expected = forecast * share
    pace = booked / expected if expected > 0 else 1.0
    # a typical curve can pass 100% (bookings that later cancel are on the books), so keep a little room left
    still_to_come = max(1.0 - share, MIN_STILL_TO_COME)
    projected = booked + forecast * still_to_come
    status = "short" if pace > 1 + PACE_BAND else "over" if pace < 1 - PACE_BAND else "healthy"
    # what the week may still come to: centred on the projection, less uncertain the more is booked
    demand = np.maximum(booked, scenarios(np.array([projected]), DEMAND_CV * still_to_come, N_SCENARIOS,
                                          np.random.default_rng(SEED))[:, 0])
    target = round(rooms * projected / forecast) if forecast > 0 else rooms
    price, cost = float(line.unit_price), float(line.unit_cost)
    reading = (f"{booked:.0f} booked against {expected:.0f} expected by now; projected {projected:.0f} room-nights "
               f"for {rooms} rooms")
    on_pace = f"on pace: {reading}"
    trend = f"bookings are running {abs(pace - 1):.0%} {'ahead of' if pace > 1 else 'behind'} the forecast: {reading}"
    if target > rooms:
        late_margin = (price - cost) / price * min(1.0, days / FULL_MARGIN_DAYS)
        gains = [price * (demand > rooms + k).mean() - price * (1 - late_margin) for k in range(target - rooms)]
        k, value = _while_positive(gains)
        if k and value >= MIN_VALUE:
            return PositionLine(**base, expected_by_now=expected, pace=pace, projected_demand=projected,
                                status=status, action="top_up", rooms_change=k, expected_value=value,
                                reason=f"{trend}. Buy {k} more while a late room still earns {late_margin:.0%}")
        return PositionLine(**base, expected_by_now=expected, pace=pace, projected_demand=projected, status=status,
                            action="hold", rooms_change=0, expected_value=0.0,
                            reason=(f"{trend}, but a top-up wouldn't pay at today's late rate" if status == "short"
                                    else on_pace))
    if target < rooms:
        deadline = line.first_night - timedelta(days=RELEASE_DAYS)
        if days < RELEASE_DAYS:
            return PositionLine(**base, expected_by_now=expected, pace=pace, projected_demand=projected,
                                status=status, action="hold", rooms_change=0, expected_value=0.0,
                                reason=f"{trend}, but the release deadline ({deadline:%d %b}) has passed: sell "
                                       "what you can")
        gains = [REFUND_SHARE * cost - price * (demand > rooms - 1 - k).mean() for k in range(rooms - target)]
        k, value = _while_positive(gains)
        if k and value >= MIN_VALUE:
            return PositionLine(**base, expected_by_now=expected, pace=pace, projected_demand=projected,
                                status=status, action="release", rooms_change=-k, expected_value=value,
                                reason=f"{trend}. Release {k} by the release deadline on {deadline:%d %b} "
                                       f"({REFUND_SHARE:.0%} of their cost back)")
        return PositionLine(**base, expected_by_now=expected, pace=pace, projected_demand=projected, status=status,
                            action="hold", rooms_change=0, expected_value=0.0,
                            reason=(f"{trend}, but the rooms bought would still sell: keep them" if status == "over"
                                    else on_pace))
    return PositionLine(**base, expected_by_now=expected, pace=pace, projected_demand=projected, status=status,
                        action="hold", rooms_change=0, expected_value=0.0, reason=on_pace)


def _while_positive(gains: list[float]) -> tuple[int, float]:
    """How many steps to take while each next step still gains, and the total gained."""
    taken, total = 0, 0.0
    for gain in gains:
        if gain <= 0:
            break
        taken, total = taken + 1, total + gain
    return taken, float(total)
