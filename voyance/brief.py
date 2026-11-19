"""Plain-English buyer briefs: the plan's facts for a language model, and a check that it invented no numbers.

The model only explains: every figure it may use is in facts(plan), and unknown_numbers() rejects a brief that
cites anything else. scripts/brief.py runs a small open model locally on the GPU.
"""

import re
from datetime import date

TOP_LINES = 5
TOP_PASSED = 3
SMALL_COUNT = 10  # "top 3", "2 hotels": small whole numbers in prose need no source
NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")
MONEY = re.compile(r"₹\s?(\d[\d,]*(?:\.\d+)?)\s?(crores?|cr|lakhs?|L|millions?|mn|M|billions?|bn|thousand|k)?\b",
                   re.IGNORECASE)
UNITS = {"crore": "cr", "crores": "cr", "lakh": "l", "lakhs": "l"}  # the same unit, written either way


def inr(amount: float) -> str:
    """Rupees the way an Indian buyer reads them: crore, lakh, or plain."""
    if abs(amount) >= 1e7:
        return f"₹{amount / 1e7:.2f} cr"
    if abs(amount) >= 1e5:
        return f"₹{amount / 1e5:.1f}L"
    return f"₹{amount:,.0f}"


def facts(plan: dict) -> str:
    """The figures a brief may use, one per line, from a saved plan (GET /v1/plans/{id})."""
    lines = sorted(plan["lines"], key=lambda line: -line["expected_profit"])[:TOP_LINES]
    out = [f"Plan {plan['id']}: budget {inr(plan['budget_inr'])}, risk setting {plan['risk_aversion']}",
           f"Spend {inr(plan['spend'])}; expected profit {inr(plan['expected_profit'])}; profit in a bad season "
           f"(worst 5%) {inr(plan['worst_case_profit'])}; {len(plan['lines'])} lines"]
    if plan.get("hurdle_rate", 0) > 0:
        out.append(f"Every rupee must earn {plan['hurdle_rate'] * 100:.0f} paise to get into the plan")
    out.append("Best lines:")
    for line in lines:
        buy_by = date.fromisoformat(line["buy_by"])
        out.append(f"- {line['city']} {line['week']} {line['hotel']}: {line['rooms']} rooms, expected profit "
                   f"{inr(line['expected_profit'])}, buy by {buy_by:%d %b %Y}; why: {line['reason']}")
    if plan.get("passed"):
        out.append("Closest skips:")
        out += [f"- {p['city']} {p['week']} {p['hotel']}: {p['reason']}" for p in plan["passed"][:TOP_PASSED]]
    return "\n".join(out)


def unknown_numbers(brief: str, fact_text: str) -> list[str]:
    """Figures in the brief that aren't in the facts, in order of appearance.

    A rupee amount must match a fact's value and unit (lakh or crore; million, billion and "M" are never
    right here); any other number must appear in the facts, small counts aside.
    """
    known_money = {_money(m) for m in MONEY.finditer(fact_text)}
    known = {n.replace(",", "") for n in NUMBER.findall(MONEY.sub(" ", fact_text))}
    out = [m.group(0).strip() for m in MONEY.finditer(brief) if _money(m) not in known_money]
    for n in NUMBER.findall(MONEY.sub(" ", brief)):
        plain = n.replace(",", "")
        if plain not in known and not (plain.isdigit() and int(plain) <= SMALL_COUNT):
            out.append(plain)
    return out


def _money(match: re.Match) -> tuple[str, str]:
    unit = (match.group(2) or "").lower()
    return match.group(1).replace(",", ""), UNITS.get(unit, unit)
