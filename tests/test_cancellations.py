from types import SimpleNamespace

import numpy as np
import pytest

from voyance.demand import scenarios
from voyance.optimizer import cvar, profits
from voyance.sim import AGENT_CANCEL_RATE, DEMAND_CV, LATE_CANCEL_SHARE, WORST_SHARE, evaluate, kept_rooms, make_world

REAL = (AGENT_CANCEL_RATE, LATE_CANCEL_SHARE)


def test_kept_rooms_resells_early_cancellations_when_sold_out_and_loses_all_of_them_otherwise():
    # 12 rooms, c = 0.5, L = 0.5: keep = 0.75, paid = 2/3. Sold out (40 booked): early cancellations are resold,
    # so 12 x 2/3 = 8 are kept. Spare stock (12 booked): half cancel, 6 are kept.
    assert kept_rooms(12, [[40.0, 12.0]], 0.5, 0.5) == pytest.approx(np.array([[8.0, 6.0]]))
    assert kept_rooms([12, 3], 20.0, 0.5, 0.5) == pytest.approx([8.0, 2.0])  # broadcasts like numpy
    # one rate per season (rows): the second season has no cancellations
    per_season = kept_rooms(12, [[40.0, 12.0], [40.0, 12.0]], np.array([[0.5], [0.0]]), np.array([[0.5], [0.0]]))
    assert per_season == pytest.approx(np.array([[8.0, 6.0], [12.0, 12.0]]))


def _season(rooms: int, requests: int, cancel_rate: float, late_share: float, rng: np.random.Generator) -> int:
    """One season: booking requests arrive while a room is free. Each booking stays, cancels late (the room is
    lost) or cancels early (the room goes back on sale to the next request, whose booking can cancel too)."""
    free, kept = rooms, 0
    for _ in range(requests):
        if free == 0:
            break
        u = rng.random()
        if u < 1 - cancel_rate:
            kept, free = kept + 1, free - 1
        elif u < 1 - cancel_rate * (1 - late_share):
            free -= 1
    return kept


@pytest.mark.parametrize("rooms, requests", [(100, 2000), (100, 50)])  # sold out, spare stock
def test_kept_rooms_matches_a_booking_process_with_resales(rooms, requests):
    rng = np.random.default_rng(5)
    simulated = np.mean([_season(rooms, requests, *REAL, rng) for _ in range(400)])
    assert simulated == pytest.approx(kept_rooms(rooms, requests, *REAL), abs=0.6)


def test_no_cancellations_changes_nothing_exactly():
    demand = np.array([[3.3, 1.7]])
    assert (kept_rooms([2, 2], demand, 0.0, 1.0) == np.minimum([2, 2], demand)).all()


@pytest.mark.parametrize("cancel_rate, late_share", [(-0.1, 0.1), (1.0, 0.1), (1.5, 0.0), (0.4, -0.01),
                                                     (0.4, 1.01), (float("nan"), 0.1), (0.4, float("nan")),
                                                     ([0.2, 1.0], 0.1)])
def test_rates_out_of_range_are_refused(cancel_rate, late_share):
    with pytest.raises(ValueError):
        kept_rooms(1.0, 1.0, cancel_rate, late_share)


def test_evaluate_counts_only_rooms_kept_on_a_tiny_world():
    world = SimpleNamespace(cost=np.array([50.0, 50.0]), price=np.array([90.0, 90.0]))
    buy, demand = np.array([12, 12]), np.array([[40.0, 12.0], [12.0, 12.0]])
    # c = 0.5, L = 0.5. Season 1 keeps 8 + 6 (profit 60, unsold 4 + 6, missed 20 - 8 = 12);
    # season 2 keeps 6 + 6 (profit -120, unsold 12, missed 0)
    result = evaluate(world, buy, demand, cancel_rates=0.5, late_shares=0.5)
    assert result == pytest.approx({"spend": 1200.0, "mean_profit": -30.0, "worst_5pct_profit": -120.0,
                                    "unsold_rooms": 11.0, "missed_rooms": 6.0})
    # one rate per season: season 2 now has no cancellations (keeps 24, profit 960)
    by_season = evaluate(world, buy, demand, cancel_rates=np.array([0.5, 0.0]), late_shares=np.array([0.5, 0.0]))
    assert by_season == pytest.approx({"spend": 1200.0, "mean_profit": 510.0, "worst_5pct_profit": 60.0,
                                       "unsold_rooms": 5.0, "missed_rooms": 6.0})


def test_evaluate_without_rates_is_unchanged():
    world = make_world(3)
    demand = scenarios(world.true_mean, DEMAND_CV, 50, np.random.default_rng(1))
    buy = np.floor(world.true_mean).astype(int)
    p = profits(buy, world.cost, world.price, demand)
    assert evaluate(world, buy, demand) == {
        "spend": float(world.cost @ buy), "mean_profit": float(p.mean()), "worst_5pct_profit": cvar(p, WORST_SHARE),
        "unsold_rooms": float(np.maximum(buy - demand, 0).sum(axis=1).mean()),
        "missed_rooms": float(np.maximum(demand - buy, 0).sum(axis=1).mean())}
    assert evaluate(world, buy, demand, cancel_rates=0.0)["mean_profit"] == pytest.approx(float(p.mean()))
