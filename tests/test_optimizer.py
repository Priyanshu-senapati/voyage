import numpy as np
import pytest

from prebuy.optimizer import cvar, optimize, plan_relaxed, profits


def small_instance(seed=0, n_items=4, n_scenarios=40):
    rng = np.random.default_rng(seed)
    cost = rng.uniform(40, 80, n_items)
    price = cost * rng.uniform(1.1, 1.6, n_items)
    cap = np.full(n_items, 60)
    demand = rng.gamma(4.0, 8.0, size=(n_scenarios, n_items))
    return cost, price, cap, demand


def test_profits_per_scenario():
    p = profits(np.array([10]), np.array([60.0]), np.array([100.0]), np.array([[5.0], [15.0]]))
    # sold 5: 500 - 600; sold 10: 1000 - 600
    assert p.tolist() == [-100.0, 400.0]


def test_profits_count_salvage_for_unsold_rooms():
    p = profits(np.array([10]), np.array([60.0]), np.array([100.0]), np.array([[5.0]]),
                salvage=np.array([20.0]))
    # 5 sold (500) + 5 released at 20 (100) - cost 600
    assert p.tolist() == [0.0]


def test_cvar_is_mean_of_worst_share():
    assert cvar(np.array([-100.0, 400.0, 300.0, 200.0]), alpha=0.5) == pytest.approx(50.0)


def test_cvar_weights_a_fractional_tail_like_the_optimizer():
    # worst 30% of 4 scenarios = 1.2 scenarios: all of the worst one, 0.2 of the next
    assert cvar(np.array([4.0, 1.0, 3.0, 2.0]), alpha=0.3) == pytest.approx((1 + 0.2 * 2) / 1.2)


@pytest.mark.parametrize("budget", [0.0, 500.0, 3_000.0, 1e9])
def test_never_exceeds_budget(budget):
    cost, price, cap, demand = small_instance()
    buy = optimize(cost, price, cap, demand, budget=budget, risk_aversion=0.3)
    assert float(cost @ buy) <= budget


def test_zero_budget_buys_nothing():
    cost, price, cap, demand = small_instance()
    assert optimize(cost, price, cap, demand, budget=0.0).sum() == 0


def test_skips_items_that_lose_money_and_buys_exact_known_demand():
    buy = optimize(np.array([100.0, 100.0]), np.array([90.0, 150.0]), np.array([50, 50]),
                   np.array([[20.0, 20.0]]), budget=1e6)
    assert buy.tolist() == [0, 20]


def test_respects_hotel_cap():
    buy = optimize(np.array([10.0]), np.array([20.0]), np.array([5]), np.array([[100.0]]), budget=1e6)
    assert buy.tolist() == [5]


def test_rounds_fractional_rooms_down_to_stay_in_budget():
    # budget 10 at cost 3 buys 3.33 rooms in the relaxed plan, 3 whole rooms in the real one
    assert plan_relaxed(np.array([3.0]), np.array([10.0]), np.array([100]), np.array([[50.0]]),
                        budget=10.0)[0] == pytest.approx(10 / 3)
    assert optimize(np.array([3.0]), np.array([10.0]), np.array([100]), np.array([[50.0]]),
                    budget=10.0).tolist() == [3]


def test_more_risk_aversion_trades_expected_profit_for_a_safer_worst_case():
    cost, price, cap, demand = small_instance(seed=1)
    means, worsts = [], []
    for risk_aversion in (0.0, 0.5, 1.0):
        # checked on the unrounded plan, where the trade-off is exact
        buy = plan_relaxed(cost, price, cap, demand, budget=3_000.0, risk_aversion=risk_aversion, alpha=0.1)
        p = profits(buy, cost, price, demand)
        means.append(p.mean())
        worsts.append(cvar(p, alpha=0.1))
    tol = 1e-4 * max(1.0, max(abs(m) for m in means))
    assert all(a >= b - tol for a, b in zip(means, means[1:]))
    assert all(a <= b + tol for a, b in zip(worsts, worsts[1:]))


@pytest.mark.parametrize("kwargs", [
    {"budget": -1.0},
    {"budget": 100.0, "risk_aversion": 1.5},
    {"budget": 100.0, "alpha": 0.0},
])
def test_rejects_invalid_settings(kwargs):
    cost, price, cap, demand = small_instance()
    with pytest.raises(ValueError):
        optimize(cost, price, cap, demand, **kwargs)


def test_rejects_non_finite_inputs():
    cost, price, cap, demand = small_instance()
    with pytest.raises(ValueError):
        optimize(cost, price, cap, demand, budget=float("nan"))
    bad_demand = demand.copy()
    bad_demand[0, 0] = np.nan
    with pytest.raises(ValueError):
        optimize(cost, price, cap, bad_demand, budget=100.0)


def test_rejects_empty_scenarios():
    cost, price, cap, demand = small_instance()
    with pytest.raises(ValueError):
        optimize(cost, price, cap, demand[:0], budget=100.0)


def test_rejects_demand_with_wrong_number_of_items():
    cost, price, cap, demand = small_instance()
    with pytest.raises(ValueError):
        optimize(cost, price, cap, demand[:, :2], budget=100.0)


def test_rejects_price_below_salvage():
    with pytest.raises(ValueError):
        optimize(np.array([10.0]), np.array([20.0]), np.array([5]), np.array([[3.0]]),
                 budget=100.0, salvage=np.array([30.0]))
