import pytest

from voyance.api.planner import build_plan
from voyance.sim import make_world

WORLD = make_world(seed=7)


def test_plan_stays_within_budget_and_totals_add_up():
    plan = build_plan(WORLD, budget=5_000_000, risk_aversion=0.3)
    assert plan.spend <= 5_000_000
    assert plan.spend == pytest.approx(sum(line.rooms * line.unit_cost for line in plan.lines))
    assert plan.expected_profit == pytest.approx(sum(line.expected_profit for line in plan.lines))


def test_lines_are_buys_only_sorted_by_expected_profit():
    plan = build_plan(WORLD, budget=5_000_000, risk_aversion=0.3)
    assert plan.lines and all(line.rooms > 0 for line in plan.lines)
    profits = [line.expected_profit for line in plan.lines]
    assert profits == sorted(profits, reverse=True)


def test_city_filter_keeps_only_those_cities():
    plan = build_plan(WORLD, budget=5_000_000, risk_aversion=0.3, cities=["Goa", "Kochi"])
    assert plan.lines and {line.city for line in plan.lines} <= {"Goa", "Kochi"}


def test_unknown_city_is_rejected():
    with pytest.raises(ValueError, match="Atlantis"):
        build_plan(WORLD, budget=1e6, risk_aversion=0.3, cities=["Atlantis"])


def test_same_inputs_give_the_same_plan():
    assert build_plan(WORLD, 3e6, 0.3) == build_plan(WORLD, 3e6, 0.3)


def test_each_line_carries_the_numbers_behind_its_reason():
    line = build_plan(WORLD, budget=5_000_000, risk_aversion=0.3).lines[0]
    why = line.why
    assert why["booked_last_december"] == why["bookings_past_decembers"][-1]
    assert len(why["bookings_past_decembers"]) == len(why["soldout_searches_past"]) == 3
    assert why["margin"] == pytest.approx((line.unit_price - line.unit_cost) / line.unit_price)
    assert f"expected demand {why['expected_demand']:.0f} room-nights" in line.reason
    assert ("event week" in line.reason) == why["event_week"]


def test_reasons_mention_sold_out_searches_and_event_weeks():
    reasons = " ".join(line.reason for line in build_plan(WORLD, budget=2e7, risk_aversion=0.0).lines)
    assert "sold-out searches" in reasons
    assert "event week" in reasons
