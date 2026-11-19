from dataclasses import asdict, replace
from datetime import timedelta
from types import SimpleNamespace

import numpy as np
import pytest

from voyance.api.planner import build_plan
from voyance.api.position import position
from voyance.sim import booked_share, make_world

WORLD = make_world(seed=7)
PLAN = build_plan(WORLD, budget=2e7, risk_aversion=0.3)
LINE = next(line for line in PLAN.lines if line.week == "1-7 Dec")
ITEM = WORLD.labels.index(f"{LINE.city} {LINE.week} {LINE.hotel}")


def world_where(season_demand, pace=1.0):
    demand, paces = WORLD.season_demand.copy(), WORLD.pace.copy()
    demand[ITEM], paces[ITEM] = season_demand, pace
    return replace(WORLD, season_demand=demand, pace=paces)


def read(world, days_before, line=LINE):
    report = position(world, [line], LINE.first_night - timedelta(days=days_before))
    (item,) = report.lines
    return report, item


def test_a_week_booking_well_ahead_is_flagged_short_with_its_gap():
    report, item = read(world_where(LINE.why["expected_demand"] * 1.8), days_before=60)
    assert item.status == "short" and item.pace > 1.3 and item.gap > 0
    assert "ahead of" in item.note and f"{item.gap:.0f} more than" in item.note
    assert report.summary["short"] == 1


def test_a_week_booking_well_behind_is_flagged_over():
    _, item = read(world_where(LINE.why["expected_demand"] * 0.3), days_before=50)
    assert item.status == "over" and item.pace < 0.85 and "behind" in item.note


def test_a_week_on_forecast_pace_reads_on_pace():
    _, item = read(world_where(LINE.why["expected_demand"]), days_before=60)
    assert item.status == "on_pace" and 0.85 < item.pace < 1.15


def test_the_reading_is_bookings_against_the_typical_pace():
    _, item = read(world_where(LINE.why["expected_demand"]), days_before=60)
    assert item.expected_by_now == pytest.approx(LINE.why["expected_demand"] * booked_share(60))
    assert item.on_books == np.floor(LINE.why["expected_demand"] * booked_share(60))
    assert item.on_books <= item.projected_demand and item.gap == pytest.approx(item.projected_demand - LINE.rooms)


def test_a_week_that_has_started_is_marked_started():
    _, item = read(world_where(LINE.why["expected_demand"]), days_before=-2)
    assert item.status == "started"


def test_rejected_lines_are_left_out():
    rejected = SimpleNamespace(**asdict(LINE), decision="rejected")
    assert position(WORLD, [rejected], LINE.first_night).lines == []
