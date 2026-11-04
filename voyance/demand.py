"""Demand estimates: count back demand hidden by sold-out dates, then draw scenarios."""

import numpy as np
from numpy.typing import ArrayLike


def unconstrain(bookings: ArrayLike, soldout_searches: ArrayLike, look_to_book: float) -> np.ndarray:
    """True demand = bookings + the bookings that sold-out searches would have made.

    look_to_book is searches per booking, so soldout_searches / look_to_book converts
    failed searches into lost bookings.
    """
    # shortcut: assumes sold-out searchers convert at the normal rate; switch to an
    # EM-style unconstraining method once real search logs are available.
    if look_to_book <= 0:
        raise ValueError("look_to_book must be positive")
    booked = np.asarray(bookings, dtype=float)
    lost = np.asarray(soldout_searches, dtype=float)
    if booked.shape != lost.shape:
        raise ValueError("bookings and soldout_searches must have the same shape")
    if (booked < 0).any() or (lost < 0).any():
        raise ValueError("bookings and soldout_searches must be non-negative")
    return booked + lost / look_to_book


def scenarios(mean: ArrayLike, cv: float, n: int, rng: np.random.Generator) -> np.ndarray:
    """Draw n demand scenarios per item (shape n x items), gamma-distributed around mean."""
    if not np.isfinite(cv) or cv <= 0:
        raise ValueError("cv must be a positive number")
    mean = np.asarray(mean, dtype=float)
    if mean.ndim != 1 or not np.isfinite(mean).all() or (mean < 0).any():
        raise ValueError("mean demand must be a 1-D array of non-negative numbers")
    shape = 1.0 / cv**2
    return rng.gamma(shape, mean / shape, size=(n, mean.size))
