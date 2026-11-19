"""HTTP routes. Thin: check who is calling, then hand over to the service."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, Response
from sqlalchemy.orm import Session

from voyance.api import service
from voyance.api.auth import Principal, get_principal, get_session, require_role
from voyance.api.db import utcnow
from voyance.api.position import position
from voyance.api.schemas import (AuditOut, ErrorOut, FrontierPoint, FrontierQuery, LineDecision, MarketItem, MeOut,
                                PlanCreate, PlanLineOut, PlanOut, PlanPreview, PlanSummary, PositionOut, PreviewRequest,
                                QueueOut, ReplayOut)

MAX_ID = 2**31 - 1
Id = Annotated[int, Path(ge=1, le=MAX_ID)]


def _errors(*codes: int) -> dict:
    text = {400: "Bad request, e.g. an unknown city", 403: "Your role can't do this",
            404: "No such plan or line in your company", 409: "Line already decided",
            429: "Too many plans; see Retry-After", 503: "Planner busy; see Retry-After"}
    return {code: {"model": ErrorOut, "description": text[code]} for code in codes}


router = APIRouter(prefix="/v1", responses={401: {"model": ErrorOut, "description": "Missing or invalid API key"}})


@router.get("/me", response_model=MeOut, summary="Who is calling: name, role and company")
def me(principal: Principal = Depends(get_principal), session: Session = Depends(get_session)) -> MeOut:
    return service.me(session, principal)


@router.get("/markets", response_model=list[MarketItem], summary="Hotel-weeks that can be bought")
def markets(request: Request, _: Principal = Depends(get_principal)) -> list[MarketItem]:
    return service.market_items(request.app.state.world)


@router.post("/plans/preview", response_model=PlanPreview, responses=_errors(400, 429, 503),
             summary="Try a budget, risk or what-if without saving",
             description="Same body and lines as creating a plan, plus optional what-ifs (demand_change, "
             "cost_change, event_lift) that the optimizer re-plans in. Nothing is saved or logged. For sliders: "
             f"its own limit of {service.PREVIEW_RATE.limit} a minute per person; please debounce.")
def preview_plan(body: PreviewRequest, request: Request,
                 principal: Principal = Depends(get_principal)) -> PlanPreview:
    return service.preview_plan(request.app.state.world, principal, body)


@router.get("/frontier", response_model=list[FrontierPoint], responses=_errors(400, 429, 503),
            summary="Profit and worst case at each risk setting",
            description="One point per risk setting 0, 0.1 ... 1 for this budget (cities repeated: "
            "?cities=Goa&cities=Kochi), optionally in a what-if as in the preview. "
            f"{service.FRONTIER_RATE.limit} a minute per person.")
def frontier(scope: Annotated[FrontierQuery, Query()], request: Request,
             principal: Principal = Depends(get_principal)) -> list[FrontierPoint]:
    return service.risk_frontier(request.app.state.world, principal, scope)


@router.post("/plans", response_model=PlanOut, status_code=201, responses=_errors(400, 429, 503),
             summary="Create a buy plan", description="Budget + risk (+ cities) in; ranked buy lines out, "
             "each with a reason. Every line starts as pending and needs an approver.")
def create_plan(body: PlanCreate, request: Request, principal: Principal = Depends(get_principal),
                session: Session = Depends(get_session)) -> PlanOut:
    return service.create_plan(session, request.app.state.world, principal, body)


@router.get("/plans", response_model=list[PlanSummary], summary="Your company's plans, newest first")
def list_plans(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0, le=MAX_ID),
               principal: Principal = Depends(get_principal),
               session: Session = Depends(get_session)) -> list[PlanSummary]:
    return service.list_plans(session, principal, limit, offset)


@router.get("/plans/{plan_id}", response_model=PlanOut, responses=_errors(404), summary="One plan with its lines")
def get_plan(plan_id: Id, principal: Principal = Depends(get_principal),
             session: Session = Depends(get_session)) -> PlanOut:
    return service.get_plan(session, principal, plan_id)


@router.get("/plans/{plan_id}/export.csv", response_class=Response, summary="Download a plan as CSV",
            responses={200: {"content": {"text/csv": {}}, "description": "One row per line"}, **_errors(404)})
def export_plan(plan_id: Id, principal: Principal = Depends(get_principal),
                session: Session = Depends(get_session)) -> Response:
    plan = service.get_plan(session, principal, plan_id)
    return Response(service.plan_csv(plan), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="plan-{plan_id}.csv"'})


@router.get("/plans/{plan_id}/position", response_model=PositionOut, responses=_errors(404),
            summary="How each line is booking up", description="Bookings so far against the forecast's typical "
            "December pace, the projected demand and the gap to the rooms bought: short, on pace or over. Flags "
            "only; the buyer decides. Rejected lines are left out.")
def plan_position(plan_id: Id, request: Request,
                  as_of: date | None = Query(None, description="Default today (UTC)"),
                  principal: Principal = Depends(get_principal),
                  session: Session = Depends(get_session)) -> PositionOut:
    plan = service.get_plan(session, principal, plan_id)
    return position(request.app.state.world, plan.lines, as_of or utcnow().date())


@router.get("/replay", response_model=ReplayOut, summary="Real 2017 bookings, replayed week by week",
            description="For each hotel-week: what the forecast believed on the day of the decision (and why), "
            "what Voyance and re-buying last year would have bought, and what really happened, with running "
            "profits. Two hotels in Portugal; the contract cost is an assumption (see `assumptions`).")
def replay(_: Principal = Depends(get_principal)) -> dict:
    return service.replay()


@router.get("/plans/{plan_id}/queue", response_model=QueueOut, responses=_errors(404),
            summary="What to do about a plan today", description="Buys due within two weeks first, then later "
            "buys by date, then hotels to ask for more rooms and close calls to watch, then skips with their reasons.")
def plan_queue(plan_id: Id, as_of: date | None = Query(None, description="The day to plan for; default today (UTC)"),
               principal: Principal = Depends(get_principal), session: Session = Depends(get_session)) -> QueueOut:
    plan = service.get_plan(session, principal, plan_id)
    return service.action_queue(plan, as_of or utcnow().date())


@router.patch("/plans/{plan_id}/lines/{line_id}", response_model=PlanLineOut, responses=_errors(403, 404, 409),
              summary="Approve or reject one line", description="Approvers and admins only, never on a plan "
              "you created. A decision is final.")
def decide_line(plan_id: Id, line_id: Id, body: LineDecision,
                principal: Principal = Depends(require_role("approver", "admin")),
                session: Session = Depends(get_session)) -> PlanLineOut:
    return service.decide_line(session, principal, plan_id, line_id, body.decision)


@router.get("/audit", response_model=list[AuditOut], responses=_errors(403), summary="Who did what (admins only)")
def audit_log(limit: int = Query(100, ge=1, le=1000), offset: int = Query(0, ge=0, le=MAX_ID),
              principal: Principal = Depends(require_role("admin")),
              session: Session = Depends(get_session)) -> list[AuditOut]:
    return service.list_audit(session, principal, limit, offset)
