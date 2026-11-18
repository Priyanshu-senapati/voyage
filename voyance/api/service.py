"""Plan storage and the approval workflow. Routes stay thin; the rules live here."""

import csv
import io
import threading
import time
from collections import defaultdict, deque
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import asdict
from datetime import date

from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from voyance.api.auth import Principal
from voyance.api.db import AuditEvent, Plan, PlanLineRow, Tenant, utcnow
from voyance.api.planner import PlanRequestError, PlanResult, build_plan
from voyance.api.schemas import (CAP_FIELDS, WHAT_IF_FIELDS, FrontierPoint, FrontierQuery, MarketItem, MeOut,
                                 PlanCreate, PlanPreview, PreviewRequest, QueueItem, QueueOut)
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
# requests inside the planner at once (more get a 503); their solves still run one at a time, 0.25-0.7 s each
PLANNER_SLOTS = threading.BoundedSemaphore(4)
PLANNER_WAIT_S = 5.0
RISK_STEPS = tuple(step / 10 for step in range(11))  # 0, 0.1 ... 1
URGENT_DAYS = 14         # a buy due within two weeks goes to the top of the queue
CLOSE_CALL_SHARE = 0.05  # a passed hotel-week whose forced room costs < 5% of its price is worth watching


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


def preview_plan(world: World, principal: Principal, request: PreviewRequest) -> PlanPreview:
    """The plan `create_plan` would save for this request, or for a what-if, without saving or logging it."""
    _limit(PREVIEW_RATE, principal, "previews")
    result = _solve(world, request.budget_inr, request.risk_aversion, request.cities,
                    **request.model_dump(include=WHAT_IF_FIELDS | CAP_FIELDS))
    return PlanPreview(**request.model_dump(), **asdict(result))


def risk_frontier(world: World, principal: Principal, scope: FrontierQuery) -> list[FrontierPoint]:
    """Expected profit, worst case and spend at each risk step, for one budget (and what-if)."""
    _limit(FRONTIER_RATE, principal, "risk frontiers")
    options = scope.model_dump(include=WHAT_IF_FIELDS | CAP_FIELDS)
    with _planner_slot():  # one slot for the whole sweep; the solves run one at a time (see optimizer)
        results = [build_plan(world, scope.budget_inr, risk, scope.cities, **options) for risk in RISK_STEPS]
    return [FrontierPoint(risk_aversion=risk, expected_profit=result.expected_profit,
                          worst_case_profit=result.worst_case_profit, spend=result.spend)
            for risk, result in zip(RISK_STEPS, results)]


def create_plan(session: Session, world: World, principal: Principal, request: PlanCreate) -> Plan:
    _limit(PLAN_RATE, principal, "plans")
    caps = request.model_dump(include=CAP_FIELDS)
    result = _solve(world, request.budget_inr, request.risk_aversion, request.cities, **caps)
    plan = Plan(
        tenant_id=principal.tenant_id, created_by_user_id=principal.user_id, created_by=principal.label,
        budget_inr=request.budget_inr, risk_aversion=request.risk_aversion, cities=request.cities,
        spend=result.spend, expected_profit=result.expected_profit,
        worst_case_profit=result.worst_case_profit, hurdle_rate=result.hurdle_rate,
        passed=[asdict(p) for p in result.passed], caps_cost=result.caps_cost,
        exposure=[asdict(e) for e in result.exposure], **caps,
        lines=[PlanLineRow(city=line.city, week=line.week, hotel=line.hotel, rooms=line.rooms,
                           unit_cost=line.unit_cost, unit_price=line.unit_price,
                           expected_sold=line.expected_sold, expected_profit=line.expected_profit,
                           reason=line.reason, why=line.why, worst_case_profit=line.worst_case_profit,
                           buy_by=line.buy_by, first_night=line.first_night, limited_by=line.limited_by,
                           extra_room_value=line.extra_room_value)
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
def _planner_slot() -> Iterator[None]:
    if not PLANNER_SLOTS.acquire(timeout=PLANNER_WAIT_S):
        raise Busy("planner is busy; retry in a moment")
    try:
        yield
    except PlanRequestError as exc:
        raise BadRequest(str(exc)) from exc
    finally:
        PLANNER_SLOTS.release()


def _solve(world: World, budget: float, risk_aversion: float, cities: list[str] | None,
           **options: float | None) -> PlanResult:
    with _planner_slot():
        return build_plan(world, budget, risk_aversion, cities, **options)


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


def action_queue(plan: Plan, as_of: date) -> QueueOut:
    """What to do about a saved plan on `as_of`: buys due within URGENT_DAYS first, then later buys by date,
    then things to watch (hotels to ask for more rooms, close calls) and skips. Rejected lines are left out."""
    buys, watch, skip = [], [], []
    for line in plan.lines:
        if line.decision == "rejected":
            continue
        days = (line.buy_by - as_of).days
        place = {"city": line.city, "week": line.week, "hotel": line.hotel, "line_id": line.id}
        if line.first_night <= as_of:
            skip.append(QueueItem(action="skip", rooms=line.rooms, buy_by=line.buy_by, decision=line.decision,
                                  reason=f"too late: the week began on {line.first_night:%d %b %Y}", **place))
            continue
        buys.append(QueueItem(action="buy_now" if days <= URGENT_DAYS else "scheduled", rooms=line.rooms,
                              buy_by=line.buy_by, decision=line.decision, reason=_when(line.rooms, line.buy_by, days),
                              **place))
        if line.limited_by == "hotel" and line.extra_room_value > 0:
            watch.append(QueueItem(action="watch", reason=f"ask the hotel for more rooms: each extra room is worth "
                                   f"about ₹{line.extra_room_value:,.0f}", **place))
    for passed in plan.passed:
        place = {key: passed[key] for key in ("city", "week", "hotel")}
        if passed["forced_room_cost"] <= CLOSE_CALL_SHARE * passed["unit_price"]:
            watch.append(QueueItem(action="watch", reason=f"close call, re-check if demand or rates move: "
                                   f"{passed['reason']}", **place))
        else:
            skip.append(QueueItem(action="skip", reason=passed["reason"], **place))
    buys.sort(key=lambda item: (item.action != "buy_now", item.buy_by))
    return QueueOut(plan_id=plan.id, as_of=as_of, hurdle_rate=plan.hurdle_rate, items=[*buys, *watch, *skip])


def _when(rooms: int, buy_by: date, days: int) -> str:
    what = f"buy {rooms} room{'s' if rooms != 1 else ''}"
    if days < 0:
        return f"{what} now: the buy-by date, {buy_by:%d %b %Y}, passed {-days} day{'s' if days != -1 else ''} ago"
    if days == 0:
        return f"{what} today ({buy_by:%d %b %Y})"
    if days <= URGENT_DAYS:
        return f"{what} by {buy_by:%d %b %Y}: {days} day{'s' if days != 1 else ''} left"
    return f"{what} by {buy_by:%d %b %Y}"


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
