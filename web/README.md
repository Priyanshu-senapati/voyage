# Voyance dashboard (web)

React + Vite + TypeScript. Lane B (Product) owns this folder.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check and build to dist/
npm run lint
npm run gen:api      # refresh src/api/schema.d.ts from the running API's /openapi.json
```

## Against the real API

From the repo root, seed demo keys and start the API (port 8000):

```bash
python scripts/seed_demo.py                                   # prints keys for asha, ravi, meera, zed
uvicorn voyance.api.app:create_app --factory --port 8000
```

Then run `npm run dev` here and sign in with one of those keys. Vite forwards `/v1` to the API, so no CORS
setting is needed. Point it elsewhere with `VOYANCE_API=http://host:port npm run dev`.

- **Sign in** with an API key. It is kept in this tab's session storage only. "Open the demo" uses the saved fixture plan instead.
- **Create plan** runs the planner with the budget and risk sliders and saves the plan (30 per person per minute).
- **Approve / Reject** works for approvers and admins on someone else's plan. The API's refusals show as messages.
- **CSV** downloads the plan with the key sent in the header.

Without a `GET /v1/me` route the dashboard cannot know the signed-in name or role, so it shows the key's prefix.
Live "why" panels are rebuilt from the reason text and `/v1/markets`, until the API returns those fields.

## End-to-end tests

`../e2e` starts a throwaway API (fresh SQLite file, new demo keys) and this app, then signs in as each demo user:

```bash
cd ../e2e
npm install
npx playwright test        # uses your installed Chrome; PW_CHANNEL=chromium for Playwright's own
```

## Buy Desk mockup (Round 1)

`mockup/buy-desk.png` is the Buy Desk screen for the Round 1 deck and video: 1280x720 at 2x.
It shows Ravi (approver) reviewing Asha's ₹2 cr plan, with line 1 selected.

To regenerate it (uses the Chrome installed on your machine):

```bash
npm run build
npm run preview &                 # port 4173
node scripts/capture.mjs mockup   # writes buy-desk.png and buy-desk-phone.png
```

## Data

The screen currently reads `src/demo/plan-2cr.json`: a real plan from the engine
(demo world seed 7, ₹2 cr, risk 0.3, 40 lines), labelled as simulated on screen.
Who approved what in that file is demo state.

Each line's `why` block (expected demand, last December's bookings, sold-out searches per season,
event week, margin) is computed from the engine. The API does not return it yet; it only returns the
reason as text. `src/types.ts` mirrors `voyance/api/schemas.py` until types are generated from `/openapi.json`.
