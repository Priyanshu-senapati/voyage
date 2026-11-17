// Builds deck/voyance_round1.pptx: cover, 2 content slides, thank-you (TBO VoyageHack 4.0, Round 1).
// Run from deck/:  npm install  then  node build_round1.js
// Every number here comes from docs/numbers.md. Change it there first, then here.
// If deck/assets/buy_desk_mockup.png exists it is placed on slide 1; otherwise a vector sketch is drawn.

const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");
const JSZip = require("jszip");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(__dirname, "voyance_round1.pptx");
const CHART = path.join(ROOT, "out", "proof_chart.png");
const CHART_ASPECT = 2000 / 1120; // out/proof_chart.png is 2000 x 1120 px
const MOCKUP = path.join(__dirname, "assets", "buy_desk_mockup.png");
const REPO = "https://github.com/Priyanshu-senapati/voyage";
const TEAM = "Priyanshu Senapati  ·  Gourab Dash  ·  Vinochan R";

// Palette (deck/brief.md). Blue = Voyance / our planner, orange = sold out / status quo,
// both matching the lines in out/proof_chart.png.
const INK = "12141C";
const WHITE = "FFFFFF";
const CARD = "F3F4F7";
const MUTED = "5B6070";
const HAIR = "D9DCE3";
const BAR = "C9CDD6";
const BLUE = "2A78D6"; // shapes and big numbers only
const BLUE_TEXT = "1F5FAF"; // small blue text on white (6.3:1)
const BLUE_TINT = "E6EFFA";
const BLUE_ON_INK = "6FA8EE"; // blue text on ink (7.5:1)
const ORANGE = "EB6834";
const ORANGE_TEXT = "B8471A"; // small orange text on white (5.3:1)
const ON_INK_MUTED = "A9AEBB";
const BAR_ON_INK = "3A3F4F";

const W = 13.333;
const M = 0.5; // side margin
const CW = W - 2 * M; // content width

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
pres.theme = { headFontFace: "Calibri", bodyFontFace: "Calibri" };
pres.author = "Voyance team";
pres.company = "Voyance team";
pres.title = "Voyance: TBO VoyageHack 4.0, Round 1";

pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: WHITE },
  objects: [
    {
      placeholder: {
        options: {
          name: "title", type: "title", x: M, y: 0.3, w: CW, h: 0.62,
          fontSize: 28, bold: true, color: INK, align: "left", valign: "middle", margin: 0,
        },
        text: "",
      },
    },
  ],
});
pres.defineSlideMaster({ title: "DARK", background: { color: INK }, objects: [] });

// ---------- helpers (each builds fresh option objects: pptxgenjs mutates them) ----------

function text(slide, value, opts) {
  slide.addText(value, Object.assign(
    { isTextBox: true, margin: 0, valign: "top", fontSize: 13, color: INK, fit: "none" }, opts));
}

function label(slide, value, x, y, w, onInk = false) {
  text(slide, value.toUpperCase(), {
    x, y, w, h: 0.24, fontSize: 10.5, bold: true, charSpacing: 1.5,
    color: onInk ? ON_INK_MUTED : MUTED, objectName: `label ${value}`,
  });
}

function numberDot(slide, n, x, y, d = 0.32) {
  slide.addText(String(n), {
    shape: pres.shapes.OVAL, x, y, w: d, h: d, fill: { color: BLUE }, line: { color: BLUE, width: 0.5 },
    color: WHITE, bold: true, fontSize: 12, align: "center", valign: "middle", margin: 0,
    objectName: `dot ${n}`,
  });
}

function card(slide, x, y, w, h, name, fill = CARD) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { color: fill, width: 0.5 }, objectName: name,
  });
}

// The motif: bookings as solid bars, capped at the sold-out line; the demand that hit "sold out"
// drawn as a dashed ghost on top. demand[] is in units of the cap (1 = sold out).
function ghostBars(slide, { x, y, w, h, demand, onInk = false, weeks = null, weekColor = MUTED, name = "ghost" }) {
  const labelH = weeks ? 0.32 : 0;
  const plotH = h - labelH;
  const n = demand.length;
  const bw = w / (n + 0.5 * (n - 1));
  const gap = bw * 0.5;
  const scale = plotH / (Math.max(...demand) * 1.04);
  const base = y + plotH;
  const capY = base - scale;
  demand.forEach((d, i) => {
    const bx = x + i * (bw + gap);
    const solidH = Math.min(d, 1) * scale;
    slide.addShape(pres.shapes.RECTANGLE, {
      x: bx, y: base - solidH, w: bw, h: solidH,
      fill: { color: onInk ? BAR_ON_INK : BAR }, line: { color: onInk ? BAR_ON_INK : BAR, width: 0.5 },
      objectName: `${name} bookings ${i + 1}`,
    });
    if (d > 1) {
      slide.addShape(pres.shapes.RECTANGLE, {
        x: bx, y: base - d * scale, w: bw, h: (d - 1) * scale,
        fill: { color: BLUE, transparency: onInk ? 70 : 82 },
        line: { color: onInk ? BLUE_ON_INK : BLUE, width: 1.5, dashType: "dash" },
        objectName: `${name} hidden ${i + 1}`,
      });
    }
    if (weeks) {
      text(slide, weeks[i], {
        x: bx - gap / 2, y: base + 0.08, w: bw + gap, h: 0.24, fontSize: 11, align: "center", color: weekColor,
      });
    }
  });
  slide.addShape(pres.shapes.LINE, {
    x: x - 0.08, y: capY, w: w + 0.16, h: 0,
    line: { color: ORANGE, width: 1.75, dashType: "sysDash" }, objectName: `${name} sold-out line`,
  });
  return { capY, base, top: base - Math.max(...demand) * scale, barW: bw, gap };
}

function sourceNote(slide, value) {
  text(slide, value, { x: M, y: 7.06, w: CW, h: 0.3, fontSize: 9.5, color: MUTED, valign: "bottom" });
}

// A stand-in for the Buy Desk screen until lane B's mockup PNG lands in deck/assets/.
function buyDeskSketch(slide, x, y, w, h) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.06, fill: { color: WHITE }, line: { color: HAIR, width: 1 }, objectName: "sketch frame",
  });
  text(slide, "Buy Desk", { x: x + 0.14, y: y + 0.1, w: 1.2, h: 0.2, fontSize: 10, bold: true });
  text(slide, "December · 5 cities", { x: x + w - 1.55, y: y + 0.11, w: 1.4, h: 0.2, fontSize: 8.5, color: MUTED, align: "right" });
  const lx = x + 0.14;
  const lw = w * 0.32;
  [["Budget", 0.7], ["Risk", 0.3]].forEach(([name, pos], i) => {
    const sy = y + 0.42 + i * 0.42;
    text(slide, name, { x: lx, y: sy, w: lw, h: 0.18, fontSize: 8.5, color: MUTED });
    slide.addShape(pres.shapes.LINE, { x: lx, y: sy + 0.27, w: lw, h: 0, line: { color: HAIR, width: 2 } });
    slide.addShape(pres.shapes.LINE, { x: lx, y: sy + 0.27, w: lw * pos, h: 0, line: { color: BLUE, width: 2 } });
    slide.addShape(pres.shapes.OVAL, {
      x: lx + lw * pos - 0.06, y: sy + 0.21, w: 0.12, h: 0.12, fill: { color: BLUE }, line: { color: WHITE, width: 1 },
    });
  });
  slide.addText("Plan", {
    shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: 0.05, x: lx, y: y + 1.33, w: lw, h: 0.26,
    fill: { color: BLUE }, line: { color: BLUE, width: 0.5 }, color: WHITE, bold: true, fontSize: 9,
    align: "center", valign: "middle", margin: 0,
  });
  const rx = x + 0.14 + lw + 0.2;
  const rw = x + w - 0.14 - rx;
  for (let i = 0; i < 4; i++) {
    const ry = y + 0.42 + i * 0.27;
    const hot = i === 0;
    slide.addShape(pres.shapes.RECTANGLE, {
      x: rx, y: ry, w: rw, h: 0.22, fill: { color: hot ? BLUE_TINT : CARD }, line: { color: hot ? BLUE_TINT : CARD, width: 0.5 },
    });
    text(slide, String(i + 1), { x: rx + 0.05, y: ry + 0.02, w: 0.14, h: 0.18, fontSize: 8, bold: true, color: hot ? BLUE_TEXT : MUTED });
    slide.addShape(pres.shapes.RECTANGLE, {
      x: rx + 0.24, y: ry + 0.08, w: rw * (0.55 - i * 0.07), h: 0.06, fill: { color: hot ? BLUE : BAR }, line: { color: hot ? BLUE : BAR, width: 0.5 },
    });
  }
  text(slide, "Why: last year's sold-out searches + a festival that week", {
    x: rx, y: y + 1.53, w: rw, h: 0.3, fontSize: 8.5, color: BLUE_TEXT, italic: true,
  });
}

// ---------- slide 0: cover ----------
{
  const s = pres.addSlide({ masterName: "DARK" });
  label(s, "TBO VoyageHack 4.0  ·  Problem 1: Inventory optimization", 0.8, 1.55, 6.6, true);
  text(s, "Voyance", { x: 0.8, y: 1.95, w: 6.4, h: 1.25, fontSize: 72, bold: true, color: WHITE, valign: "middle" });
  text(s, "Sees hotel demand before it sells out", { x: 0.8, y: 3.25, w: 6.6, h: 0.55, fontSize: 26, color: WHITE });
  text(s, "A pre-buy planner for TBO's hotel buyers. Budget and risk in; a ranked buy list out, with a reason for every line.", {
    x: 0.8, y: 4.0, w: 5.9, h: 0.75, fontSize: 15, color: ON_INK_MUTED,
  });
  text(s, TEAM, { x: 0.8, y: 6.2, w: 6.6, h: 0.3, fontSize: 14, color: WHITE });

  const gx = 7.9;
  const gw = 4.0;
  const g = ghostBars(s, {
    x: gx, y: 1.45, w: gw, h: 4.6, demand: [0.55, 0.78, 1.28, 1.62], onInk: true,
    weeks: ["1–7 Dec", "8–14", "15–21", "22–28"], weekColor: ON_INK_MUTED, name: "cover ghost",
  });
  text(s, "sold out", { x: gx + gw + 0.14, y: g.capY - 0.14, w: 0.85, h: 0.28, fontSize: 13, bold: true, color: ORANGE });
  const bar3x = gx + 2 * (g.barW + g.gap);
  const ghost3Top = g.base - 1.28 * (g.base - g.capY);
  text(s, [
    { text: "hidden demand", options: { bold: true, breakLine: true } },
    { text: "searches that hit sold out", options: { color: ON_INK_MUTED } },
  ], { x: bar3x - 2.55, y: ghost3Top - 0.04, w: 2.4, h: 0.56, fontSize: 13, color: BLUE_ON_INK, align: "right" });
  s.addNotes(
    "Voyance, French for foresight. It's a pre-buy planner for TBO's hotel buyers: give it a budget and a risk level, " +
    "and it returns a ranked list of rooms to buy ahead, each with a reason. The picture is the idea in one glance: " +
    "booking history stops at the sold-out line, and the dashed part above it is demand nobody counted."
  );
}

// ---------- slide 1: problem, innovation, impact, money ----------
{
  const s = pres.addSlide({ masterName: "CONTENT" });
  s.addText("Sold-out dates hide demand. Voyance buys ahead for it", { placeholder: "title" });
  text(s, "Hotels are 67% of TBO's GTV (₹7,889 cr of ₹11,695 cr in Q2 FY27) and growing 39% a year, twice as fast as air.", {
    x: M, y: 0.92, w: CW, h: 0.3, fontSize: 13.5, color: MUTED,
  });

  // Left column: problem + what's new
  const lx = M;
  const lw = 4.05;
  label(s, "The problem", lx, 1.4, lw);
  text(s, "TBO buys hotel rooms ahead of peak dates, sized from booking history. But a search that hits “sold out” never becomes a booking, so the busiest dates look smaller than they were. Buyers under-buy the peaks and overspend on quiet weeks.", {
    x: lx, y: 1.66, w: lw, h: 1.15, fontSize: 13, lineSpacingMultiple: 1.05,
  });
  const g = ghostBars(s, { x: lx + 0.05, y: 2.9, w: 1.9, h: 0.92, demand: [0.5, 0.72, 1.22, 1.48], name: "problem ghost" });
  const tx = lx + 2.2;
  text(s, "hidden demand", { x: tx, y: g.top - 0.02, w: 1.85, h: 0.22, fontSize: 11, bold: true, color: BLUE_TEXT });
  text(s, "sold-out line", { x: tx, y: g.capY - 0.11, w: 1.85, h: 0.22, fontSize: 11, bold: true, color: ORANGE_TEXT });
  text(s, "bookings: all history shows", { x: tx, y: g.base - 0.24, w: 1.85, h: 0.22, fontSize: 11, color: MUTED });

  label(s, "What's new", lx, 4.02, lw);
  const ideas = [
    ["Hidden demand", "Counts sold-out searches back in, the way airlines correct for sold-out flights."],
    ["Event signals", "Festivals, matches, concerts and long weekends flag spikes before bookings do."],
    ["Budget as a portfolio", "Best mix of buys for the risk level you pick, with the worst 5% of outcomes capped."],
    ["Reasons and approval", "Every line says why in plain words. A buyer approves each one."],
  ];
  ideas.forEach(([head, body], i) => {
    const y = 4.3 + i * 0.68;
    numberDot(s, i + 1, lx, y + 0.02, 0.3);
    text(s, [
      { text: head, options: { bold: true, fontSize: 13, breakLine: true } },
      { text: body, options: { fontSize: 11.5, color: MUTED } },
    ], { x: lx + 0.45, y, w: lw - 0.45, h: 0.64 });
  });

  // Right zone: impact (chart + stats), then Buy Desk + money
  const rx = 4.95;
  label(s, "Impact (simulated)", rx, 1.4, 5.4);
  const chartW = 5.2;
  const chartH = chartW / CHART_ASPECT;
  s.addImage({ path: CHART, x: rx, y: 1.66, w: chartW, h: chartH, altText: "Line chart of expected profit by budget for four buying strategies on simulated December seasons. Our planner leads or ties re-buying past bookings at every budget, while an even split of the budget turns into a loss above ₹1.2 cr.", objectName: "proof chart" });

  const sx = rx + chartW + 0.3;
  const sw = M + CW - sx;
  const stats = [
    ["+14%", "more expected profit", "at a tight ₹60L budget"],
    ["+16%", "better worst case at ₹2 cr", "(₹17.0L vs ₹14.7L)"],
    ["−32%", "unsold room-nights at ₹2 cr", "(101 vs 148)"],
  ];
  stats.forEach(([big, line1, line2], i) => {
    const y = 1.62 + i * 0.86;
    text(s, big, { x: sx, y, w: sw, h: 0.46, fontSize: 30, bold: true, color: BLUE, valign: "middle" });
    text(s, [
      { text: line1, options: { breakLine: true } },
      { text: line2, options: { color: MUTED } },
    ], { x: sx, y: y + 0.45, w: sw, h: 0.38, fontSize: 11, color: INK });
  });
  text(s, "All vs re-buying last year's bookings. About even at ₹1.2 cr. Simulated data, not TBO's.", {
    x: sx, y: 4.2, w: sw, h: 0.5, fontSize: 9.5, color: MUTED, italic: true,
  });

  const by = 4.92;
  label(s, "The Buy Desk", rx, by, 3.6);
  const mw = 3.55;
  const mh = 1.88;
  if (fs.existsSync(MOCKUP)) {
    s.addImage({ path: MOCKUP, x: rx, y: by + 0.26, w: mw, h: mh, sizing: { type: "contain", w: mw, h: mh }, altText: "Buy Desk screen: budget and risk sliders, a ranked buy list and a why panel.", objectName: "buy desk mockup" });
  } else {
    buyDeskSketch(s, rx, by + 0.26, mw, mh);
  }

  const mx = rx + mw + 0.35;
  const mwid = M + CW - mx;
  label(s, "How it makes money", mx, by, mwid);
  const money = [
    ["Buy Desk", "TBO's buying team", "Higher margin and fewer unsold rooms."],
    ["Peak Access", "TBO's 34,529 monthly buyers", "Agencies pay extra for rooms on sold-out dates."],
    ["White-label", "bedbanks, DMCs", "Platform fee + success fee: a share of the profit uplift, measured against a holdout."],
  ];
  money.forEach(([name, who, body], i) => {
    const y = by + 0.28 + i * 0.62;
    text(s, [
      { text: name, options: { bold: true, fontSize: 12.5 } },
      { text: `  ·  ${who}`, options: { fontSize: 11, color: MUTED, breakLine: true } },
      { text: body, options: { fontSize: 11, color: INK } },
    ], { x: mx, y, w: mwid, h: 0.6 });
  });

  sourceNote(s, "Sources: TBO Tek press releases of 28 May 2026 (FY26) and 2 Nov 2026 (Q2 FY27). Impact: 20 simulated December seasons, 40 hotel-weeks in 5 Indian cities; not TBO data. Every figure: docs/numbers.md in our repo.");
  s.addNotes(
    "Problem: TBO pre-buys hotel rooms using booking history, but a search that hits sold out never becomes a booking, " +
    "so the busiest dates are undercounted. What's new: we count those sold-out searches back in, add event signals, " +
    "treat the budget as a portfolio with a risk slider, and explain every line for a buyer to approve. " +
    "Impact on simulated seasons: +14% expected profit at a tight budget; at a generous budget a 16% better worst case " +
    "and a third fewer unsold rooms, while splitting the budget evenly loses money. The risk slider pays for itself. " +
    "Money: margin for TBO, Peak Access for its agencies, and a white-label success fee measured against a holdout."
  );
}

// ---------- slide 2: architecture, stack, scale, adoption ----------
{
  const s = pres.addSlide({ masterName: "CONTENT" });
  s.addText("Built for TBO's scale, with a buyer approving every buy", { placeholder: "title" });
  text(s, "The busy path is collecting search events, not the optimizer, so each layer scales on its own.", {
    x: M, y: 0.92, w: CW, h: 0.3, fontSize: 13.5, color: MUTED,
  });

  label(s, "Architecture", M, 1.4, 4);
  // legend
  const legend = [["Built", "built"], ["Part built", "part"], ["Round 2", "planned"]];
  let lgx = M + CW - 3.9;
  legend.forEach(([name, kind]) => {
    statusPill(s, name, kind, lgx, 1.36, 1.2);
    lgx += 1.35;
  });

  const stages = [
    ["Ingest", "Go · Kafka / Redpanda", [
      "Search + booking events, incl. sold-out results",
      "TBO Hotel API: rates, availability re-check",
      "Event + holiday calendars",
      "Per-supplier rate limits",
    ], "Round 2", "planned"],
    ["Store", "ClickHouse · Postgres · Redis", [
      "Look-to-book per hotel-week",
      "Tenants, plans, approvals, audit log",
      "Rate and availability cache, short TTL",
    ], "Part built", "part"],
    ["Decision engine", "Python · HiGHS solver", [
      "Hidden demand → event lift → demand range → budget optimizer → price tiers → reasons",
      "One job per city-month, run in parallel",
    ], "Part built", "part"],
    ["Buy Desk API", "FastAPI · REST", [
      "Multi-tenant, API keys",
      "Buyer, approver, admin roles",
      "Approval on every line, audit log, CSV export",
      "Next: webhooks, buy-by alerts",
    ], "Built", "built"],
    ["Dashboard", "React · TypeScript", [
      "Budget and risk sliders",
      "Ranked list + “why” panel",
      "Replay of last December",
      "Plain-English what-ifs",
    ], "Round 2", "planned"],
  ];
  const gapX = 0.3;
  const cw = (CW - gapX * (stages.length - 1)) / stages.length;
  const cy = 1.7;
  const ch = 2.72;
  stages.forEach(([name, tech, bullets, status, kind], i) => {
    const x = M + i * (cw + gapX);
    card(s, x, cy, cw, ch, `stage ${name}`);
    numberDot(s, i + 1, x + 0.16, cy + 0.16, 0.3);
    text(s, name, { x: x + 0.56, y: cy + 0.16, w: cw - 0.66, h: 0.3, fontSize: 14, bold: true, valign: "middle" });
    text(s, tech, { x: x + 0.16, y: cy + 0.58, w: cw - 0.26, h: 0.24, fontSize: 10.5, bold: true, color: BLUE_TEXT });
    text(s, bullets.map((b, j) => ({
      text: b, options: { bullet: { indent: 10 }, breakLine: j < bullets.length - 1, paraSpaceAfter: 3 },
    })), { x: x + 0.16, y: cy + 0.9, w: cw - 0.28, h: ch - 1.38, fontSize: 11, color: INK });
    statusPill(s, status, kind, x + 0.16, cy + ch - 0.4, 1.1);
    if (i < stages.length - 1) {
      s.addShape(pres.shapes.CHEVRON, {
        x: x + cw + 0.08, y: cy + ch / 2 - 0.14, w: 0.14, h: 0.28,
        fill: { color: MUTED }, line: { color: MUTED, width: 0.5 }, objectName: `arrow ${i + 1}`,
      });
    }
  });

  const bottom = [
    ["Scale", "< 1 s", "to plan a whole December across 5 cities on a laptop (measured). Each city-month is its own job, so cities run in parallel. Ingest grows by adding Go workers and Kafka partitions."],
    ["Real today", "72 tests", "Budget never exceeded. More caution never worsens the worst case. Companies never see each other's plans. Nobody approves their own plan."],
    ["Adoption risk: shadow mode", "1 season", "beside TBO's buyers, comparing plans before any money moves. Then live one city at a time. TBO's own data plugs in through one DataSource interface."],
  ];
  const bw = (CW - 0.3 * 2) / 3;
  const by = 4.66;
  const bh = 2.3;
  bottom.forEach(([head, big, body], i) => {
    const x = M + i * (bw + 0.3);
    card(s, x, by, bw, bh, `fact ${head}`);
    label(s, head, x + 0.22, by + 0.2, bw - 0.44);
    text(s, big, { x: x + 0.22, y: by + 0.5, w: bw - 0.44, h: 0.56, fontSize: 30, bold: true, color: BLUE, valign: "middle" });
    text(s, body, { x: x + 0.22, y: by + 1.1, w: bw - 0.44, h: bh - 1.25, fontSize: 12, color: INK });
  });

  sourceNote(s, "Built = in our repo today (Python, FastAPI, 72 automated tests). Round 2 = planned for 26 Nov – 23 Dec. Solve time measured on the prototype; data is simulated until TBO's plugs in.");
  s.addNotes(
    "Architecture: a Go service ingests TBO's search and booking events, including sold-out results, into Kafka. " +
    "ClickHouse holds the events, Postgres the plans and audit log, Redis the rate cache. The Python decision engine runs " +
    "one job per city-month: hidden demand, event lift, a demand range, then a budget optimizer with a cap on the worst 5% of outcomes. " +
    "The FastAPI Buy Desk API is built today, with roles, approvals and an audit log, and 72 tests. " +
    "Adoption: shadow mode for one season beside TBO's buyers, then live one city at a time, with a buyer approving every line."
  );
}

// ---------- slide 3: thank you ----------
{
  const s = pres.addSlide({ masterName: "DARK" });
  text(s, "Thank you", { x: 0.8, y: 2.0, w: 6.5, h: 1.1, fontSize: 60, bold: true, color: WHITE, valign: "middle" });
  text(s, "Voyance sees hotel demand before it sells out, and buys ahead for it within the budget and risk TBO sets.", {
    x: 0.8, y: 3.25, w: 6.2, h: 0.8, fontSize: 18, color: ON_INK_MUTED,
  });
  text(s, [{ text: "github.com/Priyanshu-senapati/voyage", options: { hyperlink: { url: REPO, tooltip: "Voyance code" } } }], {
    x: 0.8, y: 4.3, w: 6.2, h: 0.36, fontSize: 16, bold: true, color: BLUE_ON_INK,
  });
  text(s, TEAM, { x: 0.8, y: 6.2, w: 6.6, h: 0.3, fontSize: 14, color: WHITE });
  ghostBars(s, {
    x: 8.9, y: 2.2, w: 3.2, h: 3.0, demand: [0.55, 0.78, 1.28, 1.62], onInk: true, name: "close ghost",
  });
  s.addNotes("Thank you. The code, the tests and every number on these slides are in our repo.");
}

function statusPill(slide, value, kind, x, y, w) {
  const look = {
    built: { fill: BLUE, line: BLUE, color: WHITE },
    part: { fill: BLUE_TINT, line: BLUE, color: BLUE_TEXT },
    planned: { fill: WHITE, line: BAR, color: MUTED },
  }[kind];
  slide.addText(value, {
    shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: 0.13, x, y, w, h: 0.26,
    fill: { color: look.fill }, line: { color: look.line, width: 1 }, color: look.color,
    bold: true, fontSize: 10, align: "center", valign: "middle", margin: 0, objectName: `status ${value}`,
  });
}

// Write, then drop the ZIP's folder entries: cloud viewers can fail to open a .pptx that has them.
async function main() {
  const raw = await pres.write({ outputType: "nodebuffer" });
  const zip = await JSZip.loadAsync(raw);
  const clean = new JSZip();
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  for (const name of names) {
    clean.file(name, await zip.files[name].async("nodebuffer"), { createFolders: false });
  }
  const buf = await clean.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
  fs.writeFileSync(OUT, buf);
  console.log(`wrote ${OUT} (${names.length} parts)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
