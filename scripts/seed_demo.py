"""Create demo companies and API keys. Each key is printed once; only its hash is stored.

Run from the project root:  python scripts/seed_demo.py
Uses PREBUY_DATABASE_URL if set, else sqlite:///prebuy.db (same default as the API).
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from prebuy.api.auth import create_api_key  # noqa: E402
from prebuy.api.db import make_sessions  # noqa: E402

DEMO_USERS = (
    ("TBO Demo", "buyer", "asha"),
    ("TBO Demo", "approver", "ravi"),
    ("TBO Demo", "admin", "meera"),
    ("Other Distributor", "admin", "zed"),  # proves one company can't see another's plans
)


def main() -> None:
    sessions = make_sessions(os.environ.get("PREBUY_DATABASE_URL", "sqlite:///prebuy.db"))
    with sessions() as session:
        for tenant, role, label in DEMO_USERS:
            key = create_api_key(session, tenant, role, label)
            print(f"{tenant:<18} {role:<9} {label:<6} {key}")  # shown once: copy it now


if __name__ == "__main__":
    main()
