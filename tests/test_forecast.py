import numpy as np
import pandas as pd
import pytest

from voyance.forecast import FEATURES, agent_bookings, backtest, booking_curves, fit, with_history

WEEK = pd.Timestamp("2016-05-02")  # a Monday


def raw(arrival, lead, nights=1, hotel="City Hotel", canceled_days_before=None, channel="TA/TO"):
    """One row of the public hotel-bookings dataset."""
    arrival = pd.Timestamp(arrival)
    status = arrival if canceled_days_before is None else arrival - pd.Timedelta(days=canceled_days_before)
    return {
        "hotel": hotel, "arrival_date_year": arrival.year, "arrival_date_month": arrival.month_name(),
        "arrival_date_day_of_month": arrival.day, "lead_time": lead,
        "is_canceled": int(canceled_days_before is not None), "reservation_status_date": status.date().isoformat(),
        "stays_in_weekend_nights": 0, "stays_in_week_nights": nights, "distribution_channel": channel,
    }


def test_agent_bookings_keeps_agent_rows_with_their_dates():
    out = agent_bookings(pd.DataFrame([raw("2016-05-04", lead=10, nights=3),
                                       raw("2016-05-04", lead=10, channel="Direct"),
                                       raw("2016-05-06", lead=40, canceled_days_before=5)]))
    assert len(out) == 2
    first, cancelled = out.iloc[0], out.iloc[1]
    assert (first.week, first.booked, first.nights, first.kept) == (WEEK, pd.Timestamp("2016-04-24"), 3, True)
    assert pd.isna(first.cancelled_on)
    assert cancelled.cancelled_on == pd.Timestamp("2016-05-01") and not cancelled.kept


def test_booking_curve_counts_what_was_on_the_books_at_each_lead():
    rows = [raw(WEEK + pd.Timedelta(days=1), lead=40, nights=3),   # booked 39 days before the week starts
            raw(WEEK + pd.Timedelta(days=2), lead=10, nights=2),   # booked 8 days before
            raw(WEEK, lead=50, nights=4, canceled_days_before=20),  # on the books from 50 to 20 days before
            raw("2016-04-01", lead=5), raw("2016-06-30", lead=5)]  # the data covers the whole week
    curves = booking_curves(agent_bookings(pd.DataFrame(rows)), leads=(7, 30))
    week = curves[curves.week == WEEK].set_index("lead")
    assert week.loc[30, "on_books"] == 3 + 4 and week.loc[7, "on_books"] == 3 + 2
    assert (week.final == 5).all()


def test_booking_curve_drops_weeks_the_data_only_partly_covers():
    rows = [raw(WEEK + pd.Timedelta(days=3), lead=5), raw(WEEK + pd.Timedelta(days=4), lead=5)]
    assert booking_curves(agent_bookings(pd.DataFrame(rows)), leads=(7,)).empty


def curve(hotel, week, lead, on_books, final):
    return {"hotel": hotel, "week": pd.Timestamp(week), "lead": lead, "on_books": on_books, "final": final}


def test_history_adds_last_year_and_the_pace_four_weeks_earlier():
    last_year = WEEK - pd.Timedelta(weeks=52)
    curves = pd.DataFrame([curve("A", WEEK, 30, 10, 20), curve("A", last_year, 30, 6, 15),
                           curve("A", WEEK - pd.Timedelta(weeks=4), 30, 8, 18), curve("B", WEEK, 30, 1, 2)])
    out = with_history(curves).set_index(["hotel", "week"])
    row = out.loc[("A", WEEK)]
    assert (row.final_last_year, row.on_books_last_year, row.on_books_4_weeks_earlier) == (15, 6, 8)
    assert row.week_of_year == WEEK.isocalendar().week
    assert out.loc[("B", WEEK)][["final_last_year", "on_books_4_weeks_earlier"]].isna().all()


def synthetic_history(weeks=120, seed=0):
    """Two hotels whose final demand is about twice what is on the books, less so far ahead."""
    rng = np.random.default_rng(seed)
    rows = []
    for hotel in ("A", "B"):
        for w in range(weeks):
            final = rng.uniform(50, 150)
            for lead in (30, 90):
                share = 0.7 if lead == 30 else 0.4
                rows.append(curve(hotel, WEEK + pd.Timedelta(weeks=w), lead,
                                  final * share * rng.uniform(0.9, 1.1), final))
    return with_history(pd.DataFrame(rows))


def test_forecast_gives_ordered_ranges_close_to_the_truth():
    frame = synthetic_history()
    model = fit(frame.iloc[:400])
    test = frame.iloc[400:]
    low, likely, high = model.predict(test).T
    assert (low <= likely).all() and (likely <= high).all() and (low >= 0).all()
    assert np.abs(likely - test.final).sum() / test.final.sum() < 0.15


def test_forecast_explanation_adds_up_to_the_likely_forecast():
    frame = synthetic_history()
    model = fit(frame)
    shap = model.explain(frame.iloc[:5])
    assert list(shap.columns) == [*FEATURES, "base"]
    assert shap.sum(axis=1).to_numpy() == pytest.approx(model.predict(frame.iloc[:5])[:, 1], rel=1e-6)


def test_forecast_refuses_a_hotel_it_never_learned():
    frame = synthetic_history()
    model = fit(frame[frame.hotel == "A"])
    with pytest.raises(ValueError, match="B"):
        model.predict(frame[frame.hotel == "B"])


def test_backtest_trains_only_on_the_past_and_scores_each_lead():
    frame = synthetic_history()
    split = WEEK + pd.Timedelta(weeks=100)
    result = backtest(frame, test_from=split)
    assert pd.Timestamp(result["train_weeks"][1]) < split <= pd.Timestamp(result["test_weeks"][0])
    by_lead = {row["lead"]: row for row in result["by_lead"]}
    assert set(by_lead) == {30, 90}
    for row in by_lead.values():
        assert row["hotel_weeks"] == 2 * 20 and 0 <= row["range_coverage"] <= 1
        assert row["wape_forecast"] < row["wape_last_year"]  # last year's demand is unrelated noise here
    assert set(result["mean_abs_shap"]) == set(FEATURES)
