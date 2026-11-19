# deck/

Pitch decks for TBO VoyageHack 4.0. Lane C owns this folder.

| File | What it is |
|---|---|
| `voyance_round1.pptx` | Round 1 deck: cover, 2 slides, thank-you. This is the file we submit |
| `voyance_round1.pdf` | The same deck as a PDF, for anyone without PowerPoint |
| `build_round1.js` | Builds the .pptx. Edit wording and layout here, never by hand in PowerPoint |
| `render.ps1` | Uses PowerPoint to export the PDF and one PNG per slide into `renders/`, for checking |
| `brief.md` | The visual rules: palette, type, the "ghost bar" motif. Round 2 reuses them |

Every number on a slide is listed, with its source, in [`docs/numbers.md`](../docs/numbers.md).
The build script reads its numbers from lane A's output files, so a re-run can't leave the slides behind:
- **the impact chart and stats** from `out/proof_results.csv`;
- **the real-data strip** from `out/decision_backtest.json` (the build stops if any 95% interval
  touches zero);
- **the real-bookings check** in the notes from `out/calibration.json`.

## Rebuild

```bash
cd deck
npm install                      # once
node build_round1.js             # writes voyance_round1.pptx
powershell -ExecutionPolicy Bypass -File render.ps1   # Windows + PowerPoint: PDF + renders/slide-N.png
```

## The Buy Desk screenshot (`assets/buy_desk_mockup.png`)
This is the live demo, captured on 19 Nov with lane B's script in its demo session (one simulated
December), then cropped to the plan header, the buy list and the line detail.

To re-capture after a dashboard change:

```bash
cd web && npm ci
CAPTURE_URL=https://voyance-1029341879804.asia-south1.run.app/ node scripts/capture.mjs <out-dir>
python -c "from PIL import Image; Image.open('<out-dir>/buy-desk.png').crop((520, 190, 2510, 1190)).save('../deck/assets/buy_desk_mockup.png')"
```

If the crop size changes, update `MOCKUP_RATIO` in `build_round1.js`. Keep the caption true: the
screen shows one simulated December, so its totals (₹24.7L expected) aren't the 20-market averages
on the chart. Without the PNG, the build draws a sketch from `docs/sample_plan_round1.json` instead.
