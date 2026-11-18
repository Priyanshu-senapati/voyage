import json
from dataclasses import replace
from datetime import date
from pathlib import Path

import numpy as np

from voyance.sim import (BUY_AHEAD_DAYS, SEASON_YEAR, WEEKS, hidden_demand_mean, make_world, repeat_past_bookings,
                         run)

FAST = {"n_scenarios": 60, "n_test_seasons": 100}


def test_each_hotel_week_knows_its_first_night_and_how_far_ahead_to_buy():
    world = make_world(seed=3)
    for week, first, ahead in zip(world.week, world.first_night, world.buy_ahead_days):
        assert first.item() == date(SEASON_YEAR, 12, int(week.split("-")[0]))
        assert ahead == BUY_AHEAD_DAYS[WEEKS.index(week)]
    assert BUY_AHEAD_DAYS.argmax() == WEEKS.index("22-28 Dec")  # Christmas is booked earliest


def test_buy_ahead_days_match_the_real_booking_data():
    calibration = json.loads((Path(__file__).parent.parent / "out" / "calibration.json").read_text("utf-8"))
    assert BUY_AHEAD_DAYS.tolist() == calibration["real_agent_bookings"]["december_buy_ahead_days"]


def test_run_is_reproducible_with_same_seed():
    assert run(seed=3, **FAST) == run(seed=3, **FAST)


def test_every_strategy_stays_within_budget():
    budget = 5_000_000.0
    for result in run(seed=3, budget=budget, **FAST).values():
        assert result["spend"] <= budget


def test_past_bookings_never_exceed_what_tbo_held():
    world = make_world(seed=3)
    assert (world.bookings_hist <= world.alloc_hist).all()
    # sold-out searches only appear where demand ran past the allocation
    assert (world.soldout_searches_hist[world.bookings_hist < world.alloc_hist] == 0).all()


def test_world_has_events_this_season_that_were_not_there_last_season():
    world = make_world(seed=3)
    assert np.any((world.event_lift_now > 1) & (world.event_lift_hist[-1] == 1))


def test_planner_sees_which_weeks_have_events_not_how_big_they_are():
    world = make_world(seed=3)
    bigger = replace(
        world,
        event_lift_now=np.where(world.event_lift_now > 1, world.event_lift_now * 1.3, 1.0),
        event_lift_hist=np.where(world.event_lift_hist > 1, world.event_lift_hist * 1.3, 1.0),
    )
    assert np.allclose(hidden_demand_mean(world), hidden_demand_mean(bigger))


def test_repeat_past_bookings_never_buys_more_than_average_past_bookings():
    world = make_world(seed=3)
    assert (repeat_past_bookings(world, budget=1e12) <= world.bookings_hist.mean(axis=0)).all()
