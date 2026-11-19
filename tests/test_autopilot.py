from dataclasses import asdict, replace
from datetime import timedelta
from types import SimpleNamespace

import numpy as np
import pytest

from voyance.api.autopilot import RELEASE_DAYS, position
from voyance.api.planner import build_plan
from voyance.sim import booked_share, make_world

WORLD = make_world(seed=7)
PLAN = build_plan(WORLD, budget=2e7, risk_aversion=0.3)
LINE = next(line for line in PLAN.lines if line.week == "1-7 Dec")
I = WORLD.labels.index(f"{LINE.city} {LINE.week} {LINE.hotel}")


def world_where(season_demand, pace=1.0):
    demand, paces = WORLD.season_demand.copy(), WORLD.pace.copy()
    demand[I], paces[I] = season_demand, pace
    return replace(WORLD, season_demand=demand, pace=paces)


def check(world, days_before, line=LINE):
    report = position(world, [line], LINE.first_night - timedelta(days=days_before))
    (item,) = report.lines
    return report, item


def test_a_week_booking_well_ahead_of_forecast_is_topped_up():
    report, item = check(world_where(LINE.why["expected_demand"] * 1.8), days_before=60)
    assert item.pace > 1.3 and item.status == "short" and item.action == "top_up"
    assert item.rooms_change > 0 and item.expected_value > 0
    assert report.summary["top_up"] == 1 and report.expected_value == pytest.approx(item.expected_value)
    assert "ahead of" in item.reason


def test_an_overbought_week_booking_well_behind_is_released_before_the_deadline_and_held_after():
    overbought = SimpleNamespace(**{**asdict(LINE), "rooms": round(2 * LINE.why["expected_demand"])})
    cold = world_where(LINE.why["expected_demand"] * 0.3)
    _, early = check(cold, days_before=RELEASE_DAYS + 20, line=overbought)
    assert early.status == "over" and early.action == "release" and early.rooms_change < 0
    assert early.expected_value > 0
    _, late = check(cold, days_before=RELEASE_DAYS - 5, line=overbought)
    assert late.action == "hold" and "release deadline" in late.reason


def test_a_plan_that_already_matches_weak_demand_holds():
    # behind forecast, but the plan bought cautiously: releasing would give up rooms that will still sell
    _, item = check(world_where(LINE.why["expected_demand"] * 0.8), days_before=RELEASE_DAYS + 20)
    assert item.status == "over" and item.action == "hold"


def test_a_week_on_forecast_pace_is_held():
    _, item = check(world_where(LINE.why["expected_demand"]), days_before=60)
    assert item.action == "hold" and 0.85 < item.pace < 1.15


def test_the_position_reads_whats_on_the_books_against_the_typical_pace():
    _, item = check(world_where(LINE.why["expected_demand"]), days_before=60)
    assert item.expected_by_now == pytest.approx(LINE.why["expected_demand"] * booked_share(60))
    assert item.on_books == np.floor(LINE.why["expected_demand"] * booked_share(60))
    assert item.on_books <= item.projected_demand


def test_a_week_that_has_started_needs_nothing():
    _, item = check(world_where(LINE.why["expected_demand"]), days_before=-2)
    assert item.action == "none" and item.status == "started" and item.rooms_change == 0


def test_rejected_lines_are_left_out():
    rejected = SimpleNamespace(**asdict(LINE), decision="rejected")
    assert position(WORLD, [rejected], LINE.first_night).lines == []
