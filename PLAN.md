# TBO VoyageHack 4.0 — Problem #1: Inventory Optimization

## What we're building
A decision tool for TBO. Input: a **budget** and a **risk level**. Output: a ranked **buy list**:
which hotel, which dates, how many rooms, buy by when, sell at what price, expected profit,
worst-case loss, and the reason for each pick.

What makes it different:
1. **Hidden demand**: searches that hit "sold out" are customers who never show up in booking
   data. We count them back in.
2. **Event signals**: festivals, matches, concerts and long weekends flag demand spikes early.
3. **Budget as a portfolio**: every buy has an expected profit and a chance of going unsold.
   We pick the best mix for the chosen risk level.
4. **Plain-language reasons**, plus a replay of last December showing what the plan would have caught.

## Product shape: B2B SaaS
Working name: **PreBuy** (research team picks the final name).

| Module | User | What it does | How it makes money |
|---|---|---|---|
| **Buy Desk** (core, the problem statement) | TBO contracting + revenue team | Budget + risk in → ranked buy list: hotel, dates, rooms, buy-by date, selling price, expected profit, worst case, reasons. A buyer approves every line. | Internal value: margin uplift, fewer unsold rooms, more rooms to sell on sold-out dates (GTV) |
| **Peak Access** | Travel agencies (TBO's 32,751 monthly transacting buyers) | Guaranteed rooms on sold-out dates from TBO's pre-bought pool | Premium per booking, or a paid tier |
| **White-label** | Other bedbanks, DMCs, wholesalers | Buy Desk as SaaS | Platform fee + success fee = % of profit uplift, measured against a "re-buy past bookings" holdout. Our evaluation code already measures this. |
| **Demand Radar** (stretch) | Hotel suppliers | Anonymised demand signals ("3x more sold-out searches than rooms") | Subscription; also wins TBO bigger allotments at better rates |

Scale anchors for the money slide (verify from TBO's filings): FY26 GTV ₹36,809 cr (+19%),
revenue ₹2,677.5 cr, 32,751 monthly transacting buyers, Hotels + Ancillaries the fastest-growing segment.

### Architecture (slide 2)
The busy path is collecting search events, not the optimizer: the optimizer runs once per planning
cycle and takes under 1 s per city-month, so cities run in parallel.
1. **Ingest (Go):** TBO search + booking events (including sold-out results), TBO Hotel API (content,
   rates, availability; re-check availability before buying), event + holiday calendars. Goroutine
   worker pool with per-supplier rate limits, into Kafka/Redpanda.
2. **Store:** ClickHouse for search/booking events (look-to-book per hotel-week), Postgres for tenants,
   plans, approvals and audit log, Redis for the rate/availability cache (short TTL, cleared on price changes).
3. **Decision engine (Python workers, one job per city-month):** hidden demand → event separation →
   demand range forecast → budget optimizer (HiGHS) → price tiers → reasons.
4. **SaaS layer (FastAPI):** multi-tenant REST API + webhooks, roles (buyer, approver, admin), API keys,
   audit log, human approval on every buy, Slack/email alerts before buy-by dates.
5. **Dashboard (Gourab)** + optional copilot: plain-English what-ifs ("What if Goa demand jumps 20% for
   a festival?") turned into a structured scenario by a small LLM, then run through the optimizer.

**Adoption risk fix:** shadow mode first. Run beside the human buyers for one season, compare, then go
live one city at a time.

## Team
| Who | Owns |
|---|---|
| Priyanshu | Backend + prototype: data, hidden demand, forecast, optimizer, API. Round 1 proof chart. |
| Gourab | Frontend (dashboard) from Round 2. Picks Streamlit vs React by 26 Nov. |
| Research + QA (2 people) | Impact numbers, event list per city, slide content, video scripts; testing and bug hunting. |

## Key dates
| Date | What |
|---|---|
| 5 Nov, 5:30 PM IST | Mandatory webinar (MS Teams app, join through the confirmation link) |
| 19 Nov (deadline 20 Nov) | Round 1: 2-slide PPT + video |
| 26 Nov – 23 Dec (deadline 24 Dec) | Round 2: 10-slide PPT + GitHub code + docs + video |
| 8 Jan 2027 | Grand Finale |

## Phase 0: Webinar (5 Nov)
Ask:
1. Will TBO provide data (bookings, searches incl. sold-out results, cancellations, procurement
   prices)? Size, date range, when?
2. Is "pre-buy" a non-refundable prepaid purchase, or an allotment you can release back before a
   cut-off? Typical windows and penalties?
3. Are flights in scope, or is hotels-only acceptable?
4. Can teams get TBO Hotel API sandbox credentials, or should we build against a mock?

Also note what they say about judging, video length and slide templates.

## Phase 1: Round 1 (6–19 Nov)
| # | Task | Owner | Dates |
|---|---|---|---|
| 1 | Impact numbers with sources: TBO's scale, cost of sold-out dates and unsold rooms | Research | 6–8 Nov |
| 2 | Slide content. Slide 1: problem + innovation + impact + monetisation (TBO numbers, success-fee model). Slide 2: architecture diagram + tech stack + scalability + adoption risk (shadow mode) | Research, Priyanshu reviews | 8–10 Nov |
| 3 | Proof chart: small simulation, our plan vs a naive plan, clearly labelled as simulated | Priyanshu | 9–12 Nov |
| 4 | Deck design (cover, 2 slides, thank-you) + product name | Research | 11–13 Nov |
| 5 | Video script + recording | Research + all | 16–18 Nov |
| 6 | **Submit** | Priyanshu | 19 Nov |

Round 1 draft must be done by 12 Nov (UGREEN is due 15 Nov).

## Phase 2: Gap week (21–25 Nov)
Light prep only: set up the repo, start the data generator, read up on how airlines correct for
sold-out demand.

## Phase 3: Round 2 prototype (26 Nov – 23 Dec)
**Five parts:**
1. **Data**: TBO's data if given. If not, generated data tuned on the public Kaggle "Hotel booking
   demand" dataset (~119k real bookings, CC BY 4.0), Indian holidays (`holidays` library), and a
   hand-built event list for ~5 cities.
2. **Hidden demand**: true demand = bookings + demand lost to sold-out searches (airline
   revenue-management method).
3. **Forecast**: LightGBM gives a demand range (low / likely / high) per hotel and date.
   SHAP explains the drivers.
4. **Optimizer**: linear program (scipy's built-in HiGHS solver, no extra dependency). Maximize
   profit within budget, with a risk term that limits the loss in the worst 5% of outcomes.
   Selling price chosen from a few tiers. First version done: `prebuy/optimizer.py`.
5. **App**: FastAPI backend + dashboard with budget and risk sliders, buy list, "why" panel, December
   replay. Optional: small LLM rewrites reasons in plain English, with templates as fallback.

| Week | Goal | Owner |
|---|---|---|
| 26 Nov – 2 Dec | Data, hidden demand, event calendar. **API contract (sample JSON) published for Gourab** | Priyanshu; Research (events) |
| 3 – 9 Dec | Forecast + optimizer v1 + tests | Priyanshu; QA |
| 10 – 16 Dec | Dashboard against the API, replay vs simple rules. SaaS layer: login + roles, approval flow, audit log, webhooks, CSV export, mock TBO Hotel API adapter. Go ingest service + load test (measured events/sec) | Gourab + Priyanshu |
| 17 – 23 Dec | Polish, README, 10-slide deck, video. **Submit 23 Dec** | All |

**Tests**: the budget is never exceeded; a zero budget means zero buys; more risk aversion never
raises expected profit and never lowers the worst case; the forecast is scored on held-out data;
the replay uses a fixed random seed.

## Phase 4: Finale prep (24 Dec – 8 Jan)
Deploy to a URL, rehearse the demo, record a backup video, build a bank of likely judge questions.

## Risks
| Risk | Likelihood | Fix |
|---|---|---|
| TBO gives no data | High | Generated data tuned on real public data, said openly; built so TBO's data plugs in |
| Scope creep (flights, suppliers) | High | Hotels only, ~5 cities; the rest goes on a "next steps" slide |
| Judges see "just a forecast" | Medium | Lead with money at risk and hidden demand, not model accuracy |
| December exams / holidays | Unknown | Check everyone's calendar now |
| Frontend starts late | Medium | API contract by 2 Dec so Gourab can build against sample data |
| Optimizer too slow | Low | Problem this size solves in seconds |
