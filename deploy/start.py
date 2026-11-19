"""Container entry point: a fresh demo database on every start, then the server.

The hosted demo's keys are public, so nothing in its database is worth keeping: each start deletes it and
seeds the four demo people again. Fixed keys come from VOYANCE_DEMO_KEY_ASHA, _RAVI, _MEERA and _ZED; any
that are missing are made up for this run (visitors just sign in again after a restart).
"""

import os
import secrets
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

DEMO_PEOPLE = ("asha", "ravi", "meera", "zed")


def main() -> None:
    db = Path(os.environ.get("VOYANCE_DB_PATH", "/tmp/voyance-demo.db"))
    os.environ["VOYANCE_DATABASE_URL"] = f"sqlite:///{db}"
    db.unlink(missing_ok=True)

    for name in DEMO_PEOPLE:
        env = f"VOYANCE_DEMO_KEY_{name.upper()}"
        if not os.environ.get(env):
            os.environ[env] = f"vy_{secrets.token_urlsafe(32)}"
    subprocess.run([sys.executable, str(ROOT / "scripts" / "seed_demo.py")], check=True, cwd=ROOT,
                   stdout=subprocess.DEVNULL)

    import uvicorn

    from deploy.server import build_app

    # one worker: the rate limits live in this process's memory
    uvicorn.run(build_app(), host="0.0.0.0", port=int(os.environ.get("PORT", "8080")), proxy_headers=False,
                server_header=False)


if __name__ == "__main__":
    main()
