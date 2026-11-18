"""Plan storage and the approval workflow. Routes stay thin; the rules live here."""

import csv
import io
import os
import threading
import time
from collections import defaultdict, deque
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import asdict

from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from voyance.api.auth import Principal
from voyance.api.db import AuditEvent, Plan, PlanLineRow, Tenant, utcnow
from voyance.api.planner import PlanRequestError, PlanResult, build_plan
from voyance.api.schemas import FrontierPoint, MarketItem, MeOut, PlanCreate, PlanPreview, PlanScope
from voyance.sim import World

CSV_COLUMNS = ("city", "week", "hotel", "buy_by", "rooms", "unit_cost", "unit_price", "expected_sold",
               "expected_profit", "worst_case_profit", "decision", "decided_by", "reason")
FORMULA_STARTS = ("=", "+", "-", "@", "\t", "\r")


class ServiceError(Exception):
    status_code = 400
    headers: dict[str, str] | None = None


class BadRequest(ServiceError):
    status_code = 400


class Forbidden(ServiceError):
    status_code = 403


class NotFound(ServiceError):
    status_code = 404


class Conflict(ServiceError):
    status_code = 409


class TooManyRequests(ServiceError):
    status_code = 429


class Busy(ServiceError):
    status_code = 503
    headers = {"Retry-After": "2"}


class RateLimiter:
    """At most `limit` calls per person in any `window_s` seconds."""

    # shortcut: in-memory, so per process; move to Redis before running several API workers.
    def __init__(self, limit: int, window_s: float) -> None:
        self.limit, self.window_s = limit, window_s
        self._calls: dict[int, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, user_id: int) -> bool:
        now = time.monotonic()
        with self._lock:
            calls = self._calls[user_id]
            while calls and now - calls[0] > self.window_s:
                calls.popleft()
            if len(calls) >= self.limit:
                return False
            calls.append(now)
            return True


PLAN_RATE = RateLimiter(limit=30, window_s=60)
PREVIEW_RATE = RateLimiter(limit=120, window_s=60)  # sliders: the dashboard should still debounce
FRONTIER_RATE = RateLimiter(limit=10, window_s=60)  # each call is one solve per risk step
# solves at once, one core each (~0.25-0.7 s); spare slots let one frontier solve its steps in parallel
PLANNER_SLOTS = threading.BoundedSemaphore(min(8, os.cpu_count() or 1))
PLANNER_WAIT_S = 5.0
RISK_STEPS = tuple(step / 10 for step in range(11))  # 0, 0.1 ... 1


def market_items(world: World) -> list[MarketItem]:
    past = world.bookings_hist.mean(axis=0)
    searches = world.soldout_searches_hist.sum(axis=0)
    return [
        MarketItem(city=world.city[i], week=world.week[i], hotel=world.hotel[i],
                   unit_cost=float(world.cost[i]), unit_price=float(world.price[i]),
                   max_rooms=int(world.cap[i]), past_bookings_avg=float(past[i]),
                   soldout_searches_total=int(searches[i]),
                   event_this_season=bool(world.event_lift_now[i] > 1))
        for i in range(len(world.city))
    ]


def me(session: Session, principal: Principal) -> MeOut:
    tenant = session.get(Tenant, principal.tenant_id)
    return MeOut(name=principal.label, role=principal.role, tenant=tenant.name)


def preview_plan(world: World, principal: Principal, request: PlanCreate) -> PlanPreview:
    """The plan `create_plan` would save for this request, without saving or logging it."""
    _limit(PREVIEW_RATE, principal, "previews")
    result = _solve(world, request.budget_inr, request.risk_aversion, request.cities)
    return PlanPreview(**request.model_dump(), **asdict(result))


def risk_frontier(world: World, principal: Principal, scope: PlanScope) -> list[FrontierPoint]:
    """Expected profit, worst case and spend at each risk step, for one budget."""
    _limit(FRONTIER_RATE, principal, "risk frontiers")
    with _planner_slot(most=len(RISK_STEPS)) as slots, ThreadPoolExecutor(slots) as pool:
        # HiGHS releases the GIL, so steps on spare slots solve in parallel (11 steps: ~5 s -> ~1.2 s)
        results = list(pool.map(lambda risk: build_plan(world, scope.budget_inr, risk, scope.cities), RISK_STEPS))
    return [FrontierPoint(risk_aversion=risk, expected_profit=result.expected_profit,
                          worst_case_profit=result.worst_case_profit, spend=result.spend)
            for risk, result in zip(RISK_STEPS, results)]


def create_plan(session: Session, world: World, principal: Principal, request: PlanCreate) -> Plan:
    _limit(PLAN_RATE, principal, "plans")
    result = _solve(world, request.budget_inr, request.risk_aversion, request.cities)
    plan = Plan(
        tenant_id=principal.tenant_id, created_by_user_id=principal.user_id, created_by=principal.label,
        budget_inr=request.budget_inr, risk_aversion=request.risk_aversion, cities=request.cities,
        spend=result.spend, expected_profit=result.expected_profit,
        worst_case_profit=result.worst_case_profit,
        lines=[PlanLineRow(city=line.city, week=line.week, hotel=line.hotel, rooms=line.rooms,
                           unit_cost=line.unit_cost, unit_price=line.unit_price,
                           expected_sold=line.expected_sold, expected_profit=line.expected_profit,
                           reason=line.reason, why=line.why, worst_case_profit=line.worst_case_profit,
                           buy_by=line.buy_by)
               for line in result.lines],
    )
    session.add(plan)
    session.flush()
    _audit(session, principal, "plan.created", f"plan:{plan.id}")
    session.commit()
    return plan


def _limit(limiter: RateLimiter, principal: Principal, what: str) -> None:
    if not limiter.allow(principal.user_id):
        error = TooManyRequests(f"too many {what}; wait a minute")
        error.headers = {"Retry-After": str(int(limiter.window_s))}
        raise error


@contextmanager
def _planner_slot(most: int = 1) -> Iterator[int]:
    """Wait for one planner slot, then take up to `most` in all if they are free right now."""
    if not PLANNER_SLOTS.acquire(timeout=PLANNER_WAIT_S):
        raise Busy("planner is busy; retry in a moment")
    held = 1
    while held < most and PLANNER_SLOTS.acquire(blocking=False):
        held += 1
    try:
        yield held
    except PlanRequestError as exc:
        raise BadRequest(str(exc)) from exc
    finally:
        for _ in range(held):
            PLANNER_SLOTS.release()


def _solve(world: World, budget: float, risk_aversion: float, cities: list[str] | None) -> PlanResult:
    with _planner_slot():
        return build_plan(world, budget, risk_aversion, cities)


def get_plan(session: Session, principal: Principal, plan_id: int) -> Plan:
    plan = session.scalar(select(Plan).options(selectinload(Plan.lines)).where(Plan.id == plan_id))
    # another company's plan is reported as missing, so ids leak nothing
    if plan is None or plan.tenant_id != principal.tenant_id:
        raise NotFound("plan not found")
    return plan


def list_plans(session: Session, principal: Principal, limit: int, offset: int) -> list[Plan]:
    query = (select(Plan).options(selectinload(Plan.lines))
             .where(Plan.tenant_id == principal.tenant_id)
             .order_by(Plan.id.desc()).limit(limit).offset(offset))
    return list(session.scalars(query))


def decide_line(session: Session, principal: Principal, plan_id: int, line_id: int,
                decision: str) -> PlanLineRow:
    plan = get_plan(session, principal, plan_id)
    line = next((row for row in plan.lines if row.id == line_id), None)
    if line is None:
        raise NotFound("line not found in this plan")
    if principal.user_id == plan.created_by_user_id:
        raise Forbidden("a plan must be approved by someone other than its creator")
    if line.decision != "pending":
        raise Conflict(f"line already {line.decision}")
    # the WHERE on decision makes this atomic: if someone else decided first, nothing changes
    result = session.execute(
        update(PlanLineRow)
        .where(PlanLineRow.id == line.id, PlanLineRow.decision == "pending")
        .values(decision=decision, decided_by=principal.label, decided_at=utcnow())
        .execution_options(synchronize_session=False)
    )
    if result.rowcount == 0:
        session.rollback()
        raise Conflict("line was decided by someone else just now")
    _audit(session, principal, f"line.{decision}", f"plan:{plan.id}/line:{line.id}")
    session.commit()
    session.refresh(line)
    return line


def list_audit(session: Session, principal: Principal, limit: int, offset: int) -> list[AuditEvent]:
    query = (select(AuditEvent).where(AuditEvent.tenant_id == principal.tenant_id)
             .order_by(AuditEvent.id.desc()).limit(limit).offset(offset))
    return list(session.scalars(query))


def plan_csv(plan: Plan) -> str:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(CSV_COLUMNS)
    writer.writerows([_cell(getattr(line, column)) for column in CSV_COLUMNS] for line in plan.lines)
    return out.getvalue()


def _cell(value: object) -> object:
    if isinstance(value, float):
        return round(value, 2)
    # stop spreadsheets from running text that starts like a formula
    if isinstance(value, str) and value.startswith(FORMULA_STARTS):
        return "'" + value
    return value


def _audit(session: Session, principal: Principal, action: str, target: str) -> None:
    session.add(AuditEvent(tenant_id=principal.tenant_id, actor=principal.label,
                           action=action, target=target))
