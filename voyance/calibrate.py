"""Demand facts measured on real hotel bookings, to check and tune the simulator.

Dataset: N. Antonio, A. de Almeida, L. Nunes (2019), "Hotel booking demand datasets",
Data in Brief 22: 41-49. Licence CC BY 4.0. Two Portuguese hotels, July 2015 - August 2017.
"""

import hashlib
import os
import urllib.request
from collections import defaultdict
from collections.abc import Iterable, Mapping
from datetime import date
from pathlib import Path

import numpy as np

DATASET_URL = ("https://raw.githubusercontent.com/rfordatascience/tidytuesday/master/data/2020/2020-02-11/"
               "hotels.csv")
DATASET_SHA256 = "7c2ae42a7353905ea136e5c2287f17c92c5435826598bfbb8491c6f0c7b1fc06"
DOWNLOAD_TIMEOUT_S = 60
MAX_DOWNLOAD_BYTES = 64 * 2**20  # the dataset is about 16 MB
MAD_TO_SIGMA = 1.4826  # median absolute deviation -> standard deviation, for normal noise
Row = Mapping[str, str]
AGENT_CHANNEL = "TA/TO"  # travel agents and tour operators: the channel TBO sells through
DECEMBER_WEEKS = 4  # days 1-7, 8-14, 15-21, 22-28, matching voyance.sim.WEEKS
BUY_AHEAD_QUANTILE = 0.9  # buy before 90% of a week's agent bookings are made
LATE_CANCEL_DAYS = 7  # a room given back this close to arrival rarely sells again
TRUSTED_DEMAND = (0.6, 1.4)  # demand vs the hotel's usual week; further out, weeks are few and mostly one season
MONTHS = {name: number for number, name in enumerate(
    ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
     "November", "December"), start=1)}


def fetch_verified(path: Path, url: str, sha256: str) -> bytes:
    """The dataset's bytes: read from `path`, or downloaded once and saved there. Refuses any other content."""
    saved = path.exists()
    data = path.read_bytes() if saved else _download(url)
    if hashlib.sha256(data).hexdigest() != sha256:
        raise RuntimeError(f"{path.name} does not match the expected SHA-256; delete it and run again")
    if not saved:
        path.parent.mkdir(parents=True, exist_ok=True)
        part = path.with_name(path.name + ".part")
        part.write_bytes(data)
        os.replace(part, path)  # never leave a half-written file behind
    return data


def _download(url: str) -> bytes:
    if not url.startswith("https://"):
        raise ValueError("dataset URL must use https")
    with urllib.request.urlopen(url, timeout=DOWNLOAD_TIMEOUT_S) as resp:  # noqa: S310 (https checked above)
        data = resp.read(MAX_DOWNLOAD_BYTES + 1)
    if len(data) > MAX_DOWNLOAD_BYTES:
        raise RuntimeError("download is larger than the dataset should be")
    return data


def room_nights(row: Row) -> int:
    return int(row["stays_in_weekend_nights"]) + int(row["stays_in_week_nights"])


def _stayed(row: Row) -> bool:
    # day-use bookings (0 nights) count as kept bookings but add no room-nights
    return row["is_canceled"] == "0"


def _december_weeks(rows: Iterable[Row]) -> list[np.ndarray]:
    """Room-nights per December week, one array per hotel-year that has December stays."""
    weeks: dict[tuple[str, str], np.ndarray] = defaultdict(lambda: np.zeros(DECEMBER_WEEKS))
    for r in rows:
        day = int(r["arrival_date_day_of_month"])
        if _stayed(r) and r["arrival_date_month"] == "December" and day <= 7 * DECEMBER_WEEKS:
            weeks[r["hotel"], r["arrival_date_year"]][(day - 1) // 7] += room_nights(r)
    return [w for w in weeks.values() if w.sum() > 0]


def december_shape(rows: Iterable[Row]) -> np.ndarray:
    """Room-nights per December week, each hotel-year scaled to mean 1, then averaged."""
    shapes = [w / w.mean() for w in _december_weeks(rows)]
    if not shapes:
        raise ValueError("no December stays to measure")
    return np.mean(shapes, axis=0)


def december_buy_ahead_days(rows: Iterable[Row], quantile: float = BUY_AHEAD_QUANTILE) -> list[int]:
    """Per December week, how many days ahead `quantile` of kept bookings are made at most.

    Buying that many days before the week starts beats all but the earliest (1 - quantile) of its bookings.
    """
    leads: list[list[int]] = [[] for _ in range(DECEMBER_WEEKS)]
    for r in rows:
        day = int(r["arrival_date_day_of_month"])
        if _stayed(r) and r["arrival_date_month"] == "December" and day <= 7 * DECEMBER_WEEKS:
            leads[(day - 1) // 7].append(int(r["lead_time"]))
    for week, week_leads in enumerate(leads, start=1):
        if not week_leads:
            raise ValueError(f"no December bookings in week {week}")
    # round first so float noise (93.00000000000001) can't add a day
    return [int(np.ceil(round(float(np.quantile(week_leads, quantile)), 9))) for week_leads in leads]


def _log_ratio_groups(rows: Iterable[Row]) -> list[np.ndarray]:
    """Log change of each week's room-nights from one year to the next, grouped by (hotel, year)."""
    weekly: dict[tuple[str, int], dict[int, float]] = defaultdict(lambda: defaultdict(float))
    for r in rows:
        if _stayed(r):
            weekly[r["hotel"], int(r["arrival_date_week_number"])][int(r["arrival_date_year"])] += room_nights(r)

    groups: dict[tuple[str, int], list[float]] = defaultdict(list)
    for (hotel, _week), by_year in weekly.items():
        for year, nights in by_year.items():
            following = by_year.get(year + 1, 0.0)
            if nights > 0 and following > 0:
                groups[hotel, year].append(float(np.log(following / nights)))
    return [np.array(g) for g in groups.values()]


def year_to_year_cv(rows: Iterable[Row]) -> float:
    """How much a week's room-nights swing from one year to the next, as a coefficient of variation.

    Uses back-to-back years only. Each (hotel, year) group's typical growth (its median) is removed, and the
    spread is the median absolute deviation, so a few odd weeks (a hotel still ramping up, a week the data
    only half covers) don't count as normal swing. A one-year change carries two years' noise, so sigma is
    divided by sqrt(2). Includes counting noise, and back-to-back changes share a year, so it is approximate.
    """
    groups = [g for g in _log_ratio_groups(rows) if g.size > 1]
    if not groups:
        raise ValueError("need the same weeks in at least two back-to-back years")
    spread = np.concatenate([np.abs(g - np.median(g)) for g in groups])
    sigma = MAD_TO_SIGMA * float(np.median(spread)) / np.sqrt(2)
    return float(np.sqrt(np.expm1(sigma**2)))


def late_cancel_share(rows: Iterable[Row], days: int = LATE_CANCEL_DAYS) -> float:
    """Share of cancellations made within `days` of arrival, too late to sell the room again (0 if none)."""
    gaps = [(_arrival(r) - date.fromisoformat(r["reservation_status_date"])).days for r in rows if not _stayed(r)]
    return float(np.mean(np.array(gaps) <= days)) if gaps else 0.0


def rate_vs_demand(rows: Iterable[Row]) -> dict:
    """How agent rates differ between a hotel's busier and quieter weeks: the slope of log(rate) on
    log(room-nights), each week against its hotel's typical (median) week, over the demand range we trust. Mostly
    seasons: busy weeks carry higher rates. 0.5 = a week 21% busier than typical, rates 10% above. 0 when no week's
    demand differs from the typical (nothing to measure)."""
    weekly = _weekly_rates(rows)
    x: list[float] = []
    y: list[float] = []
    for hotel in sorted({week[0] for week in weekly}):
        demand, rate = (np.array(v) for v in zip(*[weekly[w] for w in weekly if w[0] == hotel]))
        _add_logs(x, y, demand / np.median(demand), rate / np.median(rate))
    return {"elasticity": _slope(x, y), "weeks": len(x), "demand_range": list(TRUSTED_DEMAND)}


def rate_vs_demand_same_week(rows: Iterable[Row]) -> dict:
    """The same slope for one week of the year across years: is a busier year for that week sold at higher rates?
    Each year is first scaled by that hotel-year's typical week, so growth and inflation drop out."""
    weekly = _weekly_rates(rows)
    typical: dict[tuple[str, str], list[tuple[float, float]]] = defaultdict(list)
    for (hotel, year, _), values in weekly.items():
        typical[hotel, year].append(values)
    scale = {key: np.median(np.array(v), axis=0) for key, v in typical.items()}
    by_week: dict[tuple[str, str], list[tuple[float, float]]] = defaultdict(list)
    for (hotel, year, week), (nights, rate) in weekly.items():
        by_week[hotel, week].append((nights / scale[hotel, year][0], rate / scale[hotel, year][1]))
    x: list[float] = []
    y: list[float] = []
    for pairs in by_week.values():
        if len(pairs) > 1:
            demand, rate = (np.array(v) for v in zip(*pairs))
            _add_logs(x, y, demand / demand.mean(), rate / rate.mean())
    return {"elasticity": _slope(x, y), "weeks": len(x), "demand_range": list(TRUSTED_DEMAND)}


def _weekly_rates(rows: Iterable[Row]) -> dict[tuple[str, str, str], tuple[float, float]]:
    """(room-nights, average rate) of kept agent stays per hotel, year and week of the year."""
    nights: dict[tuple[str, str, str], float] = defaultdict(float)
    revenue: dict[tuple[str, str, str], float] = defaultdict(float)
    for r in rows:
        n, rate = room_nights(r), float(r["adr"])
        if _stayed(r) and n > 0 and rate > 0:
            week = r["hotel"], r["arrival_date_year"], r["arrival_date_week_number"]
            nights[week] += n
            revenue[week] += n * rate
    return {week: (n, revenue[week] / n) for week, n in nights.items()}


def _add_logs(x: list[float], y: list[float], demand: np.ndarray, rate: np.ndarray) -> None:
    keep = (demand >= TRUSTED_DEMAND[0]) & (demand <= TRUSTED_DEMAND[1])
    x += np.log(demand[keep]).tolist()
    y += np.log(rate[keep]).tolist()


def _slope(x: list[float], y: list[float]) -> float:
    x_, y_ = np.array(x), np.array(y)
    return float(x_ @ y_ / (x_ @ x_)) if (x_ != 0).any() else 0.0  # through the origin: typical demand, rate


def _arrival(row: Row) -> date:
    return date(int(row["arrival_date_year"]), MONTHS[row["arrival_date_month"]], int(row["arrival_date_day_of_month"]))


def summary(rows: list[Row]) -> dict:
    """Facts about agent bookings (TA/TO), the part of the market a distributor serves."""
    agent = [r for r in rows if r["distribution_channel"] == AGENT_CHANNEL]
    if not agent:
        raise ValueError("no agent bookings")
    stayed = [r for r in agent if _stayed(r)]
    return {
        "bookings": len(rows),
        "agent_share": len(agent) / len(rows),
        "agent_cancel_rate": 1 - len(stayed) / len(agent),
        "agent_median_lead_days": float(np.median([int(r["lead_time"]) for r in stayed])),
        "december_shape": december_shape(agent).round(3).tolist(),
        "december_hotel_years": len(_december_weeks(agent)),
        "year_to_year_cv": year_to_year_cv(agent),
        "year_to_year_week_pairs": sum(g.size for g in _log_ratio_groups(agent)),
        "december_buy_ahead_days": december_buy_ahead_days(agent),
        "agent_late_cancel_share": late_cancel_share(agent),
        "rate_vs_demand": rate_vs_demand(agent),
        "rate_vs_demand_same_week": rate_vs_demand_same_week(agent),
    }
