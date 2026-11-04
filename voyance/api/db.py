"""Storage: SQLite for the demo; any SQLAlchemy URL (e.g. Postgres) in production."""

from datetime import UTC, datetime

from sqlalchemy import (JSON, DateTime, ForeignKey, String, Text, TypeDecorator, UniqueConstraint,
                        create_engine, event)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker
from sqlalchemy.pool import StaticPool


def utcnow() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator):
    """Always UTC-aware. SQLite drops time zones, so they are re-attached on read."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        return value.astimezone(UTC) if value is not None and value.tzinfo else value

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        return value.replace(tzinfo=UTC) if value is not None and value.tzinfo is None else value


class Base(DeclarativeBase):
    pass


class Tenant(Base):
    __tablename__ = "tenants"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)


class User(Base):
    """A person at a company. One person can hold several keys (rotation), never two names."""

    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("tenant_id", "name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"))
    name: Mapped[str] = mapped_column(String(100))  # normalised: trimmed, lower case
    role: Mapped[str] = mapped_column(String(20))


class ApiKey(Base):
    __tablename__ = "api_keys"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class Plan(Base):
    __tablename__ = "plans"
    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_by: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    budget_inr: Mapped[float]
    risk_aversion: Mapped[float]
    cities: Mapped[list[str] | None] = mapped_column(JSON)
    spend: Mapped[float]
    expected_profit: Mapped[float]
    worst_case_profit: Mapped[float]
    lines: Mapped[list["PlanLineRow"]] = relationship(
        back_populates="plan", order_by="PlanLineRow.id", cascade="all, delete-orphan")

    @property
    def status(self) -> str:
        if not self.lines:
            return "empty"
        decisions = {line.decision for line in self.lines}
        if "pending" in decisions:
            return "pending"
        return decisions.pop() if len(decisions) == 1 else "mixed"


class PlanLineRow(Base):
    __tablename__ = "plan_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id"), index=True)
    city: Mapped[str] = mapped_column(String(50))
    week: Mapped[str] = mapped_column(String(20))
    hotel: Mapped[str] = mapped_column(String(100))
    rooms: Mapped[int]
    unit_cost: Mapped[float]
    unit_price: Mapped[float]
    expected_sold: Mapped[float]
    expected_profit: Mapped[float]
    reason: Mapped[str] = mapped_column(Text)
    decision: Mapped[str] = mapped_column(String(10), default="pending")
    decided_by: Mapped[str | None] = mapped_column(String(100))
    decided_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    plan: Mapped[Plan] = relationship(back_populates="lines")

    @property
    def sell_through(self) -> float:
        return self.expected_sold / self.rooms


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), index=True)
    actor: Mapped[str] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(40))
    target: Mapped[str] = mapped_column(String(100))
    at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


def make_sessions(database_url: str) -> sessionmaker:
    """Session factory for the URL; creates tables if missing."""
    # shortcut: create_all instead of migrations; add Alembic before the schema has real data to keep.
    kwargs: dict = {}
    in_memory = database_url in ("sqlite://", "sqlite:///:memory:")
    if database_url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
        if in_memory:
            kwargs["poolclass"] = StaticPool  # one shared in-memory database (tests)
    engine = create_engine(database_url, **kwargs)
    if database_url.startswith("sqlite"):
        _sqlite_pragmas(engine, wal=not in_memory)
    Base.metadata.create_all(engine)
    return sessionmaker(engine, expire_on_commit=False)


def _sqlite_pragmas(engine, wal: bool) -> None:
    @event.listens_for(engine, "connect")
    def on_connect(dbapi_connection, _record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        if wal:  # readers don't block the writer
            cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()
