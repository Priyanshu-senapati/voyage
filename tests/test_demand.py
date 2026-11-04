import numpy as np
import pytest

from prebuy.demand import scenarios, unconstrain


def test_unconstrain_returns_bookings_when_nothing_sold_out():
    assert unconstrain([10, 4], [0, 0], look_to_book=25).tolist() == [10, 4]


def test_unconstrain_adds_demand_lost_to_sold_out_searches():
    # 50 sold-out searches at 25 searches per booking = 2 lost bookings
    assert unconstrain([10], [50], look_to_book=25).tolist() == [12]


@pytest.mark.parametrize("look_to_book", [0, -5])
def test_unconstrain_rejects_non_positive_look_to_book(look_to_book):
    with pytest.raises(ValueError):
        unconstrain([1], [1], look_to_book=look_to_book)


def test_unconstrain_rejects_negative_counts():
    with pytest.raises(ValueError):
        unconstrain([-1], [0], look_to_book=10)


def test_unconstrain_rejects_mismatched_lengths():
    with pytest.raises(ValueError):
        unconstrain([1, 2], [0], look_to_book=10)


def test_scenarios_have_requested_shape_and_mean():
    draws = scenarios(np.array([50.0, 10.0]), cv=0.3, n=20_000, rng=np.random.default_rng(0))
    assert draws.shape == (20_000, 2)
    assert draws.mean(axis=0) == pytest.approx([50, 10], rel=0.02)
    assert (draws >= 0).all()


def test_scenarios_with_zero_mean_give_zero_demand():
    draws = scenarios(np.array([0.0]), cv=0.3, n=100, rng=np.random.default_rng(0))
    assert (draws == 0).all()


@pytest.mark.parametrize("cv", [0.0, -0.2, float("nan")])
def test_scenarios_reject_non_positive_cv(cv):
    with pytest.raises(ValueError):
        scenarios(np.array([5.0]), cv=cv, n=10, rng=np.random.default_rng(0))
