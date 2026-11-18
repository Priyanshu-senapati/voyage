import threading

import numpy as np
import pytest

from voyance import optimizer
from voyance.optimizer import cvar, optimize, plan_relaxed, profits, solve_relaxed


def small_instance(seed=0, n_items=4, n_scenarios=40):
    rng = np.random.default_rng(seed)
    cost = rng.uniform(40, 80, n_items)
    price = cost * rng.uniform(1.1, 1.6, n_items)
    cap = np.full(n_items, 60)
    demand = rng.gamma(4.0, 8.0, size=(n_scenarios, n_items))
    return cost, price, cap, demand


def _objective(cost, price, cap, demand, budget, risk, alpha=0.1, lower=None):
    """Risk-adjusted profit of the best fractional plan, optionally forcing a minimum buy (brute-force check)."""
    from scipy.optimize import linprog

    c, a_ub, b_ub, low, up = optimizer._model(cost, price, cap, demand, np.zeros(cost.size), budget, risk, alpha)
    if lower is not None:
        low[: cost.size] = lower
    return -linprog(c, A_ub=a_ub, b_ub=b_ub, bounds=np.column_stack([low, up]), method="highs").fun


def test_solution_reports_its_own_risk_adjusted_profit():
    cost, price, cap, demand = small_instance()
    sol = solve_relaxed(cost, price, cap, demand, budget=2_000.0, risk_aversion=0.5, alpha=0.1)
    assert sol.objective == pytest.approx(_objective(cost, price, cap, demand, 2_000.0, 0.5))
    assert sol.buy == pytest.approx(plan_relaxed(cost, price, cap, demand, budget=2_000.0, risk_aversion=0.5,
                                                 alpha=0.1))


def test_budget_value_is_what_one_more_rupee_would_earn():
    cost, price, cap, demand = small_instance()
    sol = solve_relaxed(cost, price, cap, demand, budget=2_000.0, risk_aversion=0.3, alpha=0.1)
    gain = _objective(cost, price, cap, demand, 2_010.0, 0.3) - sol.objective
    assert sol.budget_value > 0 and gain == pytest.approx(10 * sol.budget_value, rel=1e-3)
    roomy = solve_relaxed(cost, price, cap, demand, budget=1e9, risk_aversion=0.3, alpha=0.1)
    assert roomy.budget_value == pytest.approx(0, abs=1e-9)  # money is not what holds the plan back


def test_forced_room_cost_is_what_buying_one_skipped_room_would_lose():
    cost, price, cap, demand = small_instance()
    price[2] = cost[2] * 1.01  # barely any margin: the optimizer skips it
    sol = solve_relaxed(cost, price, cap, demand, budget=2_000.0, risk_aversion=0.3, alpha=0.1)
    assert sol.buy[2] == pytest.approx(0, abs=1e-9) and sol.forced_room_cost[2] > 0
    forced = np.zeros(cost.size)
    forced[2] = 1
    loss = sol.objective - _objective(cost, price, cap, demand, 2_000.0, 0.3, lower=forced)
    assert loss == pytest.approx(sol.forced_room_cost[2], rel=1e-3)


def test_extra_room_value_is_what_one_more_room_of_allotment_would_earn():
    cost, price, cap, demand = small_instance()
    cap = np.array([5.0, 60, 60, 60])  # a scarce, profitable hotel
    sol = solve_relaxed(cost, price, cap, demand, budget=1e9, risk_aversion=0.0, alpha=0.1)
    assert sol.buy[0] == pytest.approx(5) and sol.extra_room_value[0] > 0
    # a shadow price is exact at the margin; over a whole room it can bend where a scenario's demand ends
    tenth = _objective(cost, price, cap + np.array([0.1, 0, 0, 0]), demand, 1e9, 0.0) - sol.objective
    whole = _objective(cost, price, cap + np.array([1, 0, 0, 0]), demand, 1e9, 0.0) - sol.objective
    assert tenth / 0.1 == pytest.approx(sol.extra_room_value[0], rel=1e-3)
    assert whole == pytest.approx(sol.extra_room_value[0], rel=1e-2)


def test_every_solve_runs_on_the_one_long_lived_solver_thread(monkeypatch):
    # HiGHS through scipy crashes the process when a thread that ran a solve exits (seen on Windows), so
    # solves never run on the caller's thread, which may be a short-lived worker
    ran_on = []
    real = optimizer.linprog

    def watched(*args, **kwargs):
        ran_on.append(threading.current_thread())
        return real(*args, **kwargs)

    monkeypatch.setattr(optimizer, "linprog", watched)
    cost, price, cap, demand = small_instance()
    callers = [threading.Thread(target=optimize, args=(cost, price, cap, demand, 2_000.0)) for _ in range(3)]
    for t in callers:
        t.start()
    for t in callers:
        t.join()
    optimize(cost, price, cap, demand, budget=2_000.0)
    assert len(ran_on) == 4 and len(set(ran_on)) == 1
    assert ran_on[0].daemon and ran_on[0] is not threading.main_thread() and ran_on[0] not in callers


def test_a_failing_solve_raises_in_the_caller():
    cost, price, cap, demand = small_instance()
    with pytest.raises(ValueError):
        optimize(cost, price, cap, demand, budget=-1.0)


GROUPS = (np.array([0, 1]), np.array([2, 3]))  # e.g. two cities of two hotel-weeks each


def test_group_caps_keep_each_groups_spend_within_its_share_of_the_budget():
    cost, price, cap, demand = small_instance()
    price[:2] = cost[:2] * 1.8  # the first group is far more profitable, so the plan wants to pile into it
    free = solve_relaxed(cost, price, cap, demand, budget=2_000.0, risk_aversion=0.3, alpha=0.1)
    assert cost[:2] @ free.buy[:2] > 0.5 * 2_000
    capped = solve_relaxed(cost, price, cap, demand, budget=2_000.0, risk_aversion=0.3, alpha=0.1,
                           groups=GROUPS, group_share=0.5)
    assert cost[:2] @ capped.buy[:2] <= 0.5 * 2_000 + 1e-6 and capped.objective < free.objective
    whole = optimize(cost, price, cap, demand, budget=2_000.0, risk_aversion=0.3, alpha=0.1, groups=GROUPS,
                     group_share=0.5)
    assert cost[:2] @ whole[:2] <= 0.5 * 2_000  # rounding down never breaks a cap


def test_each_group_can_have_its_own_share():
    cost, price, cap, demand = small_instance()
    price[:2] = cost[:2] * 1.8
    sol = solve_relaxed(cost, price, cap, demand, budget=2_000.0, risk_aversion=0.3, alpha=0.1,
                        groups=GROUPS, group_share=[0.3, 1.0])
    assert cost[:2] @ sol.buy[:2] <= 0.3 * 2_000 + 1e-6


def test_group_caps_need_a_share_between_zero_and_one():
    cost, price, cap, demand = small_instance()
    with pytest.raises(ValueError, match="share"):
        solve_relaxed(cost, price, cap, demand, budget=2_000.0, groups=GROUPS, group_share=0.0)


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
