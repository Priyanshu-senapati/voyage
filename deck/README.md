# deck/

Pitch decks for TBO VoyageHack 4.0. Lane C owns this folder.

| File | What it is |
|---|---|
| `voyance_round1.pptx` | Round 1 deck: cover, 2 slides, thank-you. This is the file we submit |
| `voyance_round1.pdf` | The same deck as a PDF, for anyone without PowerPoint |
| `build_round1.js` | Builds the .pptx. Edit wording and layout here, never by hand in PowerPoint |
| `render.ps1` | Uses PowerPoint to export the PDF and one PNG per slide into `renders/`, for checking |
| `brief.md` | The visual rules: palette, type, the "ghost bar" motif. Round 2 reuses them |

Every number on a slide comes from [`docs/numbers.md`](../docs/numbers.md). Change it there first.

## Rebuild

```bash
cd deck
npm install                      # once
node build_round1.js             # writes voyance_round1.pptx
powershell -ExecutionPolicy Bypass -File render.ps1   # Windows + PowerPoint: PDF + renders/slide-N.png
```

## Adding Gourab's Buy Desk mockup
Save it as `deck/assets/buy_desk_mockup.png` (16:9 or wider) and rebuild. Slide 1 places it in
the "The Buy Desk" box, scaled to fit. Until then the slide shows a simple drawn sketch of the screen.
