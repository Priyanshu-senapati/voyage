# Brief: Voyance decks (Round 1, reused for Round 2)

## Concept
**The ghost bar.** Demand above the "sold out" line is drawn as a dashed outline on top of a
solid bookings bar. It's the demand booking data hides and Voyance sees. It appears large on the
cover and small wherever hidden demand is explained.

## Palette (hex, no #)
- **Dominant ground:** `12141C` ink on the cover and thank-you; `FFFFFF` on content slides, so the
  white proof chart sits flush.
- **Supporting:**
  - `F3F4F7` card tint
  - `5B6070` muted text
  - `D9DCE3` hairlines
- **Accents:**
  - `2A78D6` = **Voyance / our planner**. It matches the "Our planner" line in `out/proof_chart.png`.
    Use it for shapes, big numbers and the ghost bar only, never for small text (4.4:1 on white).
  - `EB6834` = **status quo / sold out**. It matches "Repeat past bookings" in the chart. Use it
    only for the sold-out line and baseline mentions.
  - `1BAF7A` = **our optimizer without hidden demand**. Chart lines only.
- **Text:** ink `12141C` on white, `FFFFFF` on ink.
- **Ground pattern:** sandwich. Dark cover and close, light content.

## Type
- **Calibri throughout:** bold for headings, regular for body. It's on the safe list and matches
  the chart's clean sans.
- **Sizes:**
  - Titles 30pt, one line, no subtitle.
  - Section labels 11pt bold caps, spaced.
  - Body 14–15pt, captions 10.5–13pt.
  - Big numbers 34–36pt.
- **Clean:** four zones per slide at most, one idea each. Detail goes in the speaker notes or `docs/numbers.md`.

## Motif
The ghost bar, plus numbered circles in `2A78D6` for short lists.
Pipeline stages: grey cards when built, a dashed outline when they're Round 2.
No colour bars, stripes or title underlines. A hairline may split a slide's top and bottom halves.

## Slide map (Round 1)
| # | Message | Layout | Visual |
|---|---|---|---|
| 1 | Voyance sees hotel demand before it sells out | Dark cover, text left, ghost-bar chart right | Large ghost-bar December chart |
| 2 | Sold-out dates hide the demand TBO buys for | Top: problem statement + what goes wrong / ghost bar. Bottom: why we chose it / real-world impact | Ghost bar with labels, 2 big numbers |
| 3 | Voyance turns hidden demand into an approved buy list | Top: demo GIF / 3 impact numbers. Bottom: 5-step "How it works" pipeline (the architecture) | Live Buy Desk GIF, pipeline |
| 4 | Thank you | Dark close | Ghost bar small; links to the demo, the code and `docs/numbers.md` |

## Motion
One looping GIF on slide 3: the live Buy Desk, so the slide needn't describe it in words. PowerPoint plays it in
the slideshow; the PDF shows its first frame, which has its own caption. Nothing else moves.
