# Round 1 video script

- **Length:** target **2:25**, never over **3:00**. The VoyageHack 4.0 length rule wasn't found
  online, so check the Unstop submission page before recording. If the limit is 2:00, drop the
  lines marked *(cut if 2:00)*. That takes it to about 2:00.
- **Words:** about 365 spoken words at roughly 150 words a minute. Read each section aloud with a
  timer once.
- **Every number** comes from `docs/numbers.md`. When a simulated number is on screen, say "simulated".
- **Present tense only for what's built.** Ingest, ClickHouse, Postgres, Redis and the dashboard are Round 2.
- **Speakers** are a suggestion. Swap freely.

| Time | On screen | Speaker | Part |
|---|---|---|---|
| 0:00 – 0:15 | Slide 1, cover (ghost bars) | Vinochan | Hook |
| 0:15 – 0:35 | Slide 2, problem panel | Vinochan | Problem |
| 0:35 – 1:00 | Buy Desk mockup, full screen | Gourab | Solution |
| 1:00 – 1:30 | Slide 2, impact chart and the three numbers | Priyanshu | Proof |
| 1:30 – 1:55 | Slide 3, architecture | Priyanshu | Tech |
| 1:55 – 2:20 | Slide 3, shadow mode; then slide 2, money | Vinochan | Adoption + money |
| 2:20 – 2:25 | Slide 4, thank-you | Vinochan | Close |

---

### 1. Hook (0:00 – 0:15) · Vinochan · slide 1
> A travel agent searches TBO for a Goa hotel over Christmas week. It's sold out, so the agent
> books elsewhere. That search never becomes a booking, so next year TBO's history says the
> demand never existed. Voyance counts it back in.

### 2. Problem (0:15 – 0:35) · Vinochan · slide 2, problem panel
> TBO buys hotel rooms ahead of peak dates, sized from booking history. But that history stops at
> the sold-out line. So buyers under-buy exactly the dates that sell out, and overspend on quiet
> weeks. *(cut if 2:00)* Hotels and ancillaries are two-thirds of TBO's sales, growing
> thirty-nine percent year on year, so these buys matter.

### 3. Solution (0:35 – 1:00) · Gourab · Buy Desk mockup
> Here's the Buy Desk design. A buyer sets a budget and a risk level. Voyance returns a ranked buy
> list: which hotel, which week, how many rooms and the expected profit, *(cut if 2:00)* with the
> plan's worst case on top. Every line says why, like "two thousand sold-out searches, plus an
> event week". And a second person approves every line before any money moves.

### 4. Proof (1:00 – 1:30) · Priyanshu · slide 2, impact chart
> We tested it on twenty simulated markets in five Indian cities, each replayed over five hundred
> Decembers. Against re-buying past bookings, Voyance earns fourteen percent more expected profit
> on a tight budget. On a generous one, it skips rooms that would go unsold: a sixteen percent
> better worst case. And it earns twelve percent more than the same optimizer without hidden
> demand. That's what our idea adds. All simulated, not TBO data.

### 5. Tech (1:30 – 1:55) · Priyanshu · slide 3, architecture
> Today, a Python engine counts hidden demand, adds event weeks and runs a budget optimizer that
> weighs profit against the worst five percent of outcomes. One plan takes a fifth of a second on
> a laptop. The Buy Desk API is built, with roles, approvals, an audit log and seventy-two passing
> tests. In Round 2, a Go collector streams TBO's search events, sold-outs included.

### 6. Adoption and money (1:55 – 2:20) · Vinochan · slide 3, shadow mode, then slide 2, money
> *(cut if 2:00)* TBO doesn't have to trust it on day one. Voyance runs in shadow mode for a season
> beside TBO's buyers, then goes live one city at a time. It earns three ways: margin for TBO,
> Peak Access for TBO's agencies on sold-out dates, and a white-label version for tour operators,
> paid by a share of the profit it adds.

### 7. Close (2:20 – 2:25) · Vinochan · slide 4
> Voyance sees hotel demand before it sells out. Thank you.

---

## Recording checklist
- Run the slides full screen at 1920×1080. Record in PowerPoint (Slide Show → Record) or with OBS.
  Each speaker records their part, or one person narrates all of it.
- Section 3: Gourab's mockup full screen. If it isn't ready, zoom into the Buy Desk sketch on slide 2.
  Its rows are real API output.
- Section 4: zoom into slide 2's chart. Don't use `out/proof_chart.png` until its caption is
  updated: it says "20 December seasons", but the test is 20 markets × 500 Decembers.
- Quiet room, a headset mic, and a 1-second pause between sections. That makes the cuts clean.
- Export MP4 (H.264, 1080p). Check the length and file-size limit on the Unstop page.
- Before uploading, watch it once end to end:
  - every simulated number is called simulated;
  - nothing unbuilt is described as running;
  - no number differs from `docs/numbers.md`;
  - it's under the time limit.
