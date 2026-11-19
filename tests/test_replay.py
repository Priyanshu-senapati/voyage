import json
import math

import numpy as np
import pandas as pd
import pytest

from voyance.forecast import with_history
from voyance.replay import DRIVER_LABELS, build_replay

WEEK = pd.Timestamp("2016-05-02")
SPLIT = WEEK + pd.Timedelta(weeks=100)


def history(weeks=120, seed=2):
    rng = np.random.default_rng(seed)
    rows = []
    for hotel in ("A", "B"):
        for w in range(weeks):
            final = rng.uniform(50, 150)
            for lead in (90, 120):
                rows.append({"hotel": hotel, "week": WEEK + pd.Timedelta(weeks=w), "lead": lead,
                             "on_books": final * 0.5 * rng.uniform(0.9, 1.1), "final": final,
                             "rate": rng.uniform(80, 120)})
    return with_history(pd.DataFrame(rows))


@pytest.fixture(scope="module")
def replay():
    return build_replay(history(), test_from=SPLIT, lead=120, margin=0.2)


def test_replay_covers_each_test_hotel_week_once_in_date_order(replay):
    weeks = replay["weeks"]
    assert len(weeks) == 2 * 20
    keys = [(w["week"], w["hotel"]) for w in weeks]
    assert keys == sorted(keys) and len(set(keys)) == len(keys)
    assert all(w["week"] >= SPLIT.date().isoformat() for w in weeks)
    assert replay["assumptions"] == {"lead_days": 120, "margin": 0.2, "test_from": SPLIT.date().isoformat()}


def test_each_decision_shows_belief_choice_and_outcome_consistently(replay):
    for w in replay["weeks"]:
        f = w["forecast"]
        assert f["low"] <= f["likely"] <= f["high"]
        assert w["decided_on"] == (pd.Timestamp(w["week"]) - pd.Timedelta(days=120)).date().isoformat()
        assert w["strategies"]["voyance"]["rooms"] == math.floor(f["likely"])
        assert w["strategies"]["rebuy_last_year"]["rooms"] == math.floor(w["last_year"])
        for s in w["strategies"].values():
            sold = min(s["rooms"], w["actual"])
            assert s["sold"] == pytest.approx(sold)
            assert s["unsold"] == pytest.approx(s["rooms"] - sold)
            assert s["turned_away"] == pytest.approx(w["actual"] - sold)
            assert s["profit"] == pytest.approx(w["rate"] * sold - w["rate"] * 0.8 * s["rooms"])


def test_running_totals_add_up_to_the_totals(replay):
    for name in ("voyance", "rebuy_last_year"):
        running = [w["running_profit"][name] for w in replay["weeks"]]
        assert running[-1] == pytest.approx(sum(w["strategies"][name]["profit"] for w in replay["weeks"]))
        assert running[-1] == pytest.approx(replay["totals"][name]["profit"])
    assert replay["totals"]["voyance"]["profit"] > replay["totals"]["rebuy_last_year"]["profit"]


def test_each_forecast_names_its_biggest_drivers_in_plain_words(replay):
    for w in replay["weeks"]:
        drivers = w["forecast"]["drivers"]
        assert len(drivers) == 3 and all(d["label"] in DRIVER_LABELS.values() for d in drivers)
        sizes = [abs(d["room_nights"]) for d in drivers]
        assert sizes == sorted(sizes, reverse=True)


def test_replay_is_plain_json(replay):
    assert json.loads(json.dumps(replay)) == replay
