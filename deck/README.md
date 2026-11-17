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
- **The impact chart and stats** are computed at build time from `out/proof_results.csv`, so they
  always match the latest simulation run.
- **The Buy Desk rows** come from `docs/sample_plan_round1.json`, real output of the API's planner.

## Rebuild

```bash
cd deck
npm install                      # once
node build_round1.js             # writes voyance_round1.pptx
powershell -ExecutionPolicy Bypass -File render.ps1   # Windows + PowerPoint: PDF + renders/slide-N.png
```

## Adding Gourab's Buy Desk mockup
Save it as `deck/assets/buy_desk_mockup.png` and rebuild. About 1.9:1 fits best, e.g. 1900×1000.
Slide 2 places it in "The Buy Desk" box, scaled to fit. Until then the slide shows a drawn sketch.

The caption under the box says the rows are real API output. Keep that true:
- Fill the mockup's rows from `docs/sample_plan_round1.json`.
- Show an approve control on each line.
- Don't show a buy-by date or a per-line worst case. The API doesn't return those yet.
