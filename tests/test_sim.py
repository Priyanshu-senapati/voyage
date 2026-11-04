from dataclasses import replace

import numpy as np

from prebuy.sim import hidden_demand_mean, make_world, repeat_past_bookings, run

FAST = {"n_scenarios": 60, "n_test_seasons": 100}


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
