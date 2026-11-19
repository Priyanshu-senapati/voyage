import csv
import io
import threading
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, text

from voyance.api import service
from voyance.api.app import create_app
from voyance.api.auth import Principal, create_api_key, revoke_api_key
from voyance.api.db import Tenant, User, make_sessions


@pytest.fixture
def api():
    app = create_app("sqlite://")
    with app.state.sessions() as session:
        keys = {
            "buyer": create_api_key(session, "TBO Demo", "buyer", "asha"),
            "approver": create_api_key(session, "TBO Demo", "approver", "ravi"),
            "admin": create_api_key(session, "TBO Demo", "admin", "meera"),
            "other": create_api_key(session, "Other Distributor", "admin", "zed"),
        }
    return TestClient(app), keys


def auth(key: str) -> dict:
    return {"X-API-Key": key}


def new_plan(client, key, **overrides):
    body = {"budget_inr": 3_000_000, "risk_aversion": 0.3} | overrides
    return client.post("/v1/plans", json=body, headers=auth(key))


def decide(client, key, plan, line_id, decision):
    return client.patch(f"/v1/plans/{plan['id']}/lines/{line_id}", json={"decision": decision},
                        headers=auth(key))


def test_requests_without_a_valid_key_are_refused(api):
    client, _ = api
    assert client.get("/v1/plans").status_code == 401
    assert client.get("/v1/plans", headers=auth("not-a-real-key")).status_code == 401


def test_markets_lists_every_hotel_week(api):
    client, keys = api
    items = client.get("/v1/markets", headers=auth(keys["buyer"])).json()
    assert len(items) == 40
    assert {"city", "week", "hotel", "unit_cost", "soldout_searches_total", "event_this_season"} <= items[0].keys()


def test_buyer_creates_a_pending_plan_within_budget(api):
    client, keys = api
    response = new_plan(client, keys["buyer"])
    assert response.status_code == 201
    plan = response.json()
    assert plan["spend"] <= 3_000_000
    assert plan["lines"] and all(line["decision"] == "pending" for line in plan["lines"])
    assert plan["status"] == "pending" and plan["created_by"] == "asha"


@pytest.mark.parametrize("body", [
    {"budget_inr": 0}, {"budget_inr": -5}, {"budget_inr": 2e10},
    {"risk_aversion": 1.5}, {"risk_aversion": -0.1}, {"cities": []},
])
def test_malformed_plan_requests_are_rejected(api, body):
    client, keys = api
    assert new_plan(client, keys["buyer"], **body).status_code == 422


def test_unknown_city_is_a_bad_request_with_a_readable_message(api):
    client, keys = api
    response = new_plan(client, keys["buyer"], cities=["Atlantis"])
    assert response.status_code == 400 and "Atlantis" in response.json()["detail"]


def test_another_company_cannot_see_the_plan(api):
    client, keys = api
    plan = new_plan(client, keys["buyer"]).json()
    assert client.get(f"/v1/plans/{plan['id']}", headers=auth(keys["other"])).status_code == 404
    assert client.get("/v1/plans", headers=auth(keys["other"])).json() == []
    assert decide(client, keys["other"], plan, plan["lines"][0]["id"], "approved").status_code == 404


def test_buyer_cannot_approve(api):
    client, keys = api
    plan = new_plan(client, keys["buyer"]).json()
    assert decide(client, keys["buyer"], plan, plan["lines"][0]["id"], "approved").status_code == 403


def test_nobody_approves_their_own_plan(api):
    client, keys = api
    plan = new_plan(client, keys["approver"]).json()
    assert decide(client, keys["approver"], plan, plan["lines"][0]["id"], "approved").status_code == 403


def test_approval_is_saved_and_logged(api):
    client, keys = api
    plan = new_plan(client, keys["buyer"]).json()
    line_id = plan["lines"][0]["id"]
    response = decide(client, keys["approver"], plan, line_id, "approved")
    assert response.status_code == 200
    assert response.json()["decision"] == "approved" and response.json()["decided_by"] == "ravi"

    events = client.get("/v1/audit", headers=auth(keys["admin"])).json()
    assert {e["action"] for e in events} >= {"plan.created", "line.approved"}


def test_a_decided_line_cannot_be_changed(api):
    client, keys = api
    plan = new_plan(client, keys["buyer"]).json()
    line_id = plan["lines"][0]["id"]
    decide(client, keys["approver"], plan, line_id, "approved")
    assert decide(client, keys["approver"], plan, line_id, "rejected").status_code == 409


def test_line_from_another_plan_is_not_found(api):
    client, keys = api
    first = new_plan(client, keys["buyer"]).json()
    second = new_plan(client, keys["buyer"]).json()
    assert decide(client, keys["approver"], first, second["lines"][0]["id"], "approved").status_code == 404


def test_plan_is_approved_once_every_line_is(api):
    client, keys = api
    plan = new_plan(client, keys["buyer"], budget_inr=500_000).json()
    for line in plan["lines"]:
        decide(client, keys["approver"], plan, line["id"], "approved")
    assert client.get(f"/v1/plans/{plan['id']}", headers=auth(keys["buyer"])).json()["status"] == "approved"


def test_csv_export_has_a_row_per_line(api):
    client, keys = api
    plan = new_plan(client, keys["buyer"]).json()
    response = client.get(f"/v1/plans/{plan['id']}/export.csv", headers=auth(keys["buyer"]))
    assert response.status_code == 200 and response.headers["content-type"].startswith("text/csv")
    rows = list(csv.reader(io.StringIO(response.text)))
    assert len(rows) == len(plan["lines"]) + 1


def _principal(client, name: str) -> Principal:
    with client.app.state.sessions() as session:
        user = session.query(User).filter_by(name=name).one()
        return Principal(tenant_id=user.tenant_id, role=user.role, label=user.name, user_id=user.id)


def test_a_second_key_for_the_same_person_cannot_approve_their_plan(api):
    client, keys = api
    with client.app.state.sessions() as session:
        second_key = create_api_key(session, "TBO Demo", "approver", " Ravi ")  # same person, new key
    plan = new_plan(client, keys["approver"]).json()
    assert decide(client, second_key, plan, plan["lines"][0]["id"], "approved").status_code == 403


def test_revoked_key_is_refused(api):
    client, keys = api
    with client.app.state.sessions() as session:
        assert revoke_api_key(session, keys["buyer"])
    assert client.get("/v1/plans", headers=auth(keys["buyer"])).status_code == 401


def test_plan_creation_is_rate_limited_per_person(api, monkeypatch):
    client, keys = api
    monkeypatch.setattr(service, "PLAN_RATE", service.RateLimiter(limit=2, window_s=60))
    statuses = [new_plan(client, keys["buyer"], budget_inr=200_000).status_code for _ in range(3)]
    assert statuses == [201, 201, 429]
    assert new_plan(client, keys["approver"], budget_inr=200_000).status_code == 201  # others unaffected


def test_huge_ids_are_rejected_cleanly(api):
    client, keys = api
    assert client.get("/v1/plans/" + "9" * 30, headers=auth(keys["buyer"])).status_code == 422


def test_two_approvers_deciding_at_once_cannot_both_win(api):
    client, keys = api
    plan = new_plan(client, keys["buyer"]).json()
    line_id = plan["lines"][0]["id"]
    ravi, meera = _principal(client, "ravi"), _principal(client, "meera")
    sessions = client.app.state.sessions
    with sessions() as first, sessions() as second:
        assert service.get_plan(first, ravi, plan["id"]).lines[0].decision == "pending"
        service.decide_line(second, meera, plan["id"], line_id, "rejected")
        with pytest.raises(service.Conflict):
            service.decide_line(first, ravi, plan["id"], line_id, "approved")


def test_listing_plans_does_not_query_once_per_plan(api):
    client, keys = api
    for _ in range(4):
        new_plan(client, keys["buyer"], budget_inr=300_000)
    engine = client.app.state.sessions.kw["bind"]
    statements = []

    def record(*args):
        statements.append(args[2])

    event.listen(engine, "before_cursor_execute", record)
    try:
        assert len(client.get("/v1/plans", headers=auth(keys["buyer"])).json()) == 4
    finally:
        event.remove(engine, "before_cursor_execute", record)
    assert len(statements) <= 3  # key lookup, plans, and all their lines at once


def test_timestamps_are_utc_and_the_same_on_create_and_read(api):
    client, keys = api
    created = new_plan(client, keys["buyer"]).json()
    fetched = client.get(f"/v1/plans/{created['id']}", headers=auth(keys["buyer"])).json()
    assert fetched["created_at"] == created["created_at"]
    assert fetched["created_at"].endswith(("Z", "+00:00"))


def test_busy_planner_asks_the_caller_to_retry(api, monkeypatch):
    client, keys = api
    slots = threading.BoundedSemaphore(1)
    monkeypatch.setattr(service, "PLANNER_SLOTS", slots)
    monkeypatch.setattr(service, "PLANNER_WAIT_S", 0.01)
    slots.acquire()
    try:
        response = new_plan(client, keys["buyer"])
    finally:
        slots.release()
    assert response.status_code == 503 and response.headers["retry-after"]


def test_file_database_uses_wal_and_foreign_keys(tmp_path):
    sessions = make_sessions(f"sqlite:///{tmp_path / 'voyance.db'}")
    with sessions() as session:
        assert session.execute(text("PRAGMA foreign_keys")).scalar() == 1
        assert session.execute(text("PRAGMA journal_mode")).scalar() == "wal"


def test_api_contract_gives_the_dashboard_fixed_value_lists(api):
    client, _ = api
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    assert schemas["PlanLineOut"]["properties"]["decision"]["enum"] == ["pending", "approved", "rejected"]
    assert set(schemas["PlanSummary"]["properties"]["status"]["enum"]) == {
        "empty", "pending", "approved", "rejected", "mixed"}
    assert schemas["MeOut"]["properties"]["role"]["enum"] == ["buyer", "approver", "admin"]
    assert "sell_through" in schemas["PreviewLine"]["required"]  # a computed field the dashboard reads
    assert schemas["PreviewLine"]["properties"]["limited_by"]["enum"] == ["hotel", "cap", "budget", "demand"]
    assert schemas["QueueItem"]["properties"]["action"]["enum"] == ["buy_now", "scheduled", "watch", "skip"]


def test_me_says_who_is_calling(api):
    client, keys = api
    assert client.get("/v1/me", headers=auth(keys["approver"])).json() == {
        "name": "ravi", "role": "approver", "tenant": "TBO Demo"}


def preview(client, key, **overrides):
    body = {"budget_inr": 3_000_000, "risk_aversion": 0.3} | overrides
    return client.post("/v1/plans/preview", json=body, headers=auth(key))


def test_preview_matches_the_plan_but_saves_and_logs_nothing(api):
    client, keys = api
    response = preview(client, keys["buyer"])
    assert response.status_code == 200
    shown = response.json()
    assert client.get("/v1/plans", headers=auth(keys["buyer"])).json() == []
    assert client.get("/v1/audit", headers=auth(keys["admin"])).json() == []

    saved = new_plan(client, keys["buyer"]).json()
    assert shown["expected_profit"] == pytest.approx(saved["expected_profit"])
    assert [(line["hotel"], line["rooms"], line["why"]) for line in shown["lines"]] == \
        [(line["hotel"], line["rooms"], line["why"]) for line in saved["lines"]]


def test_preview_has_its_own_rate_limit(api, monkeypatch):
    client, keys = api
    monkeypatch.setattr(service, "PREVIEW_RATE", service.RateLimiter(limit=1, window_s=60))
    monkeypatch.setattr(service, "PLAN_RATE", service.RateLimiter(limit=1, window_s=60))
    assert [preview(client, keys["buyer"]).status_code for _ in range(2)] == [200, 429]
    assert new_plan(client, keys["buyer"]).status_code == 201  # dragging a slider never blocks saving


def test_preview_runs_a_what_if_through_the_real_planner_and_echoes_it(api):
    client, keys = api
    base = preview(client, keys["buyer"]).json()
    shocked = preview(client, keys["buyer"], demand_change=0.3, cost_change=-0.05, event_lift=2.0).json()
    assert (shocked["demand_change"], shocked["cost_change"], shocked["event_lift"]) == (0.3, -0.05, 2.0)
    assert (base["demand_change"], base["cost_change"], base["event_lift"]) == (0.0, 0.0, None)
    assert shocked["expected_profit"] > base["expected_profit"]


@pytest.mark.parametrize("what_if", [{"demand_change": -0.9}, {"demand_change": 5}, {"cost_change": 0.9},
                                     {"event_lift": 0.5}, {"event_lift": 9}])
def test_what_ifs_stay_in_a_sensible_range(api, what_if):
    client, keys = api
    assert preview(client, keys["buyer"], **what_if).status_code == 422


def test_a_saved_plan_refuses_what_ifs_instead_of_ignoring_them(api):
    client, keys = api
    assert new_plan(client, keys["buyer"], demand_change=0.3).status_code == 422


def test_frontier_takes_the_same_what_ifs(api):
    client, keys = api
    base = frontier(client, keys["buyer"], "budget_inr=1000000&cities=Goa&cities=Kochi").json()
    shocked = frontier(client, keys["buyer"], "budget_inr=1000000&cities=Goa&cities=Kochi&demand_change=0.4").json()
    assert shocked[0]["expected_profit"] > base[0]["expected_profit"]


def test_frontier_refuses_a_misspelt_what_if(api):
    client, keys = api
    assert frontier(client, keys["buyer"], "budget_inr=1000000&demand_chnage=0.4").status_code == 422


def test_plans_carry_their_hurdle_what_limits_each_line_and_what_they_passed(api):
    client, keys = api
    shown = preview(client, keys["buyer"]).json()
    assert shown["hurdle_rate"] > 0 and shown["passed"]
    assert {line["limited_by"] for line in shown["lines"]} <= {"hotel", "budget", "demand"}
    assert {"earns_here", "earns_elsewhere", "forced_room_cost", "reason"} <= shown["passed"][0].keys()
    saved = new_plan(client, keys["buyer"]).json()
    fetched = client.get(f"/v1/plans/{saved['id']}", headers=auth(keys["buyer"])).json()
    assert fetched["passed"] == saved["passed"] == shown["passed"]
    assert fetched["hurdle_rate"] == pytest.approx(shown["hurdle_rate"])
    assert client.get("/v1/plans", headers=auth(keys["buyer"])).json()[0]["hurdle_rate"] == fetched["hurdle_rate"]


def test_caps_shape_the_plan_say_what_they_cost_and_are_saved_with_it(api):
    client, keys = api
    free = preview(client, keys["buyer"], budget_inr=4_000_000).json()
    assert free["caps_cost"] == 0 and free["max_city_share"] is None
    assert {e["kind"] for e in free["exposure"]} == {"city", "hotel"}
    capped = preview(client, keys["buyer"], budget_inr=4_000_000, max_city_share=0.25).json()
    assert capped["max_city_share"] == 0.25 and capped["caps_cost"] > 0
    assert all(e["share_of_budget"] <= 0.25 + 1e-9 for e in capped["exposure"] if e["kind"] == "city")
    saved = new_plan(client, keys["buyer"], budget_inr=4_000_000, max_city_share=0.25, max_hotel_share=0.2).json()
    fetched = client.get(f"/v1/plans/{saved['id']}", headers=auth(keys["buyer"])).json()
    assert (fetched["max_city_share"], fetched["max_hotel_share"]) == (0.25, 0.2)
    assert fetched["exposure"] == saved["exposure"] and fetched["caps_cost"] == pytest.approx(saved["caps_cost"])
    assert frontier(client, keys["buyer"], "budget_inr=4000000&cities=Goa&max_city_share=0.5").status_code == 200


@pytest.mark.parametrize("caps", [{"max_city_share": 0}, {"max_city_share": 1.5}, {"max_hotel_share": -0.1}])
def test_caps_are_shares_of_the_budget(api, caps):
    client, keys = api
    assert new_plan(client, keys["buyer"], **caps).status_code == 422


def test_position_reads_each_saved_line_against_its_bookings(api):
    client, keys = api
    plan = new_plan(client, keys["buyer"]).json()
    decide(client, keys["approver"], plan, plan["lines"][-1]["id"], "rejected")
    body = client.get(f"/v1/plans/{plan['id']}/position?as_of=2027-10-01", headers=auth(keys["buyer"])).json()
    assert body["as_of"] == "2027-10-01" and len(body["lines"]) == len(plan["lines"]) - 1
    assert {line["status"] for line in body["lines"]} <= {"short", "on_pace", "over", "started"}
    assert sum(body["summary"].values()) == len(body["lines"])
    assert client.get(f"/v1/plans/{plan['id']}/position", headers=auth(keys["other"])).status_code == 404


def test_replay_serves_the_real_bookings_week_by_week(api):
    client, keys = api
    assert client.get("/v1/replay").status_code == 401
    body = client.get("/v1/replay", headers=auth(keys["buyer"])).json()
    assert body["assumptions"]["lead_days"] == 120 and body["weeks"]
    for name in ("voyance", "rebuy_last_year"):
        assert body["weeks"][-1]["running_profit"][name] == pytest.approx(body["totals"][name]["profit"])
    assert body["totals"]["voyance"]["profit"] > body["totals"]["rebuy_last_year"]["profit"]
    assert "2 hotels" in body["source"]


def queue(client, key, plan_id, as_of=None):
    return client.get(f"/v1/plans/{plan_id}/queue" + (f"?as_of={as_of}" if as_of else ""), headers=auth(key))


def test_queue_says_what_to_buy_now_what_can_wait_and_what_to_watch_or_skip(api):
    client, keys = api
    plan = new_plan(client, keys["buyer"]).json()
    as_of = date(2027, 8, 10)
    rejected = plan["lines"][-1]
    decide(client, keys["approver"], plan, rejected["id"], "rejected")
    body = queue(client, keys["buyer"], plan["id"], as_of.isoformat()).json()
    assert body["as_of"] == as_of.isoformat() and body["hurdle_rate"] == pytest.approx(plan["hurdle_rate"])
    items = body["items"]
    order = {"buy_now": 0, "scheduled": 1, "watch": 2, "skip": 3}
    assert [order[item["action"]] for item in items] == sorted(order[item["action"]] for item in items)

    buys = [item for item in items if item["action"] in ("buy_now", "scheduled")]
    assert sorted(item["line_id"] for item in buys) == sorted(line["id"] for line in plan["lines"][:-1])
    for item in buys:
        urgent = date.fromisoformat(item["buy_by"]) <= as_of + timedelta(days=14)
        assert (item["action"] == "buy_now") == urgent and item["reason"].startswith(f"buy {item['rooms']} rooms")
    assert {item["action"] for item in buys} == {"buy_now", "scheduled"}  # this date splits the plan

    for passed in plan["passed"]:
        (item,) = [i for i in items if i["line_id"] is None and (i["city"], i["week"], i["hotel"]) ==
                   (passed["city"], passed["week"], passed["hotel"])]
        close = passed["forced_room_cost"] <= 0.05 * passed["unit_price"]
        assert item["action"] == ("watch" if close else "skip") and passed["reason"] in item["reason"]


def test_queue_never_says_buy_for_a_week_that_has_already_started(api):
    client, keys = api
    plan = new_plan(client, keys["buyer"]).json()
    items = queue(client, keys["buyer"], plan["id"], "2028-01-15").json()["items"]
    lines = [item for item in items if item["line_id"] is not None]
    assert lines and all(item["action"] == "skip" and item["reason"].startswith("too late") for item in lines)


def test_queue_reasons_count_rooms_properly():
    assert service._when(1, date(2027, 8, 30), 20) == "buy 1 room by 30 Aug 2027"
    assert service._when(2, date(2027, 8, 30), 0) == "buy 2 rooms today (30 Aug 2027)"


def test_queue_defaults_to_today_and_stays_inside_the_company(api):
    client, keys = api
    plan = new_plan(client, keys["buyer"]).json()
    # UTC like every other date the API keeps (in India it is the previous day until 05:30)
    assert queue(client, keys["buyer"], plan["id"]).json()["as_of"] == datetime.now(UTC).date().isoformat()
    assert queue(client, keys["other"], plan["id"]).status_code == 404


def test_preview_rejects_an_unknown_city(api):
    client, keys = api
    assert preview(client, keys["buyer"], cities=["Atlantis"]).status_code == 400


def test_saved_lines_keep_their_why(api):
    client, keys = api
    created = new_plan(client, keys["buyer"]).json()
    fetched = client.get(f"/v1/plans/{created['id']}", headers=auth(keys["buyer"])).json()
    assert fetched["lines"][0]["why"] == created["lines"][0]["why"]
    assert {"expected_demand", "booked_last_december", "bookings_past_decembers", "soldout_searches_past",
            "event_week", "margin"} == created["lines"][0]["why"].keys()


def test_lines_carry_a_buy_by_date_and_their_own_worst_case(api):
    client, keys = api
    created = new_plan(client, keys["buyer"]).json()
    line = created["lines"][0]
    assert line["buy_by"].startswith("2027-") and line["worst_case_profit"] <= line["expected_profit"]
    fetched = client.get(f"/v1/plans/{created['id']}", headers=auth(keys["buyer"])).json()["lines"][0]
    assert (fetched["buy_by"], fetched["worst_case_profit"]) == (line["buy_by"], line["worst_case_profit"])
    header = client.get(f"/v1/plans/{created['id']}/export.csv", headers=auth(keys["buyer"])).text.splitlines()[0]
    assert {"buy_by", "worst_case_profit"} <= set(header.split(","))


def frontier(client, key, query: str):
    return client.get(f"/v1/frontier?{query}", headers=auth(key))


def test_frontier_gives_profit_and_worst_case_at_each_risk_step(api):
    client, keys = api
    points = frontier(client, keys["buyer"], "budget_inr=1000000&cities=Goa&cities=Kochi").json()
    assert [p["risk_aversion"] for p in points] == pytest.approx([i / 10 for i in range(11)])
    assert all(p["spend"] <= 1_000_000 and p["worst_case_profit"] <= p["expected_profit"] for p in points)
    plan = new_plan(client, keys["buyer"], budget_inr=1_000_000, cities=["Goa", "Kochi"]).json()
    assert points[3]["expected_profit"] == pytest.approx(plan["expected_profit"])
    assert points[3]["worst_case_profit"] == pytest.approx(plan["worst_case_profit"])


@pytest.mark.parametrize("query, status", [
    ("budget_inr=0", 422), ("cities=Goa", 422), ("budget_inr=1000000&cities=", 422),
    ("budget_inr=1000000&cities=Atlantis", 400),
])
def test_frontier_checks_its_inputs(api, query, status):
    client, keys = api
    assert frontier(client, keys["buyer"], query).status_code == status


def _free_slots(slots: threading.BoundedSemaphore) -> int:
    taken = 0
    while slots.acquire(blocking=False):
        taken += 1
    for _ in range(taken):
        slots.release()
    return taken


@pytest.mark.parametrize("query, status", [("budget_inr=300000&cities=Goa", 200),
                                           ("budget_inr=300000&cities=Atlantis", 400)])
def test_frontier_takes_one_planner_slot_and_always_gives_it_back(api, monkeypatch, query, status):
    client, keys = api
    slots = threading.BoundedSemaphore(3)
    monkeypatch.setattr(service, "PLANNER_SLOTS", slots)
    free_while_solving = []
    real_build = service.build_plan

    def watched_build(*args, **kwargs):
        free_while_solving.append(_free_slots(slots))
        return real_build(*args, **kwargs)

    monkeypatch.setattr(service, "build_plan", watched_build)
    assert frontier(client, keys["buyer"], query).status_code == status
    assert _free_slots(slots) == 3
    assert set(free_while_solving) == {2}  # one slot, for the whole sweep


def test_frontier_says_busy_when_no_planner_slot_is_free(api, monkeypatch):
    client, keys = api
    slots = threading.BoundedSemaphore(1)
    monkeypatch.setattr(service, "PLANNER_SLOTS", slots)
    monkeypatch.setattr(service, "PLANNER_WAIT_S", 0.01)
    slots.acquire()
    try:
        response = frontier(client, keys["buyer"], "budget_inr=300000&cities=Goa")
    finally:
        slots.release()
    assert response.status_code == 503 and response.headers["retry-after"]


def test_frontier_is_rate_limited(api, monkeypatch):
    client, keys = api
    monkeypatch.setattr(service, "FRONTIER_RATE", service.RateLimiter(limit=1, window_s=60))
    statuses = [frontier(client, keys["buyer"], "budget_inr=300000&cities=Goa").status_code for _ in range(2)]
    assert statuses == [200, 429]


FIXED_KEY = "vy_fixed-demo-key-for-the-hosted-demo-0123456789"


def test_a_fixed_key_works_and_issuing_it_again_changes_nothing(api):
    client, _ = api
    with client.app.state.sessions() as session:
        assert create_api_key(session, "TBO Demo", "approver", "ravi", key=FIXED_KEY) == FIXED_KEY
        assert create_api_key(session, "TBO Demo", "approver", "ravi", key=FIXED_KEY) == FIXED_KEY
    assert client.get("/v1/me", headers=auth(FIXED_KEY)).json()["name"] == "ravi"


@pytest.mark.parametrize("key, match", [
    ("vy_short", "at least"), ("x" * 40, "vy_ prefix"), (FIXED_KEY, "someone else")])
def test_a_fixed_key_must_be_long_and_not_held_by_another_person(api, key, match):
    client, _ = api
    with client.app.state.sessions() as session:
        create_api_key(session, "TBO Demo", "admin", "meera", key=FIXED_KEY)
        with pytest.raises(ValueError, match=match):
            create_api_key(session, "TBO Demo", "approver", "ravi", key=key)


def test_a_refused_fixed_key_leaves_no_new_company_or_person(api):
    client, keys = api
    with client.app.state.sessions() as session:
        with pytest.raises(ValueError, match="someone else"):
            create_api_key(session, "New Co", "buyer", "nina", key=keys["admin"])
        session.commit()
        assert session.query(User).filter_by(name="nina").count() == 0
        assert session.query(Tenant).filter_by(name="New Co").count() == 0


def test_a_revoked_fixed_key_is_not_brought_back(api):
    client, _ = api
    with client.app.state.sessions() as session:
        create_api_key(session, "TBO Demo", "approver", "ravi", key=FIXED_KEY)
        revoke_api_key(session, FIXED_KEY)
        with pytest.raises(ValueError, match="revoked"):
            create_api_key(session, "TBO Demo", "approver", "ravi", key=FIXED_KEY)


def test_audit_log_is_admin_only_and_per_company(api):
    client, keys = api
    new_plan(client, keys["buyer"])
    assert client.get("/v1/audit", headers=auth(keys["buyer"])).status_code == 403
    assert client.get("/v1/audit", headers=auth(keys["other"])).json() == []
