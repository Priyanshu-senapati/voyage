"""Request and response shapes. These are the API contract the dashboard builds against."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

City = Annotated[str, Field(min_length=1, max_length=50)]
Decision = Literal["pending", "approved", "rejected"]
PlanStatus = Literal["empty", "pending", "approved", "rejected", "mixed"]


class ErrorOut(BaseModel):
    detail: str


class PlanCreate(BaseModel):
    model_config = ConfigDict(json_schema_extra={
        "examples": [{"budget_inr": 2_000_000, "risk_aversion": 0.3, "cities": ["Goa", "Udaipur"]}]})
    budget_inr: float = Field(gt=0, le=1e10, description="Maximum spend in INR (up to ₹1,000 crore)")
    risk_aversion: float = Field(0.3, ge=0, le=1,
                                 description="0 = maximise expected profit, 1 = protect the worst case")
    cities: list[City] | None = Field(None, min_length=1, max_length=50,
                                      description="Limit to these cities; leave out for all")


class LineDecision(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"decision": "approved"}]})
    decision: Literal["approved", "rejected"]


class PlanLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    city: str
    week: str
    hotel: str
    rooms: int
    unit_cost: float
    unit_price: float
    expected_sold: float
    sell_through: float
    expected_profit: float
    reason: str
    decision: Decision
    decided_by: str | None
    decided_at: datetime | None


class PlanSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    created_by: str
    budget_inr: float
    risk_aversion: float
    cities: list[str] | None
    spend: float
    expected_profit: float
    worst_case_profit: float
    status: PlanStatus


class PlanOut(PlanSummary):
    lines: list[PlanLineOut]


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
