# Round 2 deck

`voyance_round2.pptx` — the Round 2 pitch deck. **4 slides at 16:9**: Title → Problem → Product → Thank-you (two content slides between the cover and the close).

| File | What it is |
|---|---|
| `voyance_round2.pptx` | The deck we submit. Fonts are **embedded** and it carries **Morph transitions**, so it opens true-to-design on any machine |
| `build_round2.js` | Builds the base `.pptx` with pptxgenjs (edit wording/layout here, never by hand in PowerPoint) |
| `embed_round2.py` | Post-step: embeds the fonts + adds the Morph transitions (stdlib only) |
| `assets/round2/gif_buydesk.gif` | The live Buy Desk walkthrough (a clip of the product film) shown on the Product slide |
| `assets/round2/qr_video.png` | QR to the 2-minute demo film (team-provided) |
| `assets/round2/fonts/` | Space Grotesk + Plus Jakarta Sans (both **SIL OFL**, redistribution permitted) |

## Rebuild
```bash
cd deck
npm install          # once (pptxgenjs)
node build_round2.js # writes voyance_round2.pptx
python embed_round2.py   # embeds fonts + adds Morph, in place
```

## Notes for Lane C
- This is **Lane B's Round 2 draft** for your review — it does **not** touch the Round 1 build or `brief.md`. Fold it into the data-driven pipeline (reading `out/*.csv|json`) if you want it to track lane A's numbers automatically; right now the figures are written in `build_round2.js`.
- Every number is the Round 1 sourced set (TBO Tek Q2 FY27; walk-forward test on real 2017 bookings, Antonio et al. 2019) — see [`../docs/numbers.md`](../docs/numbers.md). Real vs simulated is labelled on the slides.
- **Morph needs PowerPoint 2019/365 or Keynote** to animate; Google Slides falls back to a fade.
- Design: Space Grotesk (display/numbers) + Plus Jakarta Sans (body), deep-navy cover/close, editorial index kickers, confident stat callouts, a `PROVEN …` proof chip.
