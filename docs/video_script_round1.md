# Round 1 video script

- **Length:** target **2:30**, never over **3:00**. The VoyageHack 4.0 length rule wasn't found
  online, so check the Unstop submission page before recording. If the limit is 2:00, drop every
  sentence marked *(cut if 2:00)*: each marker cuts up to the next full stop. That takes it to about 2:00.
- **Words:** 386 spoken words, about 2:34 at 150 words a minute. With the cuts, 291 words, about
  1:56; that drops the risk-curve line too. Read each section aloud with a timer once.
- **Every number** comes from `docs/numbers.md`. When a simulated number is on screen, say "simulated".
- **Present tense only for what's built.** The engine, the API and the dashboard are built and live. Round 2:
  ingest (Go, Kafka), ClickHouse, Postgres, Redis, and feeding the forecast into the plans.
- **Speakers** are a suggestion. Swap freely.

| Time | On screen | Speaker | Part |
|---|---|---|---|
| 0:00 – 0:16 | Slide 1, cover (ghost bars) | Vinochan | Hook |
| 0:16 – 0:38 | Slide 2, problem panel | Vinochan | Problem |
| 0:38 – 1:10 | Live Buy Desk, screen recording | Gourab | Solution |
| 1:10 – 1:44 | Slide 2, impact chart and the three numbers, then the real-data strip | Priyanshu | Proof |
| 1:44 – 2:11 | Slide 3, architecture | Priyanshu | Tech |
| 2:11 – 2:30 | Slide 3, shadow mode; then slide 2, money | Vinochan | Adoption + money |
| 2:30 – 2:34 | Slide 4, thank-you | Vinochan | Close |

---

### 1. Hook (0:00 – 0:16) · Vinochan · slide 1
> A travel agent searches TBO for a Goa hotel over Christmas week. It's sold out, so the agent
> books elsewhere. That search never becomes a booking, so next year TBO's history says the
> demand never existed. Voyance counts it back in.

### 2. Problem (0:16 – 0:38) · Vinochan · slide 2, problem panel
> TBO buys hotel rooms ahead of peak dates, sized from booking history. *(cut if 2:00)* But that history
> stops at the sold-out line. So buyers under-buy exactly the dates that sell out, and overspend on quiet
> weeks. *(cut if 2:00)* Hotels and ancillaries are two-thirds of the value booked
> through TBO, growing thirty-nine percent a year, so these buys matter.

### 3. Solution (0:38 – 1:10) · Gourab · live Buy Desk
> This is the Buy Desk, running live. A buyer sets a budget and a risk level. Voyance returns a
> ranked buy list: hotel, week, rooms and expected profit. *(cut if 2:00)* Each line also has a
> buy-by date and its own bad-season profit. Every line says why: sold-out searches, an event week.
> *(cut if 2:00)* The risk curve shows what caution costs: here, twenty-five thousand rupees of
> expected profit buys one and a half lakh more in a bad season. A second person approves every line.

### 4. Proof (1:10 – 1:44) · Priyanshu · slide 2, impact chart
> In twenty simulated markets across five Indian cities, Voyance earns twenty-four percent more
> than re-buying past bookings on a tight budget, and a sixteen percent better worst case on a
> generous one. It earns twelve percent more than the same optimizer on raw bookings: that's
> what hidden demand and event weeks add. On real bookings from two hotels in Portugal, our new demand forecast, not yet in
> the planner, beat re-buying last year by seven to thirteen percent at every lead time we tried.

### 5. Tech (1:44 – 2:11) · Priyanshu · slide 3, architecture
> Today, a Python engine counts hidden demand, adds event weeks and runs a budget optimizer that
> weighs profit against the worst five percent of outcomes. *(cut if 2:00)* One plan takes a fifth
> of a second on a laptop. The API and the dashboard are built and live, with roles, approvals, an
> audit log and a hundred and seventy-nine passing tests. *(cut if 2:00)* In Round 2, a Go
> collector streams TBO's search events.

### 6. Adoption and money (2:11 – 2:30) · Vinochan · slide 3, shadow mode, then slide 2, money
> *(cut if 2:00)* TBO doesn't have to trust it on day one. Voyance runs in shadow mode for a season
> beside TBO's buyers, then goes live one city at a time. It earns three ways: margin for TBO, Peak
> Access for agencies on sold-out dates, and a white-label version for tour operators.

### 7. Close (2:30 – 2:34) · Vinochan · slide 4
> Voyance sees hotel demand before it sells out. Thank you.

---

## Recording checklist
- Run the slides full screen at 1920×1080. Record in PowerPoint (Slide Show → Record) or with OBS.
  Each speaker records their part, or one person narrates all of it.
- **Section 3 is a screen recording of the live demo**
  (https://voyance-1029341879804.asia-south1.run.app):
  - Show budget and risk, then the ranked list, then the why panel (buy-by date, bad-season profit).
  - Show the risk curve during the slider line, then approve a line as Ravi.
  - The demo database resets on every deploy, so open it fresh just before recording.
  - If the site is down, zoom into the screenshot on slide 2.
- **Section 4:** zoom into slide 2's chart, then the real-data strip under it. Don't use `out/proof_chart.png` until its caption is
  updated: it says "20 December seasons", but the test is 20 markets × 500 Decembers.
- Quiet room, a headset mic, and a 1-second pause between sections. That makes the cuts clean.
- Export MP4 (H.264, 1080p). Check the length and file-size limit on the Unstop page.
- Before uploading, watch it once end to end:
  - every simulated number is called simulated;
  - nothing unbuilt is described as running;
  - no number differs from `docs/numbers.md`;
  - it's under the time limit.
