import numpy as np
import pandas as pd
import pytest

from voyance import backtest
from voyance.backtest import (_month_block_ci, _optimizer_buys, _planner_buys, decision_backtest, estimate_rho,
                              intraclass_correlation, outcome, pickup_buys, range_rescaling, rescaled_range,
                              strategy_names)
from voyance.forecast import correlated_scenarios, scenarios_from_range, with_history

WEEK = pd.Timestamp("2016-05-02")


def test_outcome_counts_profit_unsold_and_turned_away_rooms():
    out = outcome(buy=np.array([10, 4]), actual=np.array([6, 9]), price=np.array([100.0, 50.0]), margin=0.2)
    # rooms cost 80 and 40: 6*100 - 10*80 = -200, then 4*50 - 4*40 = 40; spend 10*80 + 4*40 = 960
    assert out == {"profit": pytest.approx(-160), "rooms_bought": 14, "unsold": 4, "turned_away": 5,
                   "spend": pytest.approx(960), "profit_per_spend": pytest.approx(-160 / 960)}
    assert outcome(np.zeros(2), np.array([6, 9]), np.array([100.0, 50.0]), margin=0.2)["profit_per_spend"] is None


def history(weeks=120, seed=1):
    """Two hotels where on-the-books predicts the final well and last year says nothing."""
    rng = np.random.default_rng(seed)
    rows = []
    for hotel in ("A", "B"):
        for w in range(weeks):
            final = rng.uniform(50, 150)
            for lead in (90, 120):
                rows.append({"hotel": hotel, "week": WEEK + pd.Timedelta(weeks=w), "lead": lead,
                             "on_books": final * 0.5 * rng.uniform(0.9, 1.1), "final": final, "rate": 100.0})
    return with_history(pd.DataFrame(rows))


def test_decision_backtest_scores_every_strategy_on_the_test_weeks_only():
    result = decision_backtest(history(), test_from=WEEK + pd.Timedelta(weeks=100), leads=(120,), margins=(0.2,))
    assert result["test_weeks"][0] >= (WEEK + pd.Timedelta(weeks=100)).date().isoformat()
    (row,) = result["results"]
    assert (row["lead"], row["margin"], row["hotel_weeks"]) == (120, 0.2, 40)
    assert tuple(row["strategies"]) == strategy_names() == (
        "rebuy_last_year", "pickup", "likely_forecast", "optimizer_risk_0", "optimizer_risk_0.3",
        "optimizer_plan_risk_0.3",
        "planner_risk_0", "planner_risk_0.3", "planner_risk_0.3_rho0", "planner_risk_0.3_rho1",
        "likely_rescaled", "planner_risk_0_rescaled", "planner_risk_0.3_rescaled")
    s = row["strategies"]
    assert s["likely_forecast"]["profit"] > s["rebuy_last_year"]["profit"]
    assert s["optimizer_risk_0"]["profit"] > s["rebuy_last_year"]["profit"]
    # at a 20% margin an unsold room costs four times what a missed sale earns: the optimizer buys fewer,
    # and more caution buys fewer still
    assert s["optimizer_risk_0.3"]["rooms_bought"] <= s["optimizer_risk_0"]["rooms_bought"]
    assert s["optimizer_risk_0"]["unsold"] < s["likely_forecast"]["unsold"]
    # one worst case for the whole plan is milder than one per week: it buys between the two
    assert (s["optimizer_risk_0.3"]["rooms_bought"] <= s["optimizer_plan_risk_0.3"]["rooms_bought"]
            <= s["optimizer_risk_0"]["rooms_bought"])


def test_decision_backtest_gives_a_confidence_interval_around_each_uplift():
    result = decision_backtest(history(), test_from=WEEK + pd.Timedelta(weeks=100), leads=(120,), margins=(0.2,))
    s = result["results"][0]["strategies"]
    assert "vs_rebuy" not in s["rebuy_last_year"]
    for name in ("likely_forecast", "optimizer_risk_0"):
        low, high = s[name]["vs_rebuy_95ci"]
        assert low <= s[name]["vs_rebuy"] <= high
        assert s[name]["vs_rebuy"] == pytest.approx(s[name]["profit"] / s["rebuy_last_year"]["profit"] - 1)
    assert "vs_pickup" not in s["pickup"] and "vs_pickup" not in s["rebuy_last_year"]
    for name in ("pickup", "likely_forecast", "optimizer_risk_0", "optimizer_plan_risk_0.3"):
        low, high = s[name]["vs_rebuy_95ci"]
        assert low <= s[name]["vs_rebuy"] <= high
    for name in ("likely_forecast", "optimizer_risk_0", "optimizer_risk_0.3", "optimizer_plan_risk_0.3"):
        low, high = s[name]["vs_pickup_95ci"]
        assert low <= s[name]["vs_pickup"] <= high
        assert s[name]["vs_pickup"] == pytest.approx(s[name]["profit"] / s["pickup"]["profit"] - 1)


def test_pickup_adds_last_years_pickup_from_the_same_lead_to_what_is_on_the_books():
    rows = pd.DataFrame({"on_books": [30.0, 50.0, 5.0], "final_last_year": [80.0, 40.0, 10.0],
                         "on_books_last_year": [20.0, np.nan, 30.0]})
    # 30 + (80 - 20); last year's pace unknown: last year's final; never below zero
    assert pickup_buys(rows).tolist() == [90.0, 40.0, 0.0]


def test_optimizer_buys_do_not_depend_on_the_room_rate_level():
    low, likely, high = np.array([40.0, 80.0]), np.array([60.0, 100.0]), np.array([90.0, 130.0])
    cheap = _optimizer_buys(low, likely, high, np.array([50.0, 50.0]), margin=0.2, risk_aversion=0.3)
    dear = _optimizer_buys(low, likely, high, np.array([350.0, 120.0]), margin=0.2, risk_aversion=0.3)
    assert cheap.tolist() == dear.tolist()


def test_decision_backtest_needs_a_known_margin():
    with pytest.raises(ValueError, match="margin"):
        decision_backtest(history(), test_from=WEEK + pd.Timedelta(weeks=100), leads=(120,), margins=(1.2,))


def test_decision_backtest_scores_against_pickup_and_reports_the_correlation_it_planned_with():
    result = decision_backtest(history(), test_from=WEEK + pd.Timedelta(weeks=100), leads=(120,), margins=(0.2,))
    assert 0 <= result["rho"] <= 1 and result["rho_source"] in ("estimated", "fallback")
    assert isinstance(result["rho_groups"], int)
    assert set(result["range_rescaling"]) == set(result["test_range_coverage"]) == {120}
    assert "rho_note" in result
    assert set(result["test_range_coverage"][120]) == {"before", "after"}
    s = result["results"][0]["strategies"]
    for name in strategy_names()[2:]:
        low, high = s[name]["vs_rebuy_95ci"]
        assert low <= s[name]["vs_rebuy"] <= high
        low, high = s[name]["vs_pickup_95ci"]
        assert low <= s[name]["vs_pickup"] <= high
        assert s[name]["vs_pickup"] == pytest.approx(s[name]["profit"] / s["pickup"]["profit"] - 1)


def test_correlated_scenarios_keep_each_range():
    low, likely, high = np.array([10.0, 0.0, 50.0]), np.array([20.0, 5.0, 60.0]), np.array([40.0, 30.0, 90.0])
    s = correlated_scenarios(low, likely, high, n=20_000, rho=0.5, seed=1)
    assert s.shape == (20_000, 3) and (s >= 0).all()
    for j in range(3):
        assert np.quantile(s[:, j], [0.1, 0.5, 0.9]) == pytest.approx([low[j], likely[j], high[j]], abs=0.6)
    assert np.array_equal(s, correlated_scenarios(low, likely, high, n=20_000, rho=0.5, seed=1))


def test_correlated_scenarios_move_items_together_by_rho():
    low, likely, high = np.full(4, 10.0), np.full(4, 20.0), np.full(4, 40.0)  # never clipped: ranks are u's

    def level_correlation(rho):
        s = correlated_scenarios(low, likely, high, n=20_000, rho=rho, seed=2)
        ranks = np.argsort(np.argsort(s, axis=0), axis=0)
        c = np.corrcoef(ranks.T)
        return c[np.triu_indices(4, k=1)]

    assert np.abs(level_correlation(0.0)).max() < 0.03
    assert level_correlation(1.0).min() > 0.999
    assert level_correlation(0.5).mean() == pytest.approx(6 / np.pi * np.arcsin(0.5 / 2), abs=0.03)


def test_planner_decides_each_calendar_month_of_weeks_as_one_plan(monkeypatch):
    plans = []

    def one_plan(cost, price, cap, demand, budget, risk_aversion, alpha):
        plans.append(price.tolist())
        assert demand.shape == (backtest.N_SCENARIOS, price.size) and budget == pytest.approx(cost @ cap)
        return np.zeros(price.size)

    monkeypatch.setattr(backtest, "optimize", one_plan)
    # the week of 30 Jan starts in January, so it is planned with January
    weeks = pd.Series(pd.to_datetime(["2017-01-02", "2017-01-30", "2017-02-06", "2017-01-16", "2017-03-27"]))
    low, likely, high = np.full(5, 40.0), np.full(5, 60.0), np.full(5, 90.0)
    _planner_buys(weeks, low, likely, high, np.array([1.0, 2.0, 3.0, 4.0, 5.0]), margin=0.2, lead=120,
                  risk_aversion=0.3, rho=0.5)
    assert plans == [[1.0, 2.0, 4.0], [3.0], [5.0]]


def test_planner_is_less_cautious_when_its_weeks_offset_each_other():
    weeks = pd.Series([WEEK + pd.Timedelta(weeks=w) for w in range(4)])
    low, likely, high = np.full(4, 40.0), np.full(4, 60.0), np.full(4, 90.0)
    price = np.full(4, 100.0)
    apart = _planner_buys(weeks, low, likely, high, price, margin=0.2, lead=120, risk_aversion=0.3, rho=0.0)
    together = _planner_buys(weeks, low, likely, high, price, margin=0.2, lead=120, risk_aversion=0.3, rho=1.0)
    assert apart.sum() > together.sum()


def test_intraclass_correlation_of_a_hand_made_case():
    # group means 2, 6, 10: MSB = 2 * (16 + 0 + 16) / 2 = 32; each group's variance is 2, so MSW = 2
    icc, groups = intraclass_correlation(np.array([1.0, 3, 5, 7, 9, 11, 4]), np.array([0, 0, 1, 1, 2, 2, 3]))
    assert (icc, groups) == (pytest.approx((32 - 2) / (32 + 2)), 3)  # the one-row group is left out
    icc, _ = intraclass_correlation(np.array([0.0, 10, 1, 9, 2, 8]), np.array([0, 0, 1, 1, 2, 2]))
    assert icc == 0  # groups no more alike inside than across: clipped at zero
    icc, groups = intraclass_correlation(np.array([0.0, 1, 2, 3]), np.array([0, 0, 1, 1]))
    assert np.isnan(icc) and groups == 2


def test_decision_backtest_compares_planners_with_the_plain_forecast_and_by_month_blocks():
    result = decision_backtest(history(), test_from=WEEK + pd.Timedelta(weeks=100), leads=(120,), margins=(0.2,))
    s = result["results"][0]["strategies"]
    for name in ("planner_risk_0", "planner_risk_0.3", "planner_risk_0_rescaled", "planner_risk_0.3_rescaled"):
        low, high = s[name]["vs_likely_95ci"]
        assert low <= s[name]["vs_likely"] <= high
        assert s[name]["vs_likely"] == pytest.approx(s[name]["profit"] / s["likely_forecast"]["profit"] - 1)
    for name in ("likely_forecast", "planner_risk_0.3", "planner_risk_0.3_rescaled"):
        assert len(s[name]["vs_rebuy_95ci_month_block"]) == 2
    assert "vs_likely_95ci_month_block" in s["planner_risk_0.3"]
    assert "vs_likely" not in s["likely_forecast"] and "vs_rebuy_95ci_month_block" not in s["planner_risk_0"]


def known_rows(ratios, first_week=WEEK):
    """One lead's finished rows, a week apart, with likely 10 and final 10 x ratio."""
    weeks = [first_week + pd.Timedelta(weeks=w) for w in range(len(ratios))]
    return pd.DataFrame({"week": weeks, "final": 10.0 * np.asarray(ratios), "likely": 10.0})


def test_range_rescaling_takes_quantiles_of_final_over_likely_from_weeks_finished_by_the_decision_month():
    known = known_rows(np.arange(1, 21) / 10)  # ratios 0.1 ... 2.0, weeks from 2 May 2016 to 12 Sep 2016
    decided = pd.Series(pd.to_datetime(["2016-10-01", "2016-09-01", "2016-10-01"]))
    by_month = range_rescaling(known, decided)
    assert by_month[pd.Timestamp("2016-10-01")] == pytest.approx({"q10": 0.29, "q50": 1.05, "q90": 1.81,
                                                                  "rows": 20})
    # by 1 September only 17 weeks had finished: too few, so the range is left as forecast
    assert by_month[pd.Timestamp("2016-09-01")] == {"q10": 1.0, "q50": 1.0, "q90": 1.0, "rows": 17}


def test_range_rescaling_never_divides_by_a_likely_below_one():
    known = known_rows(np.full(20, 3.0)).assign(likely=0.0, final=3.0)
    assert range_rescaling(known, pd.Series([pd.Timestamp("2017-01-01")]))[pd.Timestamp("2017-01-01")]["q50"] == 3.0


def test_range_rescaling_never_looks_at_finals_not_yet_known_by_the_decision_month():
    known = known_rows(np.linspace(0.5, 1.5, 40))
    month = pd.Timestamp("2016-10-01")
    unknown = (known["week"] + pd.Timedelta(days=6) >= month).to_numpy()
    assert unknown.any() and (~unknown).sum() >= 20
    before = range_rescaling(known, pd.Series([month]))[month]
    changed = known.assign(final=np.where(unknown, 1e6, known["final"]))
    assert range_rescaling(changed, pd.Series([month]))[month] == before


def test_rescaled_range_scales_the_likely_forecast_and_keeps_its_order():
    out = rescaled_range(np.array([10.0, 0.0]), np.array([[1.3, 0.9, 2.0], [0.8, 1.0, 1.2]]))
    assert out.tolist() == [[9.0, 13.0, 20.0], [0.0, 0.0, 0.0]]


def test_scenarios_from_range_output_is_pinned():
    s = scenarios_from_range(np.array([10.0, 0.0]), np.array([20.0, 5.0]), np.array([40.0, 30.0]), n=10)
    assert s.tolist() == [[8.75, 0.0], [11.25, 0.6249999999999998], [13.75, 1.875], [16.25, 3.124999999999999],
                          [18.75, 4.375], [22.500000000000004, 8.125000000000004], [27.5, 14.375], [32.5, 20.625],
                          [37.5, 26.875], [42.5, 33.12499999999999]]


@pytest.mark.parametrize("rho", [-0.1, 1.1])
def test_correlated_scenarios_need_a_rho_between_zero_and_one(rho):
    with pytest.raises(ValueError, match="rho"):
        correlated_scenarios(np.array([1.0]), np.array([2.0]), np.array([3.0]), n=10, rho=rho, seed=0)


def test_estimate_rho_falls_back_with_too_few_month_groups():
    fold = pd.DataFrame({"lead": 120, "week": pd.to_datetime(["2016-07-04", "2016-07-11", "2016-08-01",
                                                              "2016-08-08"]), "final": [10.0, 20, 30, 40]})
    ranges = np.array([[5.0, 12, 20], [5, 18, 30], [20, 25, 40], [30, 45, 50]])
    assert estimate_rho(fold, ranges) == {"rho": 0.5, "rho_source": "fallback", "rho_groups": 2}
    assert estimate_rho(fold.iloc[:0], ranges[:0]) == {"rho": 0.5, "rho_source": "fallback", "rho_groups": 0}


def test_month_block_bootstrap_resamples_whole_months():
    # month A earns what re-buy does, month B three times it: whole months can only give 0, +100% or +200%
    profits, base = np.array([1.0, 1, 3, 3]), np.ones(4)
    low, high = _month_block_ci(profits, base, np.array([201601, 201601, 201602, 201602]),
                                np.random.default_rng(0))
    assert (low, high) == (0.0, 2.0)
