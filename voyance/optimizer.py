"""Budget-constrained pre-buy optimizer.

Chooses how many rooms to buy per item to maximise

    (1 - risk_aversion) * expected profit + risk_aversion * CVaR

over demand scenarios. CVaR is the average profit in the worst `alpha` share of
scenarios, linearised the Rockafellar-Uryasev way, so the whole thing is one linear
program solved by HiGHS (bundled with scipy).
"""

import queue
import threading
from collections.abc import Sequence
from concurrent.futures import Future
from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike
from scipy import sparse
from scipy.optimize import linprog

class _SolverThread:
    """Runs every HiGHS solve, one at a time, on one long-lived daemon thread.

    HiGHS through scipy crashes the process when a thread that ran a solve exits (Windows, scipy 1.17: 2 of 2
    runs of 300 one-at-a-time short-lived solver threads segfaulted; the same threads without the solve never
    did). Web servers run requests on worker threads that come and go, so solves never run on the caller's
    thread. As a daemon this thread is never joined: the OS ends it at exit without the clean-up that crashes.
    """

    # shortcut: one thread solves everything, one plan at a time; use separate processes to solve in parallel.
    def __init__(self) -> None:
        self._jobs: queue.SimpleQueue = queue.SimpleQueue()
        self._start = threading.Lock()
        self._thread: threading.Thread | None = None

    def run(self, solve, *args, **kwargs):
        with self._start:
            if self._thread is None:
                self._thread = threading.Thread(target=self._serve, name="highs-solver", daemon=True)
                self._thread.start()
        result: Future = Future()
        self._jobs.put((result, solve, args, kwargs))
        return result.result()

    def _serve(self) -> None:
        while True:
            result, solve, args, kwargs = self._jobs.get()
            try:
                result.set_result(solve(*args, **kwargs))
            except BaseException as exc:  # handed back to the caller, who raises it
                result.set_exception(exc)


_SOLVER = _SolverThread()


@dataclass(frozen=True)
class Solution:
    """The best plan when fractional rooms are allowed, and what the solver knows about its economics.

    Values are in risk-adjusted rupees, the units of the objective: (1 - risk_aversion) x expected profit
    + risk_aversion x CVaR. They come from the linear program's dual values (shadow prices), so they are exact
    at the margin and close for one whole room or rupee.
    """

    buy: np.ndarray               # rooms per item
    objective: float              # risk-adjusted profit of this plan
    budget_value: float           # what one more rupee of budget would add; 0 when money isn't the limit
    forced_room_cost: np.ndarray  # per item bought none: what forcing one room in would cost the plan
    extra_room_value: np.ndarray  # per item at its hotel cap: what one more room of allotment would add
    # no per-group cap values: when caps add up to the budget the duals split arbitrarily between them;
    # the planner prices caps by solving once without them instead


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
             risk_aversion: float = 0.0, alpha: float = 0.05, salvage: ArrayLike | None = None,
             groups: Sequence[ArrayLike] = (), group_share: float | ArrayLike = 1.0) -> np.ndarray:
    """Whole rooms to buy per item. demand has one row per scenario, one column per item.

    groups: item indices per group (e.g. per city); each may spend at most group_share of the budget.
    """
    relaxed = solve_relaxed(cost, price, cap, demand, budget, risk_aversion, alpha, salvage, groups,
                            group_share).buy
    return whole_rooms(relaxed, cost, cap, budget)  # rounding down only lowers each group's spend


def whole_rooms(relaxed: ArrayLike, cost: ArrayLike, cap: ArrayLike, budget: float) -> np.ndarray:
    """Round a fractional plan down to whole rooms, within cap and budget."""
    # shortcut: rounds the fractional plan down, losing at most one room per item
    # (~0.06% profit in tests) for a 100x faster solve; use an integer solve if exact counts matter.
    cost = np.asarray(cost, dtype=float)
    buy = np.minimum(np.floor(np.asarray(relaxed, dtype=float) + 1e-6), np.floor(np.asarray(cap, dtype=float)))
    # solver tolerance can leave a hair over budget: drop the dearest room until it fits
    while cost @ buy > budget and buy.any():
        buy[np.argmax(np.where(buy > 0, cost, -np.inf))] -= 1
    return buy.astype(int)


def plan_relaxed(cost: ArrayLike, price: ArrayLike, cap: ArrayLike, demand: ArrayLike,
                 budget: float, risk_aversion: float = 0.0, alpha: float = 0.05,
                 salvage: ArrayLike | None = None) -> np.ndarray:
    """Optimal plan when fractional rooms are allowed."""
    return solve_relaxed(cost, price, cap, demand, budget, risk_aversion, alpha, salvage).buy


def solve_relaxed(cost: ArrayLike, price: ArrayLike, cap: ArrayLike, demand: ArrayLike,
                  budget: float, risk_aversion: float = 0.0, alpha: float = 0.05,
                  salvage: ArrayLike | None = None, groups: Sequence[ArrayLike] = (),
                  group_share: float | ArrayLike = 1.0) -> Solution:
    """Optimal fractional plan with its shadow prices: what money, a forced room or more allotment is worth."""
    cost, price, cap = (np.asarray(a, dtype=float) for a in (cost, price, cap))
    demand = np.atleast_2d(np.asarray(demand, dtype=float))
    salvage = np.zeros(cost.size) if salvage is None else np.asarray(salvage, dtype=float)
    _validate(cost, price, cap, demand, salvage, budget, risk_aversion, alpha)
    groups = [np.asarray(g, dtype=int) for g in groups]
    shares = np.asarray(group_share, dtype=float)
    shares = np.full(len(groups), float(shares)) if shares.ndim == 0 else shares
    if (shares.shape != (len(groups),) or not np.isfinite(shares).all() or ((shares <= 0) | (shares > 1)).any()
            or any(((g < 0) | (g >= cost.size)).any() or np.unique(g).size != g.size for g in groups)):
        raise ValueError("each group needs distinct item indices and a share of the budget in (0, 1]")

    c, a_ub, b_ub, lower, upper = _model(cost, price, cap, demand, salvage, budget, risk_aversion, alpha)
    if groups:  # appended last, so the rows before keep their places
        rows = np.repeat(np.arange(len(groups)), [g.size for g in groups])
        cols = np.concatenate(groups)
        caps = sparse.csr_matrix((cost[cols], (rows, cols)), shape=(len(groups), a_ub.shape[1]))
        a_ub, b_ub = sparse.vstack([a_ub, caps]).tocsr(), np.concatenate([b_ub, shares * budget])
    res = _SOLVER.run(linprog, c, A_ub=a_ub, b_ub=b_ub, bounds=np.column_stack([lower, upper]), method="highs")
    if res.status != 0:
        raise RuntimeError(f"optimizer found no plan: {res.message}")
    n, budget_row = cost.size, demand.size  # rows: one sales cap per scenario and item, then the budget
    # HiGHS reports how the minimised objective moves; the plan maximises its negative, hence the signs
    return Solution(buy=res.x[:n], objective=float(-res.fun),
                    budget_value=max(0.0, float(-res.ineqlin.marginals[budget_row])),
                    forced_room_cost=np.maximum(res.lower.marginals[:n], 0.0),
                    extra_room_value=np.maximum(-res.upper.marginals[:n], 0.0))


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
    """Minimise c @ v subject to a_ub @ v <= b_ub and lower <= v <= upper.

    Variables in order: buy x (n), sales y (S*n, scenario-major), eta (1), shortfall u (S).
    Rows in order: sales caps y <= x (S*n), the budget (1), the CVaR tail (S).
    """
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
    # a sparse first input keeps kron returning a sparse matrix on SciPy >= 1.20 too
    tail = sparse.hstack([sparse.kron(sparse.coo_matrix(np.ones((n_scen, 1))), hold[None, :]),
                          sparse.kron(sparse.identity(n_scen), margin[None, :]),
                          -np.ones((n_scen, 1)), sparse.identity(n_scen)])
    a_ub = sparse.vstack([sales_cap, spend, -tail]).tocsr()
    b_ub = np.concatenate([np.zeros(n_scen * n), [budget], np.zeros(n_scen)])

    lower = np.concatenate([np.zeros(n + n_scen * n), [-np.inf], np.zeros(n_scen)])
    upper = np.concatenate([cap, demand.ravel(), [np.inf], np.full(n_scen, np.inf)])
    return c, a_ub, b_ub, lower, upper
