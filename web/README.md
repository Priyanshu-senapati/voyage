# Voyance dashboard (web)

React + Vite + TypeScript. Lane B (Product) owns this folder.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check and build to dist/
npm run lint
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
