from dataclasses import replace

import numpy as np
import pytest
from scipy.optimize import linprog

from voyance import optimizer
from voyance.api import planner
from voyance.api.planner import N_SCENARIOS, PLAN_SEED, RATE_ELASTICITY, build_plan, selling_price
from voyance.demand import scenarios
from voyance.sim import DEMAND_CV, WORST_SHARE, hidden_demand_mean, make_world

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


def test_each_line_has_its_own_worst_case_and_a_buy_by_date():
    plan = build_plan(WORLD, budget=5_000_000, risk_aversion=0.3)
    for line in plan.lines:
        # a line that sells out in every scenario has worst == expected, up to rounding
        assert -line.rooms * line.unit_cost <= line.worst_case_profit <= line.expected_profit + 1e-6
        i = WORLD.labels.index(f"{line.city} {line.week} {line.hotel}")
        assert line.buy_by == (WORLD.first_night[i] - WORLD.buy_ahead_days[i]).item()


def _demand(plan):
    return {(line.city, line.week, line.hotel): line.why["expected_demand"] for line in plan.lines}


def test_what_if_demand_shock_scales_every_lines_expected_demand():
    base, shocked = build_plan(WORLD, 2e7, 0.3), build_plan(WORLD, 2e7, 0.3, demand_change=0.25)
    both = _demand(base).keys() & _demand(shocked).keys()
    assert both and all(_demand(shocked)[k] == pytest.approx(1.25 * _demand(base)[k]) for k in both)
    assert sum(line.rooms for line in shocked.lines) > sum(line.rooms for line in base.lines)


def test_what_if_dearer_supplier_rates_buy_less_and_cost_more_per_room():
    base, dearer = build_plan(WORLD, 2e7, 0.3), build_plan(WORLD, 2e7, 0.3, cost_change=0.10)
    assert sum(line.rooms for line in dearer.lines) < sum(line.rooms for line in base.lines)
    line = dearer.lines[0]
    i = WORLD.labels.index(f"{line.city} {line.week} {line.hotel}")
    assert line.unit_cost == pytest.approx(1.10 * WORLD.cost[i])


def test_what_if_event_strength_changes_only_this_seasons_event_weeks():
    weak, strong = build_plan(WORLD, 2e7, 0.0, event_lift=1.0), build_plan(WORLD, 2e7, 0.0, event_lift=2.5)
    for key in _demand(weak).keys() & _demand(strong).keys():
        line = next(line for line in strong.lines if (line.city, line.week, line.hotel) == key)
        ratio = _demand(strong)[key] / _demand(weak)[key]
        assert ratio == pytest.approx(2.5 if line.why["event_week"] else 1.0)


def test_the_round_1_deck_sample_plan_is_unchanged():
    # the deck shows this plan as real API output: Rs 1.22 cr spend, Rs 24.74L expected, Rs 20.04L worst 5%
    plan = build_plan(WORLD, budget=2e7, risk_aversion=0.3)
    assert (round(plan.spend), round(plan.expected_profit), round(plan.worst_case_profit)) == pytest.approx(
        (12_160_458, 2_473_960, 2_003_528), abs=1)


def test_hurdle_rate_is_what_a_rupee_earns_at_the_margin_when_money_runs_out():
    tight, roomy = build_plan(WORLD, 3e6, 0.3), build_plan(WORLD, 1e10, 0.3)
    assert tight.hurdle_rate > 0 and roomy.hurdle_rate == pytest.approx(0, abs=1e-9)
    assert {line.limited_by for line in tight.lines} <= {"hotel", "budget", "demand"}
    assert "budget" in {line.limited_by for line in tight.lines}
    assert "budget" not in {line.limited_by for line in roomy.lines}


def test_only_hotel_limited_lines_carry_an_extra_room_value():
    scarce = replace(WORLD, cap=np.minimum(WORLD.cap, 5.0))  # hotels that sell us only 5 rooms a week
    plan = build_plan(scarce, 1e10, 0.0)
    limited = [line for line in plan.lines if line.limited_by == "hotel"]
    assert limited and all(line.rooms == 5 and line.extra_room_value > 0 for line in limited)
    assert all(line.extra_room_value == 0 for line in plan.lines if line.limited_by != "hotel")


def test_the_cost_of_a_skipped_hotel_week_matches_forcing_one_room_in():
    # brute force: re-solve with one room forced in; the reported cost must match, even where the LP's own
    # shadow price is degenerate (zero)
    budget, risk = 4e6, 0.3
    plan = build_plan(WORLD, budget, risk)
    demand = scenarios(hidden_demand_mean(WORLD), DEMAND_CV, N_SCENARIOS, np.random.default_rng(PLAN_SEED))
    c, a_ub, b_ub, lower, upper = optimizer._model(WORLD.cost, WORLD.price, WORLD.cap, demand, np.zeros(40),
                                                   budget, risk, WORST_SHARE)
    base = -linprog(c, A_ub=a_ub, b_ub=b_ub, bounds=np.column_stack([lower, upper]), method="highs").fun
    for skipped in plan.passed[:6]:
        i = WORLD.labels.index(f"{skipped.city} {skipped.week} {skipped.hotel}")
        forced = lower.copy()
        forced[i] = 1
        loss = base + linprog(c, A_ub=a_ub, b_ub=b_ub, bounds=np.column_stack([forced, upper]), method="highs").fun
        # the reported cost is the rate at the margin; a whole forced room moves ~₹4-8k and costs a bit more
        assert skipped.forced_room_cost == pytest.approx(loss, rel=0.05, abs=5.0)
        assert skipped.earns_elsewhere == pytest.approx(plan.hurdle_rate * skipped.unit_cost)


def test_every_hotel_week_not_bought_is_passed_with_its_cost_and_a_reason():
    plan = build_plan(WORLD, 3e6, 0.3)
    bought = {(line.city, line.week, line.hotel) for line in plan.lines}
    passed = {(p.city, p.week, p.hotel) for p in plan.passed}
    assert bought.isdisjoint(passed) and len(bought | passed) == len(WORLD.labels)
    costs = [p.forced_room_cost for p in plan.passed]
    assert costs == sorted(costs) and all(c >= 0 for c in costs)  # closest calls first
    assert all(p.reason for p in plan.passed)


def test_a_hotel_week_that_loses_money_on_its_own_says_so():
    plan = build_plan(WORLD, 4e6, 0.3, demand_change=-0.5, cost_change=0.3)  # thin demand, dear rooms
    losers = [p for p in plan.passed if p.earns_here <= 0]
    assert losers
    for p in losers:
        assert p.reason.startswith("a room here would lose about ₹") and "₹-" not in p.reason


def test_lines_know_the_first_night_of_their_week():
    line = build_plan(WORLD, 4e6, 0.3).lines[0]
    i = WORLD.labels.index(f"{line.city} {line.week} {line.hotel}")
    assert line.first_night == WORLD.first_night[i].item() and line.buy_by < line.first_night


def _spend_by(plan, key):
    spend = {}
    for line in plan.lines:
        spend[key(line)] = spend.get(key(line), 0.0) + line.rooms * line.unit_cost
    return spend


def test_without_caps_the_plan_shows_its_exposure_and_costs_nothing():
    plan = build_plan(WORLD, 4e6, 0.3)
    assert plan.caps_cost == 0
    cities = {e.name: e for e in plan.exposure if e.kind == "city"}
    assert set(cities) == set(WORLD.city) and all(e.cap is None and not e.at_cap for e in cities.values())
    for city, spend in _spend_by(plan, lambda line: line.city).items():
        assert cities[city].spend == pytest.approx(spend) and cities[city].share_of_budget == pytest.approx(spend / 4e6)


def test_a_city_cap_holds_its_spend_and_says_what_it_costs():
    free = build_plan(WORLD, 4e6, 0.3)
    biggest = max(_spend_by(free, lambda line: line.city).values()) / 4e6
    capped = build_plan(WORLD, 4e6, 0.3, max_city_share=biggest * 0.7)
    assert max(_spend_by(capped, lambda line: line.city).values()) <= biggest * 0.7 * 4e6 + 1
    assert capped.caps_cost > 0 and capped.expected_profit < free.expected_profit
    at_cap = {e.name for e in capped.exposure if e.kind == "city" and e.at_cap}
    assert at_cap and all(line.limited_by == "cap" for line in capped.lines if line.city in at_cap)


def test_a_cap_below_one_rooms_cost_empties_the_plan_and_costs_what_it_forgoes():
    free = build_plan(WORLD, 4e6, 0.3)
    starved = build_plan(WORLD, 4e6, 0.3, max_hotel_share=0.0005)  # Rs 2,000 a hotel; rooms cost 3,500+
    assert not starved.lines and starved.caps_cost > 0.5 * free.expected_profit
    assert all(p.reason.startswith("its hotel is at the cap") or p.earns_here <= 0 for p in starved.passed)


def test_caps_cost_an_extra_solve_only_when_they_can_bind_and_are_priced(monkeypatch):
    calls = []
    real = planner.solve_relaxed
    monkeypatch.setattr(planner, "solve_relaxed", lambda *a, **k: calls.append(1) or real(*a, **k))
    build_plan(WORLD, 4e6, 0.3, max_city_share=1.0)
    build_plan(WORLD, 4e6, 0.3, max_city_share=0.25, price_caps=False)
    assert len(calls) == 2
    build_plan(WORLD, 4e6, 0.3, max_city_share=0.25)
    assert len(calls) == 4


def test_a_hotel_cap_holds_each_hotels_spend():
    capped = build_plan(WORLD, 4e6, 0.3, max_hotel_share=0.08)
    assert max(_spend_by(capped, lambda line: (line.city, line.hotel)).values()) <= 0.08 * 4e6 + 1
    hotels = [e for e in capped.exposure if e.kind == "hotel"]
    assert len(hotels) == 10 and all(e.cap == 0.08 for e in hotels) and any(e.at_cap for e in hotels)


def test_a_cap_that_does_not_bind_changes_nothing():
    assert build_plan(WORLD, 4e6, 0.3, max_city_share=1.0).lines == build_plan(WORLD, 4e6, 0.3).lines


def test_every_line_says_why_not_more_and_how_likely_all_its_rooms_sell():
    tight = build_plan(WORLD, 3e6, 0.3)
    for line in tight.lines:
        assert 0 <= line.why["sell_out_chance"] <= 1 and line.why["why_not_more"]
    budget_bound = [line for line in tight.lines if line.limited_by == "budget"]
    assert budget_bound and all("rest of the plan" in line.why["why_not_more"] for line in budget_bound)
    roomy = build_plan(WORLD, 1e10, 0.3)
    assert all("would sell" in line.why["why_not_more"] for line in roomy.lines if line.limited_by == "demand")


def test_selling_price_follows_demand_the_way_real_agent_rates_do():
    assert selling_price(8000, 1.0) == 8000
    prices = [selling_price(8000, r) for r in (0.3, 0.6, 0.9, 1.0, 1.2, 1.4, 3.0)]
    assert prices == sorted(prices)  # more demand than usual never lowers the price
    assert prices[0] == prices[1] and prices[-2] == prices[-1]  # no guessing beyond the measured range
    assert selling_price(8000, 1.1) == pytest.approx(8000 * 1.1 ** RATE_ELASTICITY)


def test_every_line_recommends_a_selling_price_and_says_why():
    plan = build_plan(WORLD, 2e7, 0.3)
    for line in plan.lines:
        assert line.why["selling_price"] == pytest.approx(selling_price(line.unit_price, line.why["demand_vs_usual"]))
        assert f"sell at ₹{line.why['selling_price']:,.0f}" in line.reason
    markup = {flag: np.mean([line.why["selling_price"] / line.unit_price for line in plan.lines
                             if line.why["event_week"] == flag]) for flag in (True, False)}
    assert markup[True] > 1 > markup[False] * 0.999  # event weeks price up; others at or below the usual rate


def test_reasons_mention_sold_out_searches_and_event_weeks():
    reasons = " ".join(line.reason for line in build_plan(WORLD, budget=2e7, risk_aversion=0.0).lines)
    assert "sold-out searches" in reasons
    assert "event week" in reasons
