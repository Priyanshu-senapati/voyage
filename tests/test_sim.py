import json
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path

import numpy as np

import pytest

from voyance.sim import (BOOKED_SHARE, BUY_AHEAD_DAYS, SEASON_YEAR, WEEKS, booked_share, hidden_demand_mean,
                         make_world, on_books, repeat_past_bookings, run)

FAST = {"n_scenarios": 60, "n_test_seasons": 100}


def test_each_hotel_week_knows_its_first_night_and_how_far_ahead_to_buy():
    world = make_world(seed=3)
    for week, first, ahead in zip(world.week, world.first_night, world.buy_ahead_days):
        assert first.item() == date(SEASON_YEAR, 12, int(week.split("-")[0]))
        assert ahead == BUY_AHEAD_DAYS[WEEKS.index(week)]
    assert BUY_AHEAD_DAYS.argmax() == WEEKS.index("22-28 Dec")  # Christmas is booked earliest


def test_booked_share_follows_the_real_december_pace():
    calibration = json.loads((Path(__file__).parent.parent / "out" / "calibration.json").read_text("utf-8"))
    real = {int(lead): share for lead, share in calibration["real_agent_bookings"]["december_booked_share"].items()}
    assert {lead: round(share, 2) for lead, share in BOOKED_SHARE.items()} == {k: round(v, 2) for k, v in real.items()}
    assert booked_share(60) == pytest.approx(BOOKED_SHARE[60]) and booked_share(400) == 0
    assert booked_share(75) == pytest.approx((BOOKED_SHARE[60] + BOOKED_SHARE[90]) / 2)


def test_on_the_books_grows_toward_this_seasons_demand_and_each_hotel_week_has_its_own_pace():
    world = make_world(seed=3)
    first = world.first_night.min().item()
    early, late = (on_books(world, first - timedelta(days=d)) for d in (120, 7))
    assert (early <= late).all() and (late <= world.season_demand).all()
    # the same typical share, but early and late bookers spread around it (as real hotel-weeks do)
    pace = early / (world.season_demand * booked_share(120))
    assert pace.std() > 0.2


def test_this_seasons_demand_draws_no_numbers_the_proof_uses():
    # season_demand comes from its own random stream: the simulated history and plans are unchanged
    world = make_world(seed=7)
    assert world.season_demand.shape == world.true_mean.shape and (world.season_demand >= 0).all()
    assert replace(world, season_demand=world.season_demand * 0).cost.tolist() == make_world(seed=7).cost.tolist()


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
