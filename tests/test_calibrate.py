import hashlib

import numpy as np
import pytest

from voyance import calibrate
from voyance.calibrate import (december_buy_ahead_days, december_shape, fetch_verified, late_cancel_share,
                               rate_vs_demand, room_nights, summary, year_to_year_cv)

NEVER_FETCHED = "https://example.invalid/hotels.csv"  # the file already exists, so this must not be used


def test_fetch_verified_reads_a_saved_file_with_the_right_hash(tmp_path):
    path = tmp_path / "hotels.csv"
    path.write_bytes(b"hotel\nResort Hotel\n")
    assert fetch_verified(path, NEVER_FETCHED, hashlib.sha256(b"hotel\nResort Hotel\n").hexdigest()) == \
        b"hotel\nResort Hotel\n"


def test_fetch_verified_rejects_a_file_that_was_changed(tmp_path):
    path = tmp_path / "hotels.csv"
    path.write_bytes(b"tampered")
    with pytest.raises(RuntimeError, match="SHA-256"):
        fetch_verified(path, NEVER_FETCHED, hashlib.sha256(b"original").hexdigest())


def test_fetch_verified_saves_a_download_only_after_checking_it(tmp_path, monkeypatch):
    monkeypatch.setattr(calibrate, "_download", lambda url: b"good")
    path = tmp_path / "raw" / "hotels.csv"
    assert fetch_verified(path, "https://example.org/h.csv", hashlib.sha256(b"good").hexdigest()) == b"good"
    assert path.read_bytes() == b"good"


def test_fetch_verified_saves_nothing_when_a_download_fails_the_check(tmp_path, monkeypatch):
    monkeypatch.setattr(calibrate, "_download", lambda url: b"evil")
    path = tmp_path / "hotels.csv"
    with pytest.raises(RuntimeError, match="SHA-256"):
        fetch_verified(path, "https://example.org/h.csv", hashlib.sha256(b"good").hexdigest())
    assert list(tmp_path.iterdir()) == []


def test_download_refuses_plain_http():
    with pytest.raises(ValueError, match="https"):
        calibrate._download("http://example.org/h.csv")


def test_download_has_a_timeout_and_a_size_cap(monkeypatch):
    seen = {}

    class Endless:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def read(self, n):
            return b"x" * n

    def fake_urlopen(url, timeout):
        seen["timeout"] = timeout
        return Endless()

    monkeypatch.setattr(calibrate.urllib.request, "urlopen", fake_urlopen)
    with pytest.raises(RuntimeError, match="larger"):
        calibrate._download("https://example.org/h.csv")
    assert seen["timeout"] == calibrate.DOWNLOAD_TIMEOUT_S


def booking(hotel="Resort Hotel", year=2016, month="December", day=1, week=49, nights=1,
            canceled=False, channel="TA/TO", lead=10):
    return {
        "hotel": hotel, "arrival_date_year": str(year), "arrival_date_month": month,
        "arrival_date_day_of_month": str(day), "arrival_date_week_number": str(week),
        "stays_in_weekend_nights": "0", "stays_in_week_nights": str(nights),
        "is_canceled": "1" if canceled else "0", "distribution_channel": channel, "lead_time": str(lead),
        "adr": "100", "reservation_status_date": "2016-11-01",
    }


def test_room_nights_adds_weekend_and_week_nights():
    row = booking(nights=3) | {"stays_in_weekend_nights": "2"}
    assert room_nights(row) == 5


def test_december_shape_scales_each_hotel_year_to_mean_one():
    # 2, 1, 1, 4 room-nights in weeks 1-4 (mean 2)
    rows = [booking(day=d, nights=n) for d, n in ((3, 2), (10, 1), (17, 1), (24, 4))]
    assert december_shape(rows).tolist() == [1.0, 0.5, 0.5, 2.0]


def test_december_shape_skips_cancelled_late_and_other_month_stays():
    rows = [booking(day=d) for d in (1, 8, 15, 22)]
    rows += [booking(day=2, nights=9, canceled=True), booking(day=30, nights=9),
             booking(day=2, nights=9, month="November")]
    assert december_shape(rows).tolist() == [1.0, 1.0, 1.0, 1.0]


def test_december_shape_averages_hotel_years():
    flat = [booking(day=d, nights=2) for d in (1, 8, 15, 22)]
    peaked = [booking(hotel="City Hotel", day=d, nights=n) for d, n in ((1, 1), (8, 1), (15, 1), (22, 5))]
    assert december_shape(flat + peaked).tolist() == pytest.approx([0.75, 0.75, 0.75, 1.75])


def test_december_shape_needs_december_stays():
    with pytest.raises(ValueError):
        december_shape([booking(month="July")])


def test_year_to_year_cv_ignores_steady_growth():
    # every week grows exactly 2x between years: no swing left once growth is removed
    rows = [booking(year=y, week=w, nights=n * w) for w in (1, 2, 3) for y, n in ((2015, 1), (2016, 2))]
    assert year_to_year_cv(rows) == pytest.approx(0.0, abs=1e-12)


def test_year_to_year_cv_recovers_known_lognormal_noise():
    # each hotel-week-year gets independent log-noise of sigma s, so the answer is sqrt(e^(s^2) - 1)
    s, rng = 0.25, np.random.default_rng(0)
    rows = [booking(hotel=f"H{h}", year=y, week=w, nights=round(1e6 * np.exp(rng.normal(0, s))))
            for h in range(40) for w in range(1, 51) for y in (2015, 2016)]
    assert year_to_year_cv(rows) == pytest.approx(np.sqrt(np.expm1(s**2)), rel=0.1)


def test_year_to_year_cv_is_not_moved_by_one_wild_week():
    # steady 2x growth, except one week that jumps 10x (a hotel opening, a half-covered week)
    rows = [booking(year=y, week=w, nights=n * 100) for w in range(1, 21) for y, n in ((2015, 1), (2016, 2))]
    rows += [booking(year=2015, week=21, nights=100), booking(year=2016, week=21, nights=1000)]
    assert year_to_year_cv(rows) == pytest.approx(0.0, abs=1e-12)


def test_year_to_year_cv_only_compares_back_to_back_years():
    # 2015 vs 2017 is two years of change, so it is not used
    with pytest.raises(ValueError):
        year_to_year_cv([booking(year=y, week=w) for w in (1, 2) for y in (2015, 2017)])


def test_year_to_year_cv_needs_repeated_weeks():
    with pytest.raises(ValueError):
        year_to_year_cv([booking(year=2016, week=w) for w in (1, 2)])


def test_buy_ahead_days_is_the_lead_time_most_bookings_come_after_per_december_week():
    rows = [booking(day=1 + 7 * w, lead=lead) for w in range(4) for lead in range(10 * w, 10 * w + 11)]
    rows += [booking(day=2, lead=900, canceled=True), booking(day=30, lead=900),
             booking(day=2, lead=900, month="November")]
    # 0..10 days ahead in week 1: 90% of bookings come at most 9 days ahead
    assert december_buy_ahead_days(rows, quantile=0.9) == [9, 19, 29, 39]


def test_buy_ahead_days_needs_bookings_in_every_week():
    with pytest.raises(ValueError, match="week 4"):
        december_buy_ahead_days([booking(day=d) for d in (1, 8, 15)], quantile=0.9)


def test_summary_reports_agent_channel_facts():
    rows = [booking(day=d, week=49 + i, lead=lead, year=y)
            for y in (2015, 2016) for i, (d, lead) in enumerate(((1, 10), (8, 30), (15, 50), (22, 70)))]
    rows += [booking(channel="Direct"), booking(canceled=True, lead=500)]
    out = summary(rows)
    assert out["bookings"] == 10
    assert out["agent_share"] == pytest.approx(0.9)
    assert out["agent_cancel_rate"] == pytest.approx(1 / 9)
    assert out["agent_median_lead_days"] == 40
    assert out["december_shape"] == [1.0, 1.0, 1.0, 1.0]
    assert out["december_hotel_years"] == 2
    assert out["year_to_year_cv"] == pytest.approx(0.0, abs=1e-9)
    assert out["year_to_year_week_pairs"] == 4
    assert out["december_buy_ahead_days"] == [10, 30, 50, 70]  # one booking per week and year
    assert out["agent_late_cancel_share"] == 0.0  # its one cancellation came a month before arrival
    assert out["rate_vs_demand"]["elasticity"] == 0.0  # every week is equally busy: nothing to measure


def test_rate_vs_demand_measures_how_rates_rise_with_demand():
    rows = []
    for hotel in ("City Hotel", "Resort Hotel"):
        for week, demand in enumerate((6, 8, 9, 10, 10, 11, 12, 13), start=10):
            rate = 100 * (demand / 10) ** 0.5  # each week's rate: the square root of its demand vs the usual week
            rows += [booking(hotel=hotel, month="March", week=week) | {"adr": str(rate)}] * demand
    rows += [booking(week=30, canceled=True) | {"adr": "999"}, booking(week=31) | {"adr": "0"}]  # ignored
    fit = rate_vs_demand(rows)
    assert fit["elasticity"] == pytest.approx(0.5) and fit["weeks"] == 16


def test_rate_vs_demand_ignores_weeks_far_outside_the_usual():
    rows = [booking(week=w) for w in range(1, 6) for _ in range(10)]
    rows += [booking(week=9) | {"adr": "900"}] * 40  # 4x the usual demand: outside the range we trust
    assert rate_vs_demand(rows) == {"elasticity": 0.0, "weeks": 5, "demand_range": [0.6, 1.4]}


def test_late_cancel_share_counts_cancellations_within_a_week_of_arrival():
    rows = [booking(day=10, canceled=True) | {"reservation_status_date": when}
            for when in ("2016-12-09", "2016-12-03", "2016-11-01", "2016-10-01")]
    rows.append(booking(day=10))  # kept bookings don't count
    assert late_cancel_share(rows) == 0.5
    assert late_cancel_share([booking()]) == 0.0
