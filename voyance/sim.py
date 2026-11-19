"""Synthetic December season for the Round 1 proof chart.

Simulated: 5 cities x 4 weeks x 2 hotels with made-up prices and 3 past seasons of
history. It shows the mechanism (sold-out dates hide demand, new events shift it),
not TBO's real numbers.

Fairness rules for the planner: it never sees this season's true demand, it knows which
weeks have events but not how big they are, and the real search-to-booking rate varies
by hotel around the single rate the planner assumes.
"""

from dataclasses import dataclass, replace
from datetime import date
from itertools import product

import numpy as np

from voyance.demand import scenarios, unconstrain
from voyance.optimizer import cvar, optimize, profits

CITIES = ("Goa", "Jaipur", "Udaipur", "Manali", "Kochi")
WEEKS = ("1-7 Dec", "8-14 Dec", "15-21 Dec", "22-28 Dec")
WEEK_FACTOR = np.array([0.8, 1.0, 1.3, 1.8])  # demand ramps up toward Christmas
HOTELS = ("Hotel A", "Hotel B")
N_CITY_WEEKS = len(CITIES) * len(WEEKS)
N_HISTORY = 3               # past December seasons TBO has data for
LOOK_TO_BOOK = 25.0         # searches per booking the planner assumes
# measured on real agent bookings (out/calibration.json): the share that cancel, and of those the share made
# within 7 days of arrival, too late to sell the room again
AGENT_CANCEL_RATE = 0.41
LATE_CANCEL_SHARE = 0.115
LOOK_TO_BOOK_RANGE = (15.0, 35.0)  # what it really is, per hotel
DEMAND_CV = 0.35            # season-to-season demand noise
EVENTS_PER_SEASON = 3       # city-weeks with a festival, match or concert
EVENT_LIFT_RANGE = (1.5, 2.2)
ASSUMED_EVENT_LIFT = 1.5    # planner's guess for any event week (low end, not tuned)
WORST_SHARE = 0.05          # "worst case" = average of the worst 5% of seasons
# shortcut: a fixed season, so buy-by dates pass after mid-2027; take dates from the data source with TBO data.
SEASON_YEAR = 2027          # the December being planned, so every buy-by date is still ahead
# buy this many days before each week starts: about 90% of its agent bookings come later
# (real bookings, `python scripts/calibrate.py` -> december_buy_ahead_days); Christmas is booked earliest
BUY_AHEAD_DAYS = np.array([93, 110, 111, 139])
BUY_AHEAD_DAYS.flags.writeable = False
# share of a December week's agent bookings already made this many days before it starts: December books late
# (real bookings, `python scripts/calibrate.py` -> december_booked_share)
BOOKED_SHARE = {150: 0.22, 120: 0.33, 90: 0.45, 60: 0.58, 45: 0.65, 30: 0.79, 21: 0.83, 14: 0.86, 7: 0.89, 0: 0.95}
NO_BOOKINGS_DAYS = 365
# shortcut: one "earliness" per hotel-week; 0.5 gives a log-share spread of about 0.67 / 0.33 / 0.14 at 120 /
# 60 / 30 days against 0.81 / 0.36 / 0.20 in real hotel-weeks, so early pace is a little less noisy than real.
PACE_SPREAD = 0.5


@dataclass(frozen=True)
class World:
    labels: tuple[str, ...]
    city: tuple[str, ...]
    week: tuple[str, ...]
    hotel: tuple[str, ...]
    first_night: np.ndarray            # date each hotel-week starts (datetime64[D])
    buy_ahead_days: np.ndarray         # commit to buying at least this many days before first_night
    cost: np.ndarray                   # INR per room-night TBO pays
    price: np.ndarray                  # INR per room-night TBO sells at
    cap: np.ndarray                    # most room-nights the hotel will sell TBO
    true_mean: np.ndarray              # this season's mean demand (hidden from strategies)
    event_lift_now: np.ndarray         # true event effect this season (planner sees only > 1)
    # past seasons, oldest first (one row per season):
    event_lift_hist: np.ndarray
    alloc_hist: np.ndarray             # room-nights TBO held
    bookings_hist: np.ndarray          # capped by alloc_hist: sold-out dates hide demand
    soldout_searches_hist: np.ndarray  # searches that found nothing left
    # this season as it unfolds (hidden from the planner; Autopilot sees only what is on the books so far):
    season_demand: np.ndarray          # room-nights this season's bookings will come to
    pace: np.ndarray                   # how early each hotel-week books: > 1 earlier than the typical December


def make_world(seed: int) -> World:
    rng = np.random.default_rng(seed)
    items = list(product(CITIES, range(len(WEEKS)), HOTELS))
    n = len(items)
    week = np.array([w for _, w, _ in items])
    city_week = np.array([CITIES.index(c) * len(WEEKS) + w for c, w, _ in items])

    base = rng.uniform(30, 90, n) * WEEK_FACTOR[week]
    cost = rng.uniform(3_500, 9_000, n)
    price = cost * rng.uniform(1.12, 1.35, n)
    look_to_book = rng.uniform(*LOOK_TO_BOOK_RANGE, n)
    past = [_past_season(rng, base, city_week, look_to_book) for _ in range(N_HISTORY)]
    lift_hist, alloc_hist, bookings_hist, soldout_hist = (np.array(rows) for rows in zip(*past))
    lift_now = _event_lift(rng, city_week)
    season_rng = np.random.default_rng([seed, 1])  # its own stream: everything drawn above stays the same
    shape = 1.0 / DEMAND_CV**2
    season_demand = season_rng.gamma(shape, base * lift_now / shape)
    pace = np.exp(PACE_SPREAD * season_rng.normal(0.0, 1.0, n))

    return World(
        labels=tuple(f"{c} {WEEKS[w]} {h}" for c, w, h in items),
        city=tuple(c for c, _, _ in items),
        week=tuple(WEEKS[w] for _, w, _ in items),
        hotel=tuple(h for _, _, h in items),
        first_night=np.datetime64(f"{SEASON_YEAR}-12-01") + 7 * week,
        buy_ahead_days=BUY_AHEAD_DAYS[week],
        cost=cost, price=price, cap=np.ceil(base * 3),
        true_mean=base * lift_now, event_lift_now=lift_now,
        event_lift_hist=lift_hist, alloc_hist=alloc_hist,
        bookings_hist=bookings_hist, soldout_searches_hist=soldout_hist,
        season_demand=season_demand, pace=pace,
    )


def booked_share(lead_days: np.ndarray | float) -> np.ndarray | float:
    """Typical share of a December week's bookings made by `lead_days` before it starts (straight lines between
    the measured leads; none made a year or more ahead)."""
    leads = sorted(BOOKED_SHARE)
    return np.interp(lead_days, [*leads, NO_BOOKINGS_DAYS], [*(BOOKED_SHARE[lead] for lead in leads), 0.0])


def on_books(world: World, as_of: date) -> np.ndarray:
    """Room-nights already booked on `as_of` for each hotel-week of this season."""
    lead_days = (world.first_night - np.datetime64(as_of, "D")).astype(int)
    # an early-booking hotel-week (pace > 1) is further along the same curve; shares stay below 1
    return np.floor(world.season_demand * booked_share(lead_days) ** (1.0 / world.pace))


def _past_season(rng: np.random.Generator, base: np.ndarray, city_week: np.ndarray,
                 look_to_book: np.ndarray):
    lift = _event_lift(rng, city_week)
    alloc = np.floor(base * rng.uniform(0.7, 1.1, base.size))  # past buys ignored events
    demand = scenarios(base * lift, DEMAND_CV, 1, rng)[0]
    bookings = np.minimum(np.floor(demand), alloc)
    soldout = rng.poisson((demand - bookings) * look_to_book) * (bookings >= alloc)
    return lift, alloc, bookings, soldout.astype(float)


def _event_lift(rng: np.random.Generator, city_week: np.ndarray) -> np.ndarray:
    event_weeks = rng.choice(N_CITY_WEEKS, size=EVENTS_PER_SEASON, replace=False)
    lifts = dict(zip(event_weeks.tolist(), rng.uniform(*EVENT_LIFT_RANGE, EVENTS_PER_SEASON)))
    return np.array([lifts.get(cw, 1.0) for cw in city_week.tolist()])


def even_split(world: World, budget: float) -> np.ndarray:
    """Same rupees on every hotel-week."""
    return np.minimum(np.floor(budget / world.cost.size / world.cost), world.cap).astype(int)


def stay_factors(cancel_rate: float, late_share: float = LATE_CANCEL_SHARE) -> tuple[float, float]:
    """(keep, paid) for bookings of which `cancel_rate` cancel. Early cancellations hand the room back in time to
    sell it again, so they act like demand that never came: `keep` is the share of demand left. Late ones leave a
    booked room empty: `paid` is the share of booked rooms stayed in and paid for. keep x paid = 1 - cancel_rate."""
    if not (0 <= cancel_rate < 1 and 0 <= late_share <= 1):
        raise ValueError("cancel_rate must be in [0, 1) and late_share in [0, 1]")
    keep = 1 - cancel_rate * (1 - late_share)
    # shortcut: a late cancellation pays nothing (no cancellation fees); add fees if TBO's contracts have them
    return keep, 1 - cancel_rate * late_share / keep


def repeat_past_bookings(world: World, budget: float, stay_share: float = 1.0) -> np.ndarray:
    """Re-buy the average of past seasons' bookings (times `stay_share`, the share that stayed), scaled down only
    if over budget."""
    target = np.floor(world.bookings_hist.mean(axis=0) * stay_share)
    spend = world.cost @ target
    scale = min(1.0, budget / spend) if spend > 0 else 0.0
    return np.minimum(np.floor(target * scale), world.cap).astype(int)


def bookings_mean(world: World) -> np.ndarray:
    """Average past bookings, taken at face value."""
    return world.bookings_hist.mean(axis=0)


def unconstrained_mean(world: World) -> np.ndarray:
    """Average past demand with sold-out searches counted back in, no event adjustment."""
    return unconstrain(world.bookings_hist, world.soldout_searches_hist, LOOK_TO_BOOK).mean(axis=0)


def hidden_demand_mean(world: World, event_lift: float = ASSUMED_EVENT_LIFT) -> np.ndarray:
    """Sold-outs counted back in, past event weeks scaled down and this season's event weeks
    scaled up by `event_lift`. The planner knows which weeks have events, not how big they are."""
    past = unconstrain(world.bookings_hist, world.soldout_searches_hist, LOOK_TO_BOOK)
    return (past / _assumed_lift(world.event_lift_hist)).mean(axis=0) * _assumed_lift(world.event_lift_now, event_lift)


def _assumed_lift(true_lift: np.ndarray, lift: float = ASSUMED_EVENT_LIFT) -> np.ndarray:
    return np.where(true_lift > 1, lift, 1.0)


def evaluate(world: World, buy: np.ndarray, test_demand: np.ndarray) -> dict[str, float]:
    """Score a plan on unseen seasons: spend, mean and worst-5% profit, rooms unsold and missed."""
    p = profits(buy, world.cost, world.price, test_demand)
    return {
        "spend": float(world.cost @ buy),
        "mean_profit": float(p.mean()),
        "worst_5pct_profit": cvar(p, WORST_SHARE),
        "unsold_rooms": float(np.maximum(buy - test_demand, 0).sum(axis=1).mean()),
        "missed_rooms": float(np.maximum(test_demand - buy, 0).sum(axis=1).mean()),
    }


def run(seed: int = 7, budget: float = 12_000_000.0, risk_aversion: float = 0.3,
        n_scenarios: int = 200, n_test_seasons: int = 500,
        cancel_rate: float = 0.0) -> dict[str, dict[str, float]]:
    """Plan with each strategy, then score every plan on the same unseen seasons. With `cancel_rate`, that share
    of bookings cancel (see stay_factors) and every strategy knows it."""
    keep, paid = stay_factors(cancel_rate)
    world = make_world(seed)
    world = replace(world, price=world.price * paid)  # what a booked room earns: late cancellations leave it empty
    plan_rng, test_rng = (np.random.default_rng(s) for s in np.random.SeedSequence(seed).spawn(2))
    test_demand = scenarios(world.true_mean, DEMAND_CV, n_test_seasons, test_rng) * keep
    # same random multipliers for every optimizer variant, so they differ only in their estimate
    noise = scenarios(np.ones(world.cost.size), DEMAND_CV, n_scenarios, plan_rng)

    def optimized(mean: np.ndarray) -> np.ndarray:
        return optimize(world.cost, world.price, world.cap, mean * keep * noise, budget, risk_aversion, WORST_SHARE)

    plans = {
        "Even split": even_split(world, budget),
        "Repeat past bookings": repeat_past_bookings(world, budget, stay_share=1 - cancel_rate),
        "Optimizer, bookings only": optimized(bookings_mean(world)),
        "Optimizer + hidden demand": optimized(unconstrained_mean(world)),
        "Optimizer + hidden demand + events": optimized(hidden_demand_mean(world)),
    }
    return {name: evaluate(world, buy, test_demand) for name, buy in plans.items()}
