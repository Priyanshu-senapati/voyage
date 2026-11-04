import csv
import io
import threading

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, text

from prebuy.api import service
from prebuy.api.app import create_app
from prebuy.api.auth import Principal, create_api_key, revoke_api_key
from prebuy.api.db import User, make_sessions


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
    sessions = make_sessions(f"sqlite:///{tmp_path / 'prebuy.db'}")
    with sessions() as session:
        assert session.execute(text("PRAGMA foreign_keys")).scalar() == 1
        assert session.execute(text("PRAGMA journal_mode")).scalar() == "wal"


def test_api_contract_gives_the_dashboard_fixed_value_lists(api):
    client, _ = api
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    assert schemas["PlanLineOut"]["properties"]["decision"]["enum"] == ["pending", "approved", "rejected"]
    assert set(schemas["PlanSummary"]["properties"]["status"]["enum"]) == {
        "empty", "pending", "approved", "rejected", "mixed"}


def test_audit_log_is_admin_only_and_per_company(api):
    client, keys = api
    new_plan(client, keys["buyer"])
    assert client.get("/v1/audit", headers=auth(keys["buyer"])).status_code == 403
    assert client.get("/v1/audit", headers=auth(keys["other"])).json() == []
