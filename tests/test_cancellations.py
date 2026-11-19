import re
from types import SimpleNamespace

import numpy as np
import pytest

from voyance import cancellations
from voyance.api import planner
from voyance.api.datasource import DemoDataSource
from voyance.api.planner import N_SCENARIOS, PLAN_SEED, build_plan
from voyance.cancellations import defaults, effective, kept_rooms, kept_share
from voyance.demand import scenarios
from voyance.optimizer import profits
from voyance.sim import DEMAND_CV, evaluate, hidden_demand_mean, make_world

DEMO = DemoDataSource().load()
REAL = (0.41, 0.115)
# the plan's own demand scenarios (gross bookings), as build_plan draws them for all cities and no what-ifs
DEMO_DEMAND = scenarios(hidden_demand_mean(DEMO), DEMAND_CV, N_SCENARIOS, np.random.default_rng(PLAN_SEED))


def test_effective_price_and_demand_on_hand_worked_numbers():
    # c = 0.5, L = 0.5: k = 0.5 / (1 - 0.25) = 2/3 of a sold-out room's price earns; demand_eff = 0.75 d
    price_eff, demand_eff = effective([90.0, 300.0], [[40.0, 8.0], [12.0, 0.0]], 0.5, 0.5)
    assert price_eff == pytest.approx([60.0, 200.0])
    assert demand_eff == pytest.approx(np.array([[30.0, 6.0], [9.0, 0.0]]))
    assert kept_share(0.41, 0.115) == pytest.approx(0.926, abs=5e-4)


def test_kept_rooms_resells_early_cancellations_when_sold_out_and_loses_all_of_them_otherwise():
    # 12 rooms, c = 0.5, L = 0.5. Sold out (40 booked): early cancellations are resold, so 12 x 2/3 = 8 are kept.
    # Spare stock (12 booked): half cancel, 6 are kept.
    assert kept_rooms(12, [[40.0, 12.0]], 0.5, 0.5) == pytest.approx(np.array([[8.0, 6.0]]))
    assert kept_rooms([12, 3], 20.0, 0.5, 0.5) == pytest.approx([8.0, 2.0])  # broadcasts like numpy


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


def test_kept_rooms_equals_the_effective_form():
    buy, demand = np.array([5.0, 12.0, 40.0]), np.array([[3.0, 30.0, 41.0], [9.0, 2.0, 80.0]])
    price_eff, demand_eff = effective(np.ones(3), demand, *REAL)
    assert kept_rooms(buy, demand, *REAL) == pytest.approx(price_eff * np.minimum(buy, demand_eff))


def test_no_cancellations_changes_nothing_exactly():
    price, demand = np.array([100.0, 7.3]), np.array([[3.3, 1.7]])
    price_eff, demand_eff = effective(price, demand, 0.0, 0.7)
    assert (price_eff == price).all() and (demand_eff == demand).all()
    assert (kept_rooms([2, 2], demand, 0.0, 1.0) == np.minimum([2, 2], demand)).all()


@pytest.mark.parametrize("cancel_rate, late_share", [(-0.1, 0.1), (1.0, 0.1), (1.5, 0.0), (0.4, -0.01),
                                                     (0.4, 1.01), (float("nan"), 0.1), (0.4, float("nan")),
                                                     ([0.2, 1.0], 0.1)])
def test_rates_out_of_range_are_refused(cancel_rate, late_share):
    with pytest.raises(ValueError):
        effective(1.0, 1.0, cancel_rate, late_share)
    with pytest.raises(ValueError):
        kept_rooms(1.0, 1.0, cancel_rate, late_share)


def test_defaults_come_from_the_real_bookings_calibration(tmp_path, monkeypatch):
    cancel_rate, late_share = defaults()
    assert cancel_rate == pytest.approx(0.41, abs=0.005) and late_share == pytest.approx(0.115, abs=0.005)
    monkeypatch.setattr(cancellations, "CALIBRATION", tmp_path / "missing.json")
    assert defaults() == (0.41, 0.115)
    (tmp_path / "other.json").write_text('{"real_agent_bookings": {}}', encoding="utf-8")
    monkeypatch.setattr(cancellations, "CALIBRATION", tmp_path / "other.json")
    assert defaults() == (0.41, 0.115)


def test_plan_without_cancellations_is_the_plan_from_before_cancellations():
    # golden values from origin/main (22b6fdd), before cancellations existed: demo world, ₹2 cr, risk 0.3
    plan = build_plan(DEMO, 2e7, 0.3)
    assert sum(line.rooms for line in plan.lines) == 1948
    assert plan.expected_profit == pytest.approx(2473960.3172111264, rel=1e-9)
    assert plan.worst_case_profit == pytest.approx(2003528.211621695, rel=1e-9)
    assert plan.hurdle_rate == 0.0
    assert all("cancel" not in line.reason for line in plan.lines)


def test_more_cancellations_never_buy_more_rooms():
    totals = [sum(line.rooms for line in build_plan(DEMO, 2e7, 0.3, cancel_rate=c, late_cancel_share=0.115).lines)
              for c in (0.0, 0.2, 0.41, 0.6)]
    assert totals == sorted(totals, reverse=True) and totals[-1] < totals[0]


def _item(world, place) -> int:
    return next(i for i in range(len(world.city)) if (world.city[i], world.week[i], world.hotel[i]) == place)


def test_plan_reports_rooms_kept_at_real_prices_and_its_totals_add_up():
    base = build_plan(DEMO, 2e7, 0.3)
    plan = build_plan(DEMO, 2e7, 0.3, cancel_rate=REAL[0], late_cancel_share=REAL[1])
    for line in plan.lines:
        i = _item(DEMO, (line.city, line.week, line.hotel))
        assert line.unit_price == DEMO.price[i]
        assert line.expected_sold == pytest.approx(kept_rooms(line.rooms, DEMO_DEMAND[:, i], *REAL).mean())
        assert line.expected_sold <= line.rooms * kept_share(*REAL) + 1e-9  # late cancellations always lost
        assert line.expected_profit == pytest.approx(line.unit_price * line.expected_sold
                                                     - line.unit_cost * line.rooms)
        assert "41% of bookings expected to cancel" in line.reason
    assert plan.expected_profit == pytest.approx(sum(line.expected_profit for line in plan.lines))
    assert plan.expected_profit < base.expected_profit


@pytest.mark.parametrize("budget", [3e6, 2e7])  # the money is the limit / demand is
def test_each_derived_field_follows_the_rooms_kept(budget):
    plan = build_plan(DEMO, budget, 0.3, cancel_rate=REAL[0], late_cancel_share=REAL[1])
    assert plan.passed or budget > 1e7
    for passed in plan.passed:  # one whole room: price x its expected rooms kept - cost
        i = _item(DEMO, (passed.city, passed.week, passed.hotel))
        kept = kept_rooms(1, DEMO_DEMAND[:, i], *REAL).mean()
        assert passed.earns_here == pytest.approx(DEMO.price[i] * kept - DEMO.cost[i])
    checked = 0
    for line in plan.lines:
        i = _item(DEMO, (line.city, line.week, line.hotel))
        demand_eff = effective(1.0, DEMO_DEMAND[:, i], *REAL)[1]
        assert line.why["sell_out_chance"] == pytest.approx((demand_eff >= line.rooms).mean())
        money = re.search(r"(making|make|lose) about ₹(-?[\d,]+)", line.why["why_not_more"])
        if line.limited_by in ("budget", "demand"):
            one_more = (kept_rooms(line.rooms + 1, DEMO_DEMAND[:, i], *REAL)
                        - kept_rooms(line.rooms, DEMO_DEMAND[:, i], *REAL)).mean()
            expected = DEMO.price[i] * one_more - DEMO.cost[i]
            shown = int(money[2].replace(",", "")) * (-1 if money[1] == "lose" else 1)
            assert shown == pytest.approx(expected, abs=0.51)
            checked += 1
    assert checked


def test_a_room_that_cancellations_make_lose_money_says_so():
    world = make_world(seed=7)
    lost = planner._passed(world, 0, cost=100.0, price=105.0, price_eff=97.0, mean=50.0,
                           demand_eff=np.full(10, 50.0), fractional_buy=0.0, shadow_cost=0.0, hurdle=0.0,
                           cap_reason=None)
    assert lost.earns_here == pytest.approx(-3.0) and "cancellations" in lost.reason
    thin = planner._passed(world, 0, cost=100.0, price=105.0, price_eff=105.0, mean=0.5,
                           demand_eff=np.full(10, 0.5), fractional_buy=0.0, shadow_cost=0.0, hurdle=0.0,
                           cap_reason=None)
    assert "demand is too thin" in thin.reason


def test_evaluate_counts_only_rooms_kept_on_a_tiny_world():
    world = SimpleNamespace(cost=np.array([50.0, 50.0]), price=np.array([90.0, 90.0]))
    buy, demand = np.array([12, 12]), np.array([[40.0, 12.0], [12.0, 12.0]])
    # c = 0.5, L = 0.5. Season 1 keeps 8 + 6 (profit 60, unsold 4 + 6, missed 20 - 8 = 12);
    # season 2 keeps 6 + 6 (profit -120, unsold 12, missed 0)
    result = evaluate(world, buy, demand, cancel_rate=0.5, late_cancel_share=0.5)
    assert result == pytest.approx({"spend": 1200.0, "mean_profit": -30.0, "worst_5pct_profit": -120.0,
                                    "unsold_rooms": 11.0, "missed_rooms": 6.0})
    # one rate per season: season 2 now has no cancellations (keeps 24, profit 960)
    by_season = evaluate(world, buy, demand, cancel_rate=np.array([0.5, 0.0]), late_cancel_share=np.array([0.5, 0.0]))
    assert by_season == pytest.approx({"spend": 1200.0, "mean_profit": 510.0, "worst_5pct_profit": 60.0,
                                       "unsold_rooms": 5.0, "missed_rooms": 6.0})


def test_evaluate_without_cancellations_is_unchanged():
    world = make_world(3)
    demand = scenarios(world.true_mean, DEMAND_CV, 50, np.random.default_rng(1))
    buy = np.floor(world.true_mean).astype(int)
    result = evaluate(world, buy, demand)
    assert result == evaluate(world, buy, demand, cancel_rate=0.0, late_cancel_share=0.0)
    p = profits(buy, world.cost, world.price, demand)
    assert result["mean_profit"] == float(p.mean())
    assert result["unsold_rooms"] == float(np.maximum(buy - demand, 0).sum(axis=1).mean())
    assert result["missed_rooms"] == float(np.maximum(demand - buy, 0).sum(axis=1).mean())
