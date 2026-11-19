"""Hosted demo: the Voyance API and the built dashboard on one origin, behind a per-IP rate limit.

Every visitor shares the same four demo people, so the API's per-person limits alone would let one script
lock everyone out. This adds a per-network limit in front, plus the dashboard's runtime config.
"""

import json
import os
import threading
import time
from collections import defaultdict, deque
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from voyance.api.app import create_app

ROOT = Path(__file__).resolve().parent.parent
DEMO_PEOPLE = ("asha", "ravi", "meera", "zed")

# (path, method or None for any, requests per minute per network); the first match wins
LIMITS = (
    ("/v1/frontier", "GET", 6),
    ("/v1/plans/preview", "POST", 60),
    ("/v1/plans", "POST", 10),
    ("/v1/", None, 300),
)
WINDOW_S = 60.0

# Swagger UI loads its scripts from a CDN, so /docs keeps FastAPI's defaults
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
       "font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")


class NetworkLimiter:
    """Sliding one-minute window per (network, rule). In memory, so run one worker."""

    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self._calls = 0

    def retry_after(self, ip: str, path: str, method: str) -> int | None:
        rule = next(((p, limit) for p, m, limit in LIMITS if path.startswith(p) and m in (None, method)), None)
        if rule is None:
            return None
        prefix, limit = rule
        now = time.monotonic()
        with self._lock:
            self._calls += 1
            if self._calls % 1000 == 0:  # forget networks that went quiet
                for key in [k for k, hits in self._hits.items() if not hits or now - hits[-1] > WINDOW_S]:
                    del self._hits[key]
            hits = self._hits[(ip, prefix)]
            while hits and now - hits[0] > WINDOW_S:
                hits.popleft()
            if len(hits) >= limit:
                return max(1, int(WINDOW_S - (now - hits[0])) + 1)
            hits.append(now)
            return None


def client_ip(request: Request, trusted_hops: int) -> str:
    """The address the hosting platform saw. Its proxies append to X-Forwarded-For, so count from the right;
    anything further left was written by the client and can't be trusted."""
    forwarded = [part.strip() for part in request.headers.get("x-forwarded-for", "").split(",") if part.strip()]
    if trusted_hops and len(forwarded) >= trusted_hops:
        return forwarded[-trusted_hops]
    return request.client.host if request.client else "unknown"


def demo_keys() -> dict[str, str]:
    return {name: key for name in DEMO_PEOPLE if (key := os.environ.get(f"VOYANCE_DEMO_KEY_{name.upper()}"))}


def build_app(web_dist: Path | None = None, trusted_hops: int | None = None) -> FastAPI:
    app = create_app()
    dist = web_dist or Path(os.environ.get("VOYANCE_WEB_DIST", ROOT / "web" / "dist"))
    hops = trusted_hops if trusted_hops is not None else int(os.environ.get("VOYANCE_PROXY_HOPS", "1"))
    limiter = NetworkLimiter()

    @app.middleware("http")
    async def guard(request: Request, call_next):
        wait = limiter.retry_after(client_ip(request, hops), request.url.path, request.method)
        if wait is not None:
            return JSONResponse({"detail": "too many requests from your network; try again shortly"},
                                status_code=429, headers={"Retry-After": str(wait)})
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        if not request.url.path.startswith(("/docs", "/openapi.json")):
            response.headers.setdefault("Content-Security-Policy", CSP)
        return response

    # not /healthz: Cloud Run reserves some paths ending in "z" and answers them itself
    @app.get("/health", include_in_schema=False)
    def health() -> dict:
        return {"ok": True}

    @app.get("/config.js", include_in_schema=False)
    def config_js() -> Response:
        # the demo people's keys are public on purpose: the sign-in page offers them as buttons
        body = f"window.__VOYANCE__ = {json.dumps({'demoKeys': demo_keys()})};\n"
        return Response(body, media_type="application/javascript", headers={"Cache-Control": "no-store"})

    if dist.is_dir():
        app.mount("/", StaticFiles(directory=dist, html=True), name="web")
    return app
