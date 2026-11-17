# Round 1 video script

- **Length:** target **2:30**, never over **3:00**. The VoyageHack 4.0 length rule wasn't found
  online, so check the Unstop submission page before recording. If the limit is 2:00, cut the
  lines marked *(cut if 2:00)*.
- **Pace:** about 150 words a minute. This script is about 390 words.
- **Every number** comes from `docs/numbers.md`. When a simulated number is on screen, say "simulated".
- **Speakers** are a suggestion. Swap freely.

| Time | On screen | Speaker | Words |
|---|---|---|---|
| 0:00 – 0:15 | Cover (ghost bars) | Vinochan | Hook |
| 0:15 – 0:40 | Slide 1, left: the problem | Vinochan | Problem |
| 0:40 – 1:10 | Buy Desk mockup (full screen) | Gourab | Solution |
| 1:10 – 1:40 | Proof chart (full screen) + slide 1 stats | Priyanshu | Proof |
| 1:40 – 2:05 | Slide 2: architecture | Priyanshu | Tech |
| 2:05 – 2:25 | Slide 2: shadow mode; slide 1: money | Vinochan | Adoption + money |
| 2:25 – 2:30 | Thank-you slide | Vinochan | Close |

---

### 1. Hook (0:00 – 0:15) · Vinochan · cover
> A traveller searches for a hotel in Goa for Christmas week. It's sold out, so they leave.
> That search never becomes a booking. And next year, TBO's booking history says that customer
> never existed. We built Voyance to count them back in.

### 2. Problem (0:15 – 0:40) · Vinochan · slide 1, problem panel
> TBO buys hotel rooms ahead of peak dates, and it sizes those buys from booking history. But
> that history stops at the sold-out line. So buyers under-buy exactly the dates that sell out,
> and overspend on quiet weeks. Hotels are two-thirds of everything TBO sells, and growing
> thirty-nine percent a year, so getting these buys right is worth a lot.

### 3. Solution (0:40 – 1:10) · Gourab · Buy Desk mockup
> This is the Buy Desk. A buyer sets a budget and a risk level. Voyance returns a ranked buy
> list: which hotel, which dates, how many rooms, buy by when, the expected profit and the worst
> case. Every line comes with a reason in plain words, like "sold-out searches last year, plus
> a festival that week". And a buyer approves every line before any money moves.
> *(cut if 2:00)* Under it are four ideas: count hidden demand, read event signals, treat the
> budget as a portfolio, and explain every pick.

### 4. Proof (1:10 – 1:40) · Priyanshu · proof chart
> We tested it on twenty simulated December seasons across five Indian cities. Simulated, and
> we say so on every chart. Against simply re-buying last year's bookings, Voyance makes
> fourteen percent more expected profit when the budget is tight. When the budget is generous,
> it stops buying rooms that would go unsold: a sixteen percent better worst case and a third
> fewer unsold rooms. Splitting the budget evenly loses money. *(cut if 2:00)* And the cautious
> risk setting earned as much as the bolder one or more at almost every budget, so the risk
> slider pays for itself.

### 5. Tech (1:40 – 2:05) · Priyanshu · slide 2, architecture
> Under the hood, a Go service ingests TBO's search and booking events, including the sold-out
> ones. A Python engine runs one job per city-month: hidden demand, event lift, a demand range,
> then a budget optimizer that caps the worst five percent of outcomes. Planning a whole
> December for five cities takes under a second. The Buy Desk API is already built, with roles,
> approvals, an audit log and seventy-two passing tests.

### 6. Adoption and money (2:05 – 2:25) · Vinochan · slide 2, shadow mode, then slide 1, money
> TBO doesn't have to trust it on day one. Voyance runs in shadow mode for a season beside
> TBO's buyers, then goes live one city at a time. It earns three ways: margin for TBO, Peak
> Access for TBO's agencies on sold-out dates, and a white-label version for other
> distributors, paid by a share of the profit it adds.

### 7. Close (2:25 – 2:30) · Vinochan · thank-you slide
> Voyance sees hotel demand before it sells out. Thank you.

---

## Recording checklist
- Run the slides full screen at 1920×1080. Record in PowerPoint (Slide Show → Record) or with OBS.
  Each speaker records their part, or one person narrates all of it.
- Gourab's mockup goes full screen for section 3. Put `out/proof_chart.png` full screen for section 4.
- Quiet room, a headset mic, and a 1-second pause between sections. That makes the cuts clean.
- Export MP4 (H.264, 1080p). Check the length and file-size limit on the Unstop page.
- Before uploading, watch it once end to end:
  - every simulated number is called simulated;
  - no number differs from `docs/numbers.md`;
  - it's under the time limit.
