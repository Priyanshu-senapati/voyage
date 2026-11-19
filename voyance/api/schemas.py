"""Request and response shapes. These are the API contract the dashboard builds against."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field

City = Annotated[str, Field(min_length=1, max_length=50)]
Decision = Literal["pending", "approved", "rejected"]
LimitedBy = Literal["hotel", "cap", "budget", "demand"]
QueueAction = Literal["buy_now", "scheduled", "awaiting_approval", "watch", "skip"]
PlanStatus = Literal["empty", "pending", "approved", "rejected", "mixed"]
Role = Literal["buyer", "approver", "admin"]


class ErrorOut(BaseModel):
    detail: str


class MeOut(BaseModel):
    name: str
    role: Role
    tenant: str


class PlanScope(BaseModel):
    budget_inr: float = Field(gt=0, le=1e10, description="Maximum spend in INR (up to ₹1,000 crore)")
    cities: list[City] | None = Field(None, min_length=1, max_length=50,
                                      description="Limit to these cities; leave out for all")
    max_city_share: float | None = Field(None, gt=0, le=1, description="At most this share of the whole budget "
                                         "in any one city, e.g. 0.35, also when `cities` narrows the plan; "
                                         "leave out for no cap")
    max_hotel_share: float | None = Field(None, gt=0, le=1, description="At most this share of the whole budget "
                                          "with any one hotel (supplier); leave out for no cap")


CAP_FIELDS = frozenset({"max_city_share", "max_hotel_share"})


class PlanCreate(PlanScope):
    # what-ifs are only for previews: refuse them here rather than quietly saving the base plan
    model_config = ConfigDict(extra="forbid", json_schema_extra={
        "examples": [{"budget_inr": 2_000_000, "risk_aversion": 0.3, "cities": ["Goa", "Udaipur"]}]})
    risk_aversion: float = Field(0.3, ge=0, le=1,
                                 description="0 = maximise expected profit, 1 = protect the worst case")


class WhatIf(BaseModel):
    """A different world to re-plan in. The optimizer re-plans; nothing is saved."""

    demand_change: float = Field(0.0, ge=-0.5, le=1.0, description="0.2 = demand 20% above the forecast")
    cost_change: float = Field(0.0, ge=-0.3, le=0.5, description="0.1 = supplier rates 10% dearer")
    event_lift: float | None = Field(None, ge=1.0, le=3.0, description="Demand multiple in this season's event "
                                     "weeks; leave out for the planner's own guess (1.5)")
    cancel_rate: float | None = Field(None, ge=0, lt=1, description="Share of agent bookings that cancel; leave "
                                      "out for the rate measured on real agent bookings (41%). Saved plans use it")


WHAT_IF_FIELDS = frozenset(WhatIf.model_fields)


class PreviewRequest(PlanCreate, WhatIf):
    pass


class FrontierQuery(PlanScope, WhatIf):
    model_config = ConfigDict(extra="forbid")  # a misspelt what-if must not quietly give the base frontier


class LineDecision(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"decision": "approved"}]})
    decision: Literal["approved", "rejected"]


class LineWhy(BaseModel):
    """The numbers behind a line's reason, so the dashboard can draw them."""

    expected_demand: float = Field(description="Room-nights we expect this December, hidden demand included")
    booked_last_december: float
    bookings_past_decembers: list[float] = Field(description="Oldest first")
    soldout_searches_past: list[float] = Field(description="Searches that found nothing left, oldest first")
    event_week: bool
    margin: float = Field(description="(price - cost) / price")
    sell_out_chance: float | None = Field(None, description="Chance every room bought sells (plans from before "
                                          "this field have none)")
    why_not_more: str | None = Field(None, description="Why the plan stops at this many rooms, in money")
    week_vs_typical: float | None = Field(None, description="Expected demand / the same hotel's typical (median) "
                                          "December week this season")
    price_change: float | None = Field(None, description="selling_price / unit_price - 1")
    selling_price: float | None = Field(None, description="Recommended price per room-night: unit_price moved "
                                        "the way real agent rates move with demand (profits stay at unit_price)")
    stay_share: float | None = Field(None, description="Share of expected demand the plan counts on after early "
                                     "cancellations (late ones are already in expected_sold)")


class PreviewLine(BaseModel):
    """A buy line before it is saved."""

    model_config = ConfigDict(from_attributes=True)
    city: str
    week: str
    hotel: str
    rooms: int
    unit_cost: float
    unit_price: float
    expected_sold: float
    expected_profit: float
    reason: str
    why: LineWhy
    worst_case_profit: float = Field(description="This line alone, averaged over its worst 5% of scenarios")
    buy_by: date = Field(description="Commit by this date: 90% of that week's agent bookings come later")
    first_night: date
    limited_by: LimitedBy = Field(description="What stopped it buying more: the hotel's allotment, a city or "
                                  "hotel cap, the budget (the next room earns less than the hurdle rate) or demand")
    extra_room_value: float = Field(description="Risk-adjusted rupees one more room of allotment would add; "
                                    "0 unless limited by the hotel")

    @computed_field
    @property
    def sell_through(self) -> float:
        return self.expected_sold / self.rooms


class PlanLineOut(PreviewLine):
    id: int
    decision: Decision
    decided_by: str | None
    decided_at: datetime | None


class PlanTotals(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    budget_inr: float
    risk_aversion: float
    cities: list[str] | None
    spend: float
    expected_profit: float
    worst_case_profit: float
    hurdle_rate: float = Field(description="Risk-adjusted rupees one more rupee of budget would earn: the return "
                               "every purchase must beat. 0 when money isn't the limit")
    max_city_share: float | None = None
    max_hotel_share: float | None = None
    caps_cost: float = Field(description="Risk-adjusted profit the city and hotel caps give up (0 without caps)")


class ExposureOut(BaseModel):
    kind: Literal["city", "hotel"]
    name: str = Field(description='A city, or "City · Hotel" for a hotel')
    spend: float
    share_of_budget: float
    cap: float | None
    at_cap: bool = Field(description="The optimizer's plan fills the cap; whole rooms can round a little below it")


class PassedOut(BaseModel):
    """A hotel-week the plan buys none of, and why."""

    city: str
    week: str
    hotel: str
    unit_cost: float
    unit_price: float
    expected_demand: float
    earns_here: float = Field(description="What one whole room here makes: price x its expected sales - cost")
    earns_elsewhere: float = Field(description="What the same money makes in the rest of the plan")
    forced_room_cost: float = Field(description="About what the plan would lose, risk-adjusted, with one whole "
                                    "room forced in")
    reason: str


class PlanPreview(PlanTotals, WhatIf):
    lines: list[PreviewLine]
    passed: list[PassedOut]
    exposure: list[ExposureOut]


class PlanSummary(PlanTotals):
    id: int
    created_at: datetime
    created_by: str
    status: PlanStatus


class PlanOut(PlanSummary):
    lines: list[PlanLineOut]
    passed: list[PassedOut]
    exposure: list[ExposureOut]


class PositionLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    city: str
    week: str
    hotel: str
    line_id: int | None
    rooms: int
    forecast: float = Field(description="Expected demand when the plan was made")
    on_books: float = Field(description="Room-nights booked so far")
    expected_by_now: float = Field(description="Forecast x the typical share booked by this many days out")
    pace: float = Field(description="on_books / expected_by_now: 1.3 = running 30% ahead")
    projected_demand: float
    gap: float = Field(description="Projected demand - rooms bought: > 0 short of rooms, < 0 more than demand")
    status: Literal["short", "on_pace", "over", "started"]
    note: str


class PositionOut(BaseModel):
    """How each saved line is booking up. Flags only: the buyer decides whether to buy more or release."""

    model_config = ConfigDict(from_attributes=True)
    as_of: date
    lines: list[PositionLineOut]
    summary: dict[str, int]


class ReplayDriver(BaseModel):
    label: str = Field(description='What moved the forecast, in plain words, e.g. "already booked"')
    room_nights: float = Field(description="How far it moved it (SHAP value)")


class ReplayForecast(BaseModel):
    low: float
    likely: float
    high: float
    drivers: list[ReplayDriver]


class ReplayOutcome(BaseModel):
    rooms: float
    sold: float
    unsold: float
    turned_away: float
    profit: float


class ReplayWeek(BaseModel):
    week: date
    hotel: str
    decided_on: date
    forecast: ReplayForecast = Field(description="What we believed on decided_on")
    on_books: float
    last_year: float
    actual: float = Field(description="Room-nights the week's agent bookings really came to")
    rate: float = Field(description="Average agent rate that week (EUR)")
    strategies: dict[str, ReplayOutcome] = Field(description="voyance (buy the likely forecast) and "
                                                 "rebuy_last_year")
    running_profit: dict[str, float]


class ReplayOut(BaseModel):
    """Decision memory on real bookings: what we believed, decided and saw, week by week."""

    source: str
    assumptions: dict[str, float | str]
    weeks: list[ReplayWeek]
    totals: dict[str, dict[str, float]]


class QueueItem(BaseModel):
    action: QueueAction
    city: str
    week: str
    hotel: str
    line_id: int | None = Field(None, description="The plan line, for buys and hotel-limited lines")
    rooms: int | None = None
    buy_by: date | None = None
    decision: Decision | None = None
    reason: str


class QueueOut(BaseModel):
    """What to do about a plan on a given day: approved buys (now or scheduled), lines awaiting approval,
    things to watch, and skips. Only approved lines are ever buys."""

    plan_id: int
    as_of: date
    hurdle_rate: float
    items: list[QueueItem]


class FrontierPoint(BaseModel):
    risk_aversion: float
    expected_profit: float
    worst_case_profit: float
    spend: float


class MarketItem(BaseModel):
    city: str
    week: str
    hotel: str
    unit_cost: float
    unit_price: float
    max_rooms: int
    past_bookings_avg: float
    soldout_searches_total: int
    event_this_season: bool


class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    at: datetime
    actor: str
    action: str
    target: str
