"""Request and response shapes. These are the API contract the dashboard builds against."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field

City = Annotated[str, Field(min_length=1, max_length=50)]
Decision = Literal["pending", "approved", "rejected"]
LimitedBy = Literal["hotel", "budget", "demand"]
QueueAction = Literal["buy_now", "scheduled", "watch", "skip"]
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
    max_city_share: float | None = Field(None, gt=0, le=1, description="At most this share of the budget in any "
                                         "one city, e.g. 0.35; leave out for no cap")
    max_hotel_share: float | None = Field(None, gt=0, le=1, description="At most this share of the budget with "
                                          "any one hotel (supplier); leave out for no cap")


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
    limited_by: LimitedBy = Field(description="What stopped it buying more: the hotel's allotment, the budget "
                                  "(the next room earns less than the hurdle rate) or demand")
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
    name: str
    spend: float
    share_of_budget: float
    cap: float | None
    at_cap: bool


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
    """What to do about a plan on a given day: buy now, scheduled buys, things to watch, and skips."""

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
