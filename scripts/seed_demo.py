"""Create demo companies and API keys. Each key is printed once; only its hash is stored.

Run from the project root:  python scripts/seed_demo.py
Uses VOYANCE_DATABASE_URL if set, else sqlite:///voyance.db (same default as the API).

Hosted demo: set VOYANCE_DEMO_KEY_ASHA, _RAVI, _MEERA and _ZED (32+ characters each, e.g.
python -c "import secrets; print('vy_' + secrets.token_urlsafe(32))") to use fixed keys instead of
random ones. Those keys are not printed, and running the script again with them changes nothing.
They are public on a hosted demo, so keep real data out of that database. A revoked fixed key stops the
script on purpose: set a new one.
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from voyance.api.auth import create_api_key  # noqa: E402
from voyance.api.db import make_sessions  # noqa: E402

DEMO_USERS = (
    ("TBO Demo", "buyer", "asha"),
    ("TBO Demo", "approver", "ravi"),
    ("TBO Demo", "admin", "meera"),
    ("Other Distributor", "admin", "zed"),  # proves one company can't see another's plans
)


def main() -> None:
    sessions = make_sessions(os.environ.get("VOYANCE_DATABASE_URL", "sqlite:///voyance.db"))
    with sessions() as session:
        for tenant, role, label in DEMO_USERS:
            env = f"VOYANCE_DEMO_KEY_{label.upper()}"
            fixed = os.environ.get(env) or None  # set but empty counts as unset
            key = create_api_key(session, tenant, role, label, key=fixed)
            print(f"{tenant:<18} {role:<9} {label:<6} {f'(from {env})' if fixed else key}")  # random: copy now


if __name__ == "__main__":
    main()
