"""Round 1 proof chart: expected profit vs maximum budget, on simulated seasons.

Run from the project root:  python scripts/proof_chart.py
Writes out/proof_chart.png (for the slide) and out/proof_results.csv (same numbers as a table).
"""

import csv
import logging
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from prebuy.sim import run  # noqa: E402

BUDGETS_LAKH = (40, 60, 80, 100, 120, 160, 200, 240)
HEADLINE_BUDGETS_LAKH = (60, 120, 200)
OURS, BASELINE = "Optimizer + hidden demand + events", "Repeat past bookings"
SEEDS = range(20)
OUT = ROOT / "out"

# Plotted strategies (the CSV also has the "hidden demand only" comparison run).
# Reference palette slots 1-4 in fixed order; validated with the dataviz validator on white.
# Aqua and yellow are under 3:1 contrast, so every line gets a direct label and a CSV twin.
SERIES = {
    "Optimizer + hidden demand + events": ("Our planner", "#2a78d6"),
    "Repeat past bookings": ("Repeat past bookings", "#eb6834"),
    "Optimizer, bookings only": ("Optimizer on raw bookings", "#1baf7a"),
    "Even split": ("Even split of the budget", "#eda100"),
}
INK, INK_2, MUTED, GRID, AXIS, SURFACE = "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#c3c2b7", "#ffffff"
METRICS = ("mean_profit", "worst_5pct_profit", "spend", "unsold_rooms", "missed_rooms")


def sweep() -> list[dict]:
    """Average each strategy's results over the seeds, at every budget."""
    rows = []
    for budget in BUDGETS_LAKH:
        per_seed = [run(seed=s, budget=budget * 1e5) for s in SEEDS]
        for name in per_seed[0]:
            avg = {m: float(np.mean([r[name][m] for r in per_seed])) for m in METRICS}
            rows.append({"budget_lakh": budget, "strategy": name, **avg})
    return rows


def write_csv(rows: list[dict], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def plot(rows: list[dict], path: Path) -> None:
    plt.rcParams.update({"font.family": ["Segoe UI", "DejaVu Sans"], "font.size": 11})
    fig, ax = plt.subplots(figsize=(10, 5.6), dpi=200, facecolor=SURFACE)
    ax.set_facecolor(SURFACE)
    profit = {n: [r["mean_profit"] / 1e5 for r in rows if r["strategy"] == n] for n in SERIES}

    for name, (_, color) in SERIES.items():
        ax.plot(BUDGETS_LAKH, profit[name], color=color, lw=2, solid_joinstyle="round",
                solid_capstyle="round", marker="o", ms=6, mec=SURFACE, mew=1.5, zorder=3)
    _end_labels(ax, profit)

    ax.axhline(0, color=AXIS, lw=1, zorder=1)
    ax.grid(axis="y", color=GRID, lw=0.8)
    ax.set_axisbelow(True)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(AXIS)
    ax.tick_params(colors=MUTED, length=0, pad=6)
    ax.set_xticks(BUDGETS_LAKH, [_budget_label(b) for b in BUDGETS_LAKH])
    ax.set_xlabel("Maximum budget TBO gives the planner", color=INK_2, labelpad=8)
    ax.set_ylabel("Expected profit (₹ lakh)", color=INK_2, labelpad=8)
    ax.set_xlim(BUDGETS_LAKH[0] - 8, BUDGETS_LAKH[-1] + 105)

    title, detail = _headline(rows)
    fig.text(0.06, 0.95, title, fontsize=16, fontweight="semibold", color=INK)
    fig.text(0.06, 0.905, detail, fontsize=11, color=INK)
    fig.text(0.06, 0.865, "Simulated data, not TBO results · 20 December seasons, 40 hotel-weeks in 5 Indian cities",
             fontsize=9.5, color=INK_2)
    fig.text(0.06, 0.835, "Every method sees the same 3 past seasons · the planner knows event dates, not their size",
             fontsize=9.5, color=INK_2)
    fig.subplots_adjust(left=0.08, right=0.98, top=0.79, bottom=0.12)
    fig.savefig(path, facecolor=SURFACE)
    plt.close(fig)


def _end_labels(ax, profit: dict) -> None:
    """Label every line at its right end; spread labels that would collide, with a leader line."""
    x_end = BUDGETS_LAKH[-1]
    lo, hi = min(min(v) for v in profit.values()), max(max(v) for v in profit.values())
    min_gap = 0.06 * (hi - lo)
    placed = []
    for name in sorted(profit, key=lambda n: -profit[n][-1]):
        y = profit[name][-1]
        y_label = min(y, placed[-1] - min_gap) if placed else y
        placed.append(y_label)
        if abs(y_label - y) > 1e-9:
            ax.plot([x_end + 3, x_end + 9], [y, y_label], color=MUTED, lw=0.8)
        ax.text(x_end + 11, y_label, f"{SERIES[name][0]}  {_lakh(y)}", va="center", color=INK, fontsize=10)


def _lakh(value: float) -> str:
    return f"{'−' if value < 0 else ''}₹{abs(value):.1f}L"


def _budget_label(lakh: int) -> str:
    return f"₹{lakh}L" if lakh < 100 else f"₹{lakh / 100:g} cr"


def _headline(rows: list[dict]) -> tuple[str, str]:
    """Plain title; the detail line states the gain at a tight, middle and generous budget."""
    by_budget: dict[int, dict[str, float]] = {}
    for r in rows:
        by_budget.setdefault(int(r["budget_lakh"]), {})[r["strategy"]] = float(r["mean_profit"])

    def gain(lakh: int) -> str:
        pct = 100 * (by_budget[lakh][OURS] / by_budget[lakh][BASELINE] - 1)
        return "about even" if abs(pct) < 1 else f"{pct:+.0f}%"

    parts = [f"{gain(b)} at {_budget_label(b)}" for b in HEADLINE_BUDGETS_LAKH]
    return ("Expected profit by budget: our planner vs simple rules",
            f"Our planner vs re-buying past bookings: {', '.join(parts)}")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    OUT.mkdir(exist_ok=True)
    rows = sweep()
    write_csv(rows, OUT / "proof_results.csv")
    plot(rows, OUT / "proof_chart.png")
    logging.info("wrote %s and %s", OUT / "proof_chart.png", OUT / "proof_results.csv")


if __name__ == "__main__":
    main()
