"""PreBuy API.

Run from the project root:  uvicorn prebuy.api.app:create_app --factory --reload
Docs (the dashboard's contract) at http://127.0.0.1:8000/docs

Settings (environment variables):
  PREBUY_DATABASE_URL   default sqlite:///prebuy.db; any SQLAlchemy URL, e.g. Postgres
  PREBUY_CORS_ORIGINS   comma-separated dashboard origins, e.g. http://localhost:5173
"""

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from prebuy.api.datasource import DataSource, DemoDataSource
from prebuy.api.db import make_sessions
from prebuy.api.routes import router
from prebuy.api.service import ServiceError


def create_app(database_url: str | None = None, datasource: DataSource | None = None) -> FastAPI:
    app = FastAPI(title="PreBuy API", version="0.1.0",
                  description="Buy Desk: what hotel inventory to pre-buy within a budget, "
                              "with human approval and an audit trail.")
    app.state.sessions = make_sessions(
        database_url or os.environ.get("PREBUY_DATABASE_URL", "sqlite:///prebuy.db"))
    app.state.world = (datasource or DemoDataSource()).load()

    origins = [o.strip() for o in os.environ.get("PREBUY_CORS_ORIGINS", "").split(",") if o.strip()]
    if "*" in origins:
        raise ValueError("PREBUY_CORS_ORIGINS must list exact dashboard origins, not *")
    if origins:
        app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST", "PATCH"],
                           allow_headers=["X-API-Key", "Content-Type"])
    app.add_exception_handler(ServiceError, _service_error)
    app.include_router(router)
    return app


async def _service_error(_: Request, exc: ServiceError) -> JSONResponse:
    return JSONResponse({"detail": str(exc)}, status_code=exc.status_code, headers=exc.headers)
