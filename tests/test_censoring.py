import pandas as pd
import pytest

from voyance.censoring import censoring_test
from voyance.forecast import with_history

WEEK = pd.Timestamp("2016-01-04")


def frame(weeks=120):
    """One hotel whose weeks alternate quiet (50) and peak (150) room-nights, every year alike."""
    rows = [{"hotel": "A", "week": WEEK + pd.Timedelta(weeks=w), "lead": 90, "on_books": 0.0,
             "final": 150.0 if w % 2 else 50.0, "rate": 100.0} for w in range(weeks)]
    return with_history(pd.DataFrame(rows))


def test_hidden_demand_recovers_the_peaks_an_allotment_hid_and_buys_better_for_it():
    # the typical week is 100 rooms: last year's peaks sold out at 100, and only searches show the other 50
    result = censoring_test(frame(), test_from=WEEK + pd.Timedelta(weeks=100), draws=20)
    assert result["censored_weeks"] == result["hotel_weeks"] // 2
    assert result["bookings_error"] > 0.2  # last year's bookings miss a quarter of the demand
    right = result["cases"]["look-to-book as assumed"]
    assert right["error_of_last_year"] < 0.03  # searches / look-to-book put the missing demand back
    assert right["profit_vs_rebuy_bookings"] > 0.05 and right["turned_away"] < result["rebuy_bookings"]["turned_away"]
    assert right["sized_vs_sized_bookings"] > 0.05  # also when both are sized the planner's way


def test_the_newsvendor_buys_less_than_expected_demand_at_thin_margins():
    from voyance.censoring import newsvendor_share
    assert newsvendor_share(0.2) < newsvendor_share(0.3) < 1 < newsvendor_share(0.7)
    assert newsvendor_share(0.5, cv=1e-9) == pytest.approx(1.0)


def test_duplicated_searches_overstate_hidden_demand():
    cases = censoring_test(frame(), test_from=WEEK + pd.Timedelta(weeks=100), draws=20)["cases"]
    assert cases["50% duplicate searches"]["error_of_last_year"] > cases["look-to-book as assumed"]["error_of_last_year"]
    assert cases["50% duplicate searches"]["unsold"] > cases["look-to-book as assumed"]["unsold"]
