# deck/

Pitch decks for TBO VoyageHack 4.0. Lane C owns this folder.

| File | What it is |
|---|---|
| `voyance_round1.pptx` | Round 1 deck: cover, problem, solution, thank-you. This is the file we submit |
| `voyance_round1.pdf` | The same deck as a PDF, for anyone without PowerPoint (the GIF shows as its first frame) |
| `build_round1.js` | Builds the .pptx. Edit wording and layout here, never by hand in PowerPoint |
| `render.ps1` | Uses PowerPoint to export the PDF and one PNG per slide into `renders/`, for checking |
| `teaser/` | Scripts that make the looping GIF of the live demo (`docs/demo-goa-christmas.gif`), used on slide 3 and in the repo README |
| `brief.md` | The visual rules: palette, type, the "ghost bar" motif, the slide map. Round 2 reuses them |

**Keep the two content slides clean.** Slide 2 is the problem: the statement, why we chose it, and what it's
worth. Slide 3 is the solution: the GIF, three impact numbers, and how it works. Each slide has four zones at
most. A new fact replaces an old one, and detail goes in the speaker notes or `docs/numbers.md`, which slide 4 links.

Every number on a slide is listed, with its source, in [`docs/numbers.md`](../docs/numbers.md).
The build script reads its numbers from lane A's output files, so a re-run can't leave the slides behind:
- **the simulated numbers** (+24% at ₹40L; +20% better bad season at ₹2 cr) come from `out/proof_study.json`;
- **the real-data numbers** (+7–13% profit; 35–46% fewer room-nights turned away) come from
  `out/decision_backtest.json`;
- **the real-bookings check** in the notes comes from `out/calibration.json`.

The build stops if any of those 95% intervals touches zero.

## Rebuild

```bash
cd deck
npm install                      # once
node build_round1.js             # writes voyance_round1.pptx
powershell -ExecutionPolicy Bypass -File render.ps1   # Windows + PowerPoint: PDF + renders/slide-N.png
```

## Demo GIF (`docs/demo-goa-christmas.gif`)
A 13 s loop of the live Buy Desk telling one story: Goa, Christmas week (22–28 Dec, Hotel B). 1,776 sold-out
searches, buy 85 rooms by 5 Aug, then a second person approves the line. It is slide 3's picture, replacing
the old screenshot and the dashboard bullets. The repo README opens on it too.
- PowerPoint plays it in the slideshow. The PDF and the renders show its first frame.
- The build reads it from `docs/` (one copy) and stops if it's missing.
- If you re-make it with different numbers, update `STORY` in `build_round1.js`.

To regenerate it (needs the installed Chrome and Python with Pillow):

```bash
cd deck
npm install                      # once; adds playwright-core, which uses the installed Chrome
node teaser/capture.mjs          # clicks through the hosted demo; writes renders/teaser/*.png + frames.json
python teaser/make_gif.py        # writes ../docs/demo-goa-christmas.gif (3 MB or less)
```

`capture.mjs` takes the captions' numbers (searches, rooms, buy-by date) from the screen, so they follow the data.
If the hosted demo is down, run `npm --prefix web run dev` in the repo root and pass its URL:
`TEASER_URL=http://localhost:5173/ node teaser/capture.mjs`. To change the story, wording or timing,
edit the steps in `capture.mjs` and the look (cursor, caption bar, colours) in `make_gif.py`.
