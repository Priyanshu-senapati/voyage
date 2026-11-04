"""API-key auth. Keys belong to a person (user) at a company (tenant); the person has one role.
Only key hashes are stored, and keys can be revoked."""

import hashlib
import secrets
from collections.abc import Callable, Iterator
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.orm import Session

from voyance.api.db import ApiKey, Tenant, User, utcnow

ROLES = ("buyer", "approver", "admin")
_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


@dataclass(frozen=True)
class Principal:
    tenant_id: int
    role: str
    label: str      # the person's name, shown in plans and the audit log
    user_id: int    # identity for rules like "nobody approves their own plan"


def hash_key(key: str) -> str:
    # SHA-256 is enough here: keys are 256-bit random tokens, not guessable passwords
    return hashlib.sha256(key.encode()).hexdigest()


def normalise_name(name: str) -> str:
    cleaned = " ".join(name.split()).casefold()
    if not cleaned:
        raise ValueError("name must not be empty")
    return cleaned


def create_api_key(session: Session, tenant_name: str, role: str, name: str) -> str:
    """Issue a new key for a person, creating the company and person if needed. Shown once."""
    if role not in ROLES:
        raise ValueError(f"role must be one of {ROLES}")
    tenant = session.scalar(select(Tenant).where(Tenant.name == tenant_name))
    if tenant is None:
        tenant = Tenant(name=tenant_name)
        session.add(tenant)
        session.flush()
    user_name = normalise_name(name)
    user = session.scalar(select(User).where(User.tenant_id == tenant.id, User.name == user_name))
    if user is None:
        user = User(tenant_id=tenant.id, name=user_name, role=role)
        session.add(user)
        session.flush()
    elif user.role != role:
        raise ValueError(f"{user_name} is already a {user.role} at {tenant_name}")
    key = f"vy_{secrets.token_urlsafe(32)}"
    session.add(ApiKey(user_id=user.id, key_hash=hash_key(key)))
    session.commit()
    return key


def revoke_api_key(session: Session, key: str) -> bool:
    """Stop a key working. Returns False if the key is unknown or already revoked."""
    row = session.scalar(select(ApiKey).where(ApiKey.key_hash == hash_key(key), ApiKey.revoked_at.is_(None)))
    if row is None:
        return False
    row.revoked_at = utcnow()
    session.commit()
    return True


def get_session(request: Request) -> Iterator[Session]:
    with request.app.state.sessions() as session:
        yield session


def get_principal(key: str | None = Depends(_key_header),
                  session: Session = Depends(get_session)) -> Principal:
    user = session.scalar(
        select(User).join(ApiKey, ApiKey.user_id == User.id)
        .where(ApiKey.key_hash == hash_key(key), ApiKey.revoked_at.is_(None))
    ) if key else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing or invalid API key",
                            headers={"WWW-Authenticate": "APIKey"})
    return Principal(tenant_id=user.tenant_id, role=user.role, label=user.name, user_id=user.id)


def require_role(*roles: str) -> Callable[..., Principal]:
    def check(principal: Principal = Depends(get_principal)) -> Principal:
        if principal.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"needs role: {' or '.join(roles)}")
        return principal
    return check
