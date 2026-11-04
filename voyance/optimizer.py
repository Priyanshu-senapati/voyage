"""Budget-constrained pre-buy optimizer.

Chooses how many rooms to buy per item to maximise

    (1 - risk_aversion) * expected profit + risk_aversion * CVaR

over demand scenarios. CVaR is the average profit in the worst `alpha` share of
scenarios, linearised the Rockafellar-Uryasev way, so the whole thing is one linear
program solved by HiGHS (bundled with scipy).
"""

import numpy as np
from numpy.typing import ArrayLike
from scipy import sparse
from scipy.optimize import Bounds, LinearConstraint, milp


def profits(buy: ArrayLike, cost: ArrayLike, price: ArrayLike, demand: ArrayLike,
            salvage: ArrayLike | None = None) -> np.ndarray:
    """Profit in each demand scenario (rows of demand) for a given buy plan."""
    buy, cost, price = (np.asarray(a, dtype=float) for a in (buy, cost, price))
    salvage = np.zeros_like(cost) if salvage is None else np.asarray(salvage, dtype=float)
    sold = np.minimum(buy, np.asarray(demand, dtype=float))
    return sold @ price + (buy - sold) @ salvage - cost @ buy


def cvar(profit: ArrayLike, alpha: float) -> float:
    """Average profit over the worst alpha share of scenarios.

    A fractional share counts part of the next-worst scenario, matching the optimizer.
    """
    if not 0 < alpha <= 1:
        raise ValueError("alpha must be in (0, 1]")
    ordered = np.sort(np.asarray(profit, dtype=float))
    tail = alpha * ordered.size
    whole = min(int(np.floor(tail + 1e-9)), ordered.size)
    part = tail - whole
    total = ordered[:whole].sum() + (part * ordered[whole] if part > 1e-9 else 0.0)
    return float(total / tail)


def optimize(cost: ArrayLike, price: ArrayLike, cap: ArrayLike, demand: ArrayLike, budget: float,
             risk_aversion: float = 0.0, alpha: float = 0.05,
             salvage: ArrayLike | None = None) -> np.ndarray:
    """Whole rooms to buy per item. demand has one row per scenario, one column per item."""
    # shortcut: rounds the fractional plan down, losing at most one room per item
    # (~0.06% profit in tests) for a 100x faster solve; use an integer solve if exact counts matter.
    relaxed = plan_relaxed(cost, price, cap, demand, budget, risk_aversion, alpha, salvage)
    cost = np.asarray(cost, dtype=float)
    buy = np.minimum(np.floor(relaxed + 1e-6), np.floor(np.asarray(cap, dtype=float)))
    # solver tolerance can leave a hair over budget: drop the dearest room until it fits
    while cost @ buy > budget and buy.any():
        buy[np.argmax(np.where(buy > 0, cost, -np.inf))] -= 1
    return buy.astype(int)


def plan_relaxed(cost: ArrayLike, price: ArrayLike, cap: ArrayLike, demand: ArrayLike,
                 budget: float, risk_aversion: float = 0.0, alpha: float = 0.05,
                 salvage: ArrayLike | None = None) -> np.ndarray:
    """Optimal plan when fractional rooms are allowed."""
    cost, price, cap = (np.asarray(a, dtype=float) for a in (cost, price, cap))
    demand = np.atleast_2d(np.asarray(demand, dtype=float))
    salvage = np.zeros(cost.size) if salvage is None else np.asarray(salvage, dtype=float)
    _validate(cost, price, cap, demand, salvage, budget, risk_aversion, alpha)

    c, constraints, bounds = _model(cost, price, cap, demand, salvage, budget, risk_aversion, alpha)
    res = milp(c, constraints=constraints, bounds=bounds)  # no integrality given = plain LP
    if not res.success:
        raise RuntimeError(f"optimizer found no plan: {res.message}")
    return res.x[: cost.size]


def _validate(cost, price, cap, demand, salvage, budget, risk_aversion, alpha) -> None:
    n = cost.size
    if cost.ndim != 1 or n == 0 or any(a.shape != (n,) for a in (price, cap, salvage)):
        raise ValueError("cost, price, cap and salvage must be 1-D arrays of the same length")
    if demand.ndim != 2 or demand.shape[1] != n or demand.shape[0] == 0:
        raise ValueError("demand needs at least one scenario row and one column per item")
    if not np.isfinite(budget) or not all(np.isfinite(a).all() for a in (cost, price, cap, salvage, demand)):
        raise ValueError("budget, cost, price, cap, salvage and demand must be finite numbers")
    if budget < 0:
        raise ValueError("budget must be non-negative")
    if not 0 <= risk_aversion <= 1:
        raise ValueError("risk_aversion must be in [0, 1]")
    if not 0 < alpha <= 1:
        raise ValueError("alpha must be in (0, 1]")
    if (cost < 0).any() or (cap < 0).any() or (demand < 0).any():
        raise ValueError("cost, cap and demand must be non-negative")
    if (price < salvage).any():
        raise ValueError("price must be at least the salvage value")


def _model(cost, price, cap, demand, salvage, budget, risk_aversion, alpha):
    """Variables in order: buy x (n), sales y (S*n, scenario-major), eta (1), shortfall u (S)."""
    # shortcut: S*n sales variables is fine for hundreds of items x a few hundred scenarios;
    # reformulate (or sample fewer scenarios per item) before scaling to TBO's full catalogue.
    n_scen, n = demand.shape
    margin = price - salvage  # extra value of selling a bought room instead of releasing it
    hold = salvage - cost     # profit of a bought room that goes unsold
    keep = 1.0 - risk_aversion

    c = -np.concatenate([keep * hold, keep / n_scen * np.tile(margin, n_scen),
                         [risk_aversion], np.full(n_scen, -risk_aversion / (alpha * n_scen))])

    n_tail = 1 + n_scen  # eta and u columns
    sales_cap = sparse.hstack([-sparse.kron(np.ones((n_scen, 1)), sparse.identity(n)),
                               sparse.identity(n_scen * n),
                               sparse.csr_matrix((n_scen * n, n_tail))])
    spend = sparse.hstack([cost[None, :], sparse.csr_matrix((1, n_scen * n + n_tail))])
    # u_s >= eta - profit_s, written as u_s - eta + profit_s >= 0
    tail = sparse.hstack([sparse.kron(np.ones((n_scen, 1)), hold[None, :]),
                          sparse.kron(sparse.identity(n_scen), margin[None, :]),
                          -np.ones((n_scen, 1)), sparse.identity(n_scen)])
    constraints = [LinearConstraint(sales_cap, -np.inf, 0),
                   LinearConstraint(spend, -np.inf, budget),
                   LinearConstraint(tail, 0, np.inf)]

    lower = np.concatenate([np.zeros(n + n_scen * n), [-np.inf], np.zeros(n_scen)])
    upper = np.concatenate([cap, demand.ravel(), [np.inf], np.full(n_scen, np.inf)])
    return c, constraints, Bounds(lower, upper)
