"""Plan storage and the approval workflow. Routes stay thin; the rules live here."""

import csv
import io
import threading
import time
from collections import defaultdict, deque

from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from voyance.api.auth import Principal
from voyance.api.db import AuditEvent, Plan, PlanLineRow, utcnow
from voyance.api.planner import PlanRequestError, build_plan
from voyance.api.schemas import MarketItem, PlanCreate
from voyance.sim import World

CSV_COLUMNS = ("city", "week", "hotel", "rooms", "unit_cost", "unit_price", "expected_sold",
               "expected_profit", "decision", "decided_by", "reason")
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
PLANNER_SLOTS = threading.BoundedSemaphore(4)  # solves at once; each takes ~0.1-0.3 s of CPU
PLANNER_WAIT_S = 5.0


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


def create_plan(session: Session, world: World, principal: Principal, request: PlanCreate) -> Plan:
    if not PLAN_RATE.allow(principal.user_id):
        error = TooManyRequests("too many plans; wait a minute")
        error.headers = {"Retry-After": str(int(PLAN_RATE.window_s))}
        raise error
    result = _solve(world, request)
    plan = Plan(
        tenant_id=principal.tenant_id, created_by_user_id=principal.user_id, created_by=principal.label,
        budget_inr=request.budget_inr, risk_aversion=request.risk_aversion, cities=request.cities,
        spend=result.spend, expected_profit=result.expected_profit,
        worst_case_profit=result.worst_case_profit,
        lines=[PlanLineRow(city=line.city, week=line.week, hotel=line.hotel, rooms=line.rooms,
                           unit_cost=line.unit_cost, unit_price=line.unit_price,
                           expected_sold=line.expected_sold, expected_profit=line.expected_profit,
                           reason=line.reason)
               for line in result.lines],
    )
    session.add(plan)
    session.flush()
    _audit(session, principal, "plan.created", f"plan:{plan.id}")
    session.commit()
    return plan


def _solve(world: World, request: PlanCreate):
    if not PLANNER_SLOTS.acquire(timeout=PLANNER_WAIT_S):
        raise Busy("planner is busy; retry in a moment")
    try:
        return build_plan(world, request.budget_inr, request.risk_aversion, request.cities)
    except PlanRequestError as exc:
        raise BadRequest(str(exc)) from exc
    finally:
        PLANNER_SLOTS.release()


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
