# Hosted demo

One container runs the Voyance API and the built dashboard on one origin (`Dockerfile`). On every start
`start.py` deletes the demo database and seeds the four demo people again; `server.py` adds a per-network
rate limit, security headers, and `/config.js`, which gives the sign-in page its "sign in as" keys.

**The demo keys are public.** Anyone can approve plans and read the audit log in TBO Demo. Never put real data in
a hosted demo.

## Google Cloud Run

```bash
gcloud auth login                         # once
gcloud config set project <project-id>    # a project with billing on
deploy/cloudrun.sh                        # builds in Cloud Build and deploys; prints the URL
```

- Runs one instance at most, because the demo database and the rate limits live in its memory.
- Sized for the free tier: 512 MiB, CPU billed only while a request runs, no startup boost, scale to zero, and only
  the newest image kept. `asia-south1` (Mumbai) is a Tier 1 region. Only committed files are uploaded.
- Scales to zero when idle. The first visit after that takes a few seconds and starts from fresh demo data.
- The demo keys stay the same across redeploys. Set `VOYANCE_DEMO_KEY_ASHA` (and `_RAVI`, `_MEERA`, `_ZED`)
  before running the script to rotate them.
- `REGION` (default `asia-south1`) and `SERVICE` (default `voyance`) change where it goes.

## Locally, without Docker

```bash
cd web && npm run build && cd ..
PORT=8080 python deploy/start.py           # http://localhost:8080
python -m pytest deploy                    # server tests
cd e2e && E2E_BASE_URL=http://localhost:8080 npx playwright test   # needs the keys from e2e/keys.ts set
```

## Limits

| Path | Per network, per minute |
|---|---|
| `GET /v1/frontier` | 6 |
| `POST /v1/plans/preview` | 60 |
| `POST /v1/plans` | 10 |
| everything else under `/v1/` | 300 |

The client address is the rightmost `X-Forwarded-For` entry (the one the platform adds). `VOYANCE_PROXY_HOPS` sets
how many trusted proxies sit in front.
