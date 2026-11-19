import numpy as np
import pandas as pd
import pytest

from voyance.backtest import _optimizer_buys, decision_backtest, outcome, pickup_buys, strategy_names
from voyance.forecast import with_history

WEEK = pd.Timestamp("2016-05-02")


def test_outcome_counts_profit_unsold_and_turned_away_rooms():
    out = outcome(buy=np.array([10, 4]), actual=np.array([6, 9]), price=np.array([100.0, 50.0]), margin=0.2)
    # rooms cost 80 and 40: 6*100 - 10*80 = -200, then 4*50 - 4*40 = 40
    assert out == {"profit": pytest.approx(-160), "rooms_bought": 14, "unsold": 4, "turned_away": 5}


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
        "optimizer_plan_risk_0.3")
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
