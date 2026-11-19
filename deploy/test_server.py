"""Hosted-demo server: runtime config, static dashboard, headers and the per-network limit.

Run from the project root:  python -m pytest deploy
"""

import pytest
from fastapi.testclient import TestClient

from deploy.server import LIMITS, build_app

KEY = "vy_test-ravi-0000000000000000000000000"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("VOYANCE_DATABASE_URL", f"sqlite:///{tmp_path / 'demo.db'}")
    monkeypatch.setenv("VOYANCE_DEMO_KEY_RAVI", KEY)
    for name in ("ASHA", "MEERA", "ZED"):
        monkeypatch.delenv(f"VOYANCE_DEMO_KEY_{name}", raising=False)
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>Voyance</title>")
    return TestClient(build_app(web_dist=dist, trusted_hops=1))


def test_config_js_offers_only_the_configured_demo_keys(client):
    res = client.get("/config.js")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/javascript")
    assert res.headers["cache-control"] == "no-store"
    assert res.text == f'window.__VOYANCE__ = {{"demoKeys": {{"ravi": "{KEY}"}}}};\n'


def test_dashboard_and_api_share_one_origin(client):
    page = client.get("/")
    assert page.status_code == 200 and "<title>Voyance</title>" in page.text
    assert "frame-ancestors 'none'" in page.headers["content-security-policy"]
    assert client.get("/health").json() == {"ok": True}
    assert client.get("/v1/me").status_code == 401  # API routes win over the static mount


def test_swagger_docs_keep_their_cdn_scripts(client):
    assert "content-security-policy" not in client.get("/docs").headers


def test_one_network_is_limited_but_others_are_not(client):
    limit = next(limit for path, method, limit in LIMITS if path == "/v1/plans" and method == "POST")
    busy = {"X-Forwarded-For": "203.0.113.7"}
    codes = [client.post("/v1/plans", json={}, headers=busy).status_code for _ in range(limit + 1)]
    assert codes[:limit] == [401] * limit  # still reaches the API (no key) until the limit
    assert codes[-1] == 429
    assert int(client.post("/v1/plans", json={}, headers=busy).headers["retry-after"]) >= 1
    assert client.post("/v1/plans", json={}, headers={"X-Forwarded-For": "198.51.100.2"}).status_code == 401


def test_a_spoofed_forwarded_for_does_not_dodge_the_limit(client):
    limit = next(limit for path, method, limit in LIMITS if path == "/v1/plans" and method == "POST")
    codes = [
        client.post("/v1/plans", json={}, headers={"X-Forwarded-For": f"10.0.0.{i}, 203.0.113.9"}).status_code
        for i in range(limit + 1)
    ]
    assert codes[-1] == 429  # the platform-added address (rightmost) is what counts
