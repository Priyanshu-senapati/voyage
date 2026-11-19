"""Position Monitor: once a plan is bought, read each line's bookings so far against the forecast.

Pace = what is on the books against what the forecast expected by now (the real December booking curve, see
voyance.sim.BOOKED_SHARE). The projection trusts bookings in proportion to how much of the week is booked:
projected = booked so far + the forecast's share still to come. The monitor flags lines running short or over
and says by how many rooms; it does not tell the buyer to buy or release. Tested on real 2017 bookings, acting on
pace automatically (topping up and releasing) lost 4-8% of profit: early pace is too noisy to trade on, so the
decision stays with the buyer.
"""

from dataclasses import dataclass
from datetime import date

from voyance.sim import World, booked_share, on_books

PACE_BAND = 0.15          # within 15% of the expected pace counts as on pace
MIN_STILL_TO_COME = 0.05  # never assume a week is fully booked before it starts


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
    gap: float               # projected demand - rooms: > 0 short of rooms, < 0 more rooms than demand
    status: str              # short / on_pace / over / started
    note: str


@dataclass(frozen=True)
class Position:
    as_of: date
    lines: list[PositionLine]
    summary: dict[str, int]


def position(world: World, lines, as_of: date) -> Position:
    """The monitor's reading of each line that isn't rejected, on `as_of`."""
    booked = on_books(world, as_of)
    out = [_read(line, float(booked[world.labels.index(f"{line.city} {line.week} {line.hotel}")]), as_of)
           for line in lines if getattr(line, "decision", "pending") != "rejected"]
    summary = {status: sum(item.status == status for item in out) for status in ("short", "on_pace", "over", "started")}
    return Position(as_of, out, summary)


def _read(line, booked: float, as_of: date) -> PositionLine:
    forecast, rooms = float(line.why["expected_demand"]), int(line.rooms)
    days = (line.first_night - as_of).days
    base = {"city": line.city, "week": line.week, "hotel": line.hotel, "line_id": getattr(line, "id", None),
            "rooms": rooms, "forecast": forecast, "on_books": booked}
    if days <= 0:
        return PositionLine(**base, expected_by_now=forecast, pace=booked / forecast if forecast else 1.0,
                            projected_demand=booked, gap=booked - rooms, status="started",
                            note=f"the week began on {line.first_night:%d %b %Y}")
    share = float(booked_share(days))
    expected = forecast * share
    pace = booked / expected if expected > 0 else 1.0
    # a typical curve can pass 100% (bookings that later cancel are on the books), so keep a little room left
    projected = booked + forecast * max(1.0 - share, MIN_STILL_TO_COME)
    status = "short" if pace > 1 + PACE_BAND else "over" if pace < 1 - PACE_BAND else "on_pace"
    reading = f"{booked:.0f} booked against {expected:.0f} expected by now; projected {projected:.0f} room-nights"
    if status == "on_pace":
        note = f"on pace: {reading} for {rooms} rooms"
    else:
        note = (f"running {abs(pace - 1):.0%} {'ahead of' if pace > 1 else 'behind'} the forecast: {reading}, "
                f"{abs(projected - rooms):.0f} {'more than' if projected > rooms else 'fewer than'} the {rooms} rooms "
                "bought")
    return PositionLine(**base, expected_by_now=expected, pace=pace, projected_demand=projected,
                        gap=projected - rooms, status=status, note=note)
