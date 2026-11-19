from voyance.brief import facts, inr, unknown_numbers

PLAN = {
    "id": 1, "budget_inr": 2e7, "risk_aversion": 0.3, "spend": 12_160_458, "expected_profit": 2_473_960,
    "worst_case_profit": 2_003_528, "hurdle_rate": 0.0,
    "lines": [{"city": "Udaipur", "week": "15-21 Dec", "hotel": "Hotel A", "rooms": 82, "expected_profit": 166_000,
               "buy_by": "2027-08-26", "reason": "expected demand 118 room-nights vs 55 booked last December"},
              {"city": "Goa", "week": "1-7 Dec", "hotel": "Hotel B", "rooms": 50, "expected_profit": 121_000,
               "buy_by": "2027-08-30", "reason": "26% margin"}],
    "passed": [],
}


def test_money_reads_the_indian_way():
    assert (inr(12_160_458), inr(2_473_960), inr(85_149)) == ("₹1.22 cr", "₹24.7L", "₹85,149")


def test_facts_carry_the_totals_and_the_best_lines_with_their_reasons():
    text = facts(PLAN)
    for expected in ("₹2.00 cr", "₹1.22 cr", "₹24.7L", "₹20.0L", "Udaipur 15-21 Dec Hotel A", "82 rooms",
                     "buy by 26 Aug 2027", "118 room-nights"):
        assert expected in text


def test_a_brief_may_only_use_numbers_from_the_facts():
    text = facts(PLAN)
    assert unknown_numbers("Buy 82 rooms at Udaipur by 26 Aug 2027 for ₹24.7L expected.", text) == []
    assert unknown_numbers("Expect ₹31.5L and 140 rooms.", text) == ["₹31.5L", "140"]
    assert unknown_numbers("Top 3 lines; the 2 best hotels.", text) == []  # small counts are fine in prose


def test_a_rupee_figure_must_keep_its_unit():
    # the local model once wrote "₹24.7 million" for ₹24.7L (ten times too much) and "₹1.7M" for ₹1.7L
    text = facts(PLAN)
    assert unknown_numbers("Expected profit ₹24.7L on ₹1.22 crore of spend.", text) == []
    assert unknown_numbers("Expected profit ₹24.7 million.", text) == ["₹24.7 million"]
    assert unknown_numbers("Udaipur earns ₹1.7M.", text) == ["₹1.7M"]
    assert unknown_numbers("Expected profit ₹24.7 cr.", text) == ["₹24.7 cr"]
