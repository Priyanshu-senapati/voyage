"""HTTP routes. Thin: check who is calling, then hand over to the service."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, Response
from sqlalchemy.orm import Session

from voyance.api import service
from voyance.api.auth import Principal, get_principal, get_session, require_role
from voyance.api.schemas import (AuditOut, ErrorOut, LineDecision, MarketItem, PlanCreate, PlanLineOut,
                                PlanOut, PlanSummary)

MAX_ID = 2**31 - 1
Id = Annotated[int, Path(ge=1, le=MAX_ID)]


def _errors(*codes: int) -> dict:
    text = {400: "Bad request, e.g. an unknown city", 403: "Your role can't do this",
            404: "No such plan or line in your company", 409: "Line already decided",
            429: "Too many plans; see Retry-After", 503: "Planner busy; see Retry-After"}
    return {code: {"model": ErrorOut, "description": text[code]} for code in codes}


router = APIRouter(prefix="/v1", responses={401: {"model": ErrorOut, "description": "Missing or invalid API key"}})


@router.get("/markets", response_model=list[MarketItem], summary="Hotel-weeks that can be bought")
def markets(request: Request, _: Principal = Depends(get_principal)) -> list[MarketItem]:
    return service.market_items(request.app.state.world)


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
