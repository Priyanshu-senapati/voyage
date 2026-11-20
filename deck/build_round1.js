// Builds deck/voyance_round1.pptx: cover, 2 content slides, thank-you (TBO VoyageHack 4.0, Round 1).
// Run from deck/:  npm install  then  node build_round1.js
// Slide 2 is the problem (statement, why we chose it, what solving it is worth); slide 3 is the solution
// (the live Buy Desk GIF, the impact numbers, how it works). Each slide keeps to four zones, so cut before adding.
// The numbers are read from lane A's output files, so the slides can't drift from the data:
//   out/proof_study.json      simulated results (500 Decembers, against re-buying past bookings)
//   out/decision_backtest.json walk-forward test on real 2017 bookings (the build stops if a 95% interval touches zero)
//   out/calibration.json       the simulator checked against real bookings (speaker notes)
// Every other figure comes from docs/numbers.md or docs/business_case.md. Change it there first, then here.

const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");
const JSZip = require("jszip");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(__dirname, "voyance_round1.pptx");
const PROOF_STUDY = path.join(ROOT, "out", "proof_study.json");
const CALIBRATION = path.join(ROOT, "out", "calibration.json");
const DECISION_BACKTEST = path.join(ROOT, "out", "decision_backtest.json");
// The live Buy Desk, one story (deck/README.md, "Demo GIF"); 16:9. Loops in the slideshow; a PDF shows frame 1.
const GIF = path.join(ROOT, "docs", "demo-goa-christmas.gif");
// The GIF's own captions (deck/teaser/capture.mjs reads them off the screen); change them when the GIF is re-made
const STORY = { searches: "1,776", rooms: 85, buyBy: "5 Aug" };
const TESTS = 246; // `python -m pytest -q`: 246 passed, 20 Nov (docs/numbers.md)
const PLAN_SECONDS = "0.2 s"; // build_plan on the demo data, ₹40L–₹2 cr: 0.14–0.21 s best of 5, 19 Nov (docs/numbers.md)
// docs/business_case.md §3: extra profit a year per 1% of TBO's hotel sales bought ahead, from the real-data gain
const VALUE_PER_PCT = "₹4.5–6.3 cr";
const DEMO = "https://voyance-1029341879804.asia-south1.run.app";
const REPO = "https://github.com/Priyanshu-senapati/voyage";
const NUMBERS = `${REPO}/blob/main/docs/numbers.md`;
const TEAM = "Priyanshu Senapati  ·  Gourab Dash  ·  Vinochan R";

// Palette (deck/brief.md). Blue = Voyance, orange = sold out / status quo.
const INK = "12141C";
const WHITE = "FFFFFF";
const CARD = "F3F4F7";
const MUTED = "5B6070";
const HAIR = "D9DCE3";
const BAR = "C9CDD6";
const BLUE = "2A78D6"; // shapes, lines and big numbers only
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

// ---------- data ----------

const pct = (x) => Math.round(100 * x);

// Simulated: Voyance vs re-buying past bookings, 500 unseen Decembers, 40 hotel-weeks in 5 Indian cities
const SIM = (() => {
  const study = JSON.parse(fs.readFileSync(PROOF_STUDY, "utf8"));
  const at = (lakh) => {
    const b = study.budgets.find((x) => x.budget_lakh === lakh);
    if (!b) throw new Error(`no simulated result at ${lakh} lakh`);
    return b;
  };
  const tight = at(40);
  const loose = at(200);
  if (tight.profit_vs_rebuy_95ci[0] <= 0) throw new Error("₹40L profit interval touches zero; reword slide 3");
  if (loose.worst_case_vs_rebuy_95ci[0] <= 0) throw new Error("₹2 cr worst-case interval touches zero; reword slide 3");
  const ours = loose.means["Optimizer + hidden demand + events"];
  const rebuy = loose.means["Repeat past bookings"];
  return {
    worlds: study.worlds,
    tightGain: pct(tight.profit_vs_rebuy),
    looseWorstGain: pct(loose.worst_case_vs_rebuy),
    looseSpendLess: Math.round((rebuy.spend - ours.spend) / 1e5),
  };
})();

// Real 2017 bookings, walk-forward: buying by our likely forecast vs re-buying last year, every lead and margin tested
const BT = (() => {
  const runs = JSON.parse(fs.readFileSync(DECISION_BACKTEST, "utf8")).results;
  const forecast = runs.map((r) => r.strategies.likely_forecast);
  const rebuy = runs.map((r) => r.strategies.rebuy_last_year);
  if (!forecast.every((f) => f.vs_rebuy_95ci[0] > 0)) throw new Error("a forecast 95% interval is not above zero; reword the slides");
  const gains = forecast.map((f) => f.vs_rebuy);
  const awayCut = forecast.map((f, i) => 1 - f.turned_away / rebuy[i].turned_away);
  const unsoldCut = forecast.map((f, i) => 1 - f.unsold / rebuy[i].unsold);
  const leads = runs.map((r) => r.lead);
  const margins = runs.map((r) => pct(r.margin));
  return {
    tests: runs.length,
    gainLo: pct(Math.min(...gains)), gainHi: pct(Math.max(...gains)),
    awayLo: pct(Math.min(...awayCut)), awayHi: pct(Math.max(...awayCut)),
    unsoldLo: pct(Math.min(...unsoldCut)), unsoldHi: pct(Math.max(...unsoldCut)),
    leadLo: Math.min(...leads), leadHi: Math.max(...leads),
    marginLo: Math.min(...margins), marginHi: Math.max(...margins),
  };
})();

// Simulator vs 119,390 real bookings (2 Portuguese hotels, 2015–17). Week 4 of December = 22–28 Dec.
const CAL = (() => {
  const c = JSON.parse(fs.readFileSync(CALIBRATION, "utf8"));
  const real = c.real_agent_bookings;
  return {
    bookings: real.bookings.toLocaleString("en-US"),
    peakReal: real.december_shape[3].toFixed(2),
    peakSim: c.simulator.december_shape[3].toFixed(2),
  };
})();

// ---------- presentation ----------

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
          name: "title", type: "title", x: M, y: 0.32, w: CW, h: 0.66,
          fontSize: 30, bold: true, color: INK, align: "left", valign: "middle", margin: 0,
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
    { isTextBox: true, margin: 0, valign: "top", fontSize: 14, color: INK, fit: "none" }, opts));
}

function label(slide, value, x, y, w, onInk = false) {
  text(slide, value.toUpperCase(), {
    x, y, w, h: 0.26, fontSize: 11, bold: true, charSpacing: 1.5,
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

function hairline(slide, y, name) {
  slide.addShape(pres.shapes.LINE, { x: M, y, w: CW, h: 0, line: { color: HAIR, width: 1 }, objectName: name });
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
  text(slide, value, { x: M, y: 7.04, w: CW, h: 0.3, fontSize: 9.5, color: MUTED, valign: "bottom" });
}

// A big number with a bold one-line meaning and a muted line on where it comes from
function stat(slide, { x, y, numW, w, big, head, sub, name }) {
  text(slide, big, { x, y, w: numW, h: 0.62, fontSize: 36, bold: true, color: BLUE, valign: "middle", objectName: `${name} number` });
  text(slide, [
    { text: head, options: { bold: true, fontSize: 14, color: INK, breakLine: true } },
    { text: sub, options: { fontSize: 12, color: MUTED } },
  ], { x: x + numW + 0.15, y: y + 0.04, w: w - numW - 0.15, h: 0.9, objectName: `${name} text` });
}

// ---------- slide 1: cover ----------
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
    "Voyance, from the French for clairvoyance. It's a pre-buy planner for TBO's hotel buyers: give it a budget and a " +
    "risk level, and it returns a ranked list of rooms to buy ahead, each with a reason. The picture is the idea in one " +
    "glance: booking history stops at the sold-out line, and the dashed part above it is demand nobody counted."
  );
}

// ---------- slide 2: the problem, the problem statement, why we chose it, what it's worth ----------
{
  const s = pres.addSlide({ masterName: "CONTENT" });
  s.addText("Sold-out dates hide the demand TBO buys for", { placeholder: "title" });

  // Top left: the brief, then what goes wrong today
  const lw = 6.5;
  label(s, "Problem statement", M, 1.3, lw);
  card(s, M, 1.62, lw, 1.22, "problem statement card", BLUE_TINT);
  text(s, "“Buy the right inventory, at the right time, within the right budget, to maximize risk-adjusted profits.”", {
    x: M + 0.25, y: 1.76, w: lw - 0.5, h: 0.62, fontSize: 17, color: INK, objectName: "problem statement",
  });
  text(s, "TBO VoyageHack 4.0, Problem 1: Inventory optimization for TBO.com", {
    x: M + 0.25, y: 2.44, w: lw - 0.5, h: 0.26, fontSize: 11.5, color: BLUE_TEXT,
  });

  label(s, "What goes wrong today", M, 3.12, lw);
  text(s, "TBO pre-buys rooms from booking history. But a search that hits “sold out” never becomes a booking, so the busiest dates look smaller than they were. Buyers under-buy the peaks and over-buy quiet weeks.", {
    x: M, y: 3.42, w: lw, h: 1.05, fontSize: 15, lineSpacingMultiple: 1.05, objectName: "problem",
  });

  // Top right: the ghost bar, large
  const gx = 7.75;
  const gw = 2.75;
  label(s, "One December, as booking data sees it", gx, 1.3, M + CW - gx);
  const g = ghostBars(s, {
    x: gx, y: 1.72, w: gw, h: 2.78, demand: [0.55, 0.78, 1.28, 1.62],
    weeks: ["1–7 Dec", "8–14", "15–21", "22–28"], name: "problem ghost",
  });
  const tx = gx + gw + 0.28;
  const tw = M + CW - tx;
  text(s, [
    { text: "hidden demand", options: { bold: true, color: BLUE_TEXT, breakLine: true } },
    { text: "searches that hit sold out", options: { color: MUTED } },
  ], { x: tx, y: g.top - 0.03, w: tw, h: 0.5, fontSize: 13 });
  text(s, "sold out", { x: tx, y: g.capY - 0.13, w: tw, h: 0.26, fontSize: 13, bold: true, color: ORANGE_TEXT });
  text(s, [
    { text: "bookings", options: { bold: true, color: INK, breakLine: true } },
    { text: "all that history sees", options: { color: MUTED } },
  ], { x: tx, y: g.base - 0.5, w: tw, h: 0.5, fontSize: 13 });

  hairline(s, 4.82, "divider");

  // Bottom left: why we chose it
  const bw = 6.5;
  label(s, "Why we chose it", M, 5.02, bw);
  const reasons = [
    ["Hotels drive TBO's growth: ", "67% of its GTV, up 39% a year (Q2 FY27)"],
    ["The brief asks for it: ", "buy smarter using sold-outs and look-to-book"],
    ["Only TBO can do it: ", "it sees every sold-out search from 34,529 buyers"],
  ];
  reasons.forEach(([head, body], i) => {
    const y = 5.36 + i * 0.52;
    numberDot(s, i + 1, M, y, 0.3);
    text(s, [
      { text: head, options: { bold: true } },
      { text: body, options: { color: INK } },
    ], { x: M + 0.45, y: y - 0.01, w: bw - 0.45, h: 0.34, fontSize: 14, valign: "middle", objectName: `reason ${i + 1}` });
  });

  // Bottom right: what solving it is worth
  const rx = 7.3;
  label(s, "Real-world impact", rx, 5.02, M + CW - rx);
  const tiles = [
    [VALUE_PER_PCT, 2.6, "extra profit a year", "for every 1% of TBO's hotel sales bought ahead (estimate)"],
    [`${BT.awayLo}–${BT.awayHi}%`, 2.63, "fewer room-nights turned away", "on dates that sell out, in real 2017 bookings"],
  ];
  let x = rx;
  tiles.forEach(([big, w, head, sub], i) => {
    text(s, big, { x, y: 5.3, w, h: 0.62, fontSize: 34, bold: true, color: BLUE, valign: "middle", objectName: `impact ${i + 1} number` });
    text(s, [
      { text: head, options: { bold: true, color: INK, breakLine: true } },
      { text: sub, options: { color: MUTED } },
    ], { x, y: 5.96, w: w - 0.1, h: 0.95, fontSize: 13, objectName: `impact ${i + 1} text` });
    x += w + 0.3;
  });

  sourceNote(s, "Sources: TBO Tek press release, 2 Nov 2026 (Q2 FY27). Impact: our walk-forward test on real 2017 bookings at 2 hotels in Portugal (Antonio et al. 2019), scaled per 1% of hotel sales. Method: docs/numbers.md.");
  s.addNotes(
    "The brief asks TBO to buy the right inventory, at the right time, within the right budget, for the best risk-adjusted profit. " +
    "What goes wrong today: rooms are pre-bought from booking history, but a search that hits sold out never becomes a booking, " +
    "so the busiest weeks look smaller than they were. In the picture, the grey bars are what history records; the dashed blue part " +
    "above the sold-out line is the demand nobody counted. " +
    "Why this problem: hotels plus ancillaries are 67% of TBO's gross transaction value, 7,889 crore of 11,695 crore in Q2 FY27, " +
    "up 39% year on year, twice air's 18%. The brief itself names sold-outs and look-to-book. And only TBO sees every sold-out " +
    "search across its 34,529 monthly transacting buyers, so this is an edge no single hotel has. " +
    `What it's worth: about ${VALUE_PER_PCT.replace("₹", "")} a year in extra profit for every 1% of TBO's hotel sales bought ahead, ` +
    "1.1 to 1.5 percent of FY26 adjusted EBITDA. That's an estimate: it applies the gain we measured on real bookings to TBO's " +
    "annualised hotel sales, at 15 to 30 percent contract margins; TBO's real pre-bought share isn't public, so it's per 1%. " +
    `And in the same real-data test, ${BT.awayLo} to ${BT.awayHi} percent fewer room-nights were turned away, which is rooms for ` +
    "TBO's agents on the dates that sell out. The real data is two hotels in Portugal, not India."
  );
}

// ---------- slide 3: the solution, its impact, how it works ----------
{
  const s = pres.addSlide({ masterName: "CONTENT" });
  s.addText("Voyance turns hidden demand into an approved buy list", { placeholder: "title" });

  // Left: the live Buy Desk, one story (a still of its first frame if the GIF is missing)
  const gx = M;
  const gy = 1.3;
  const gw = 6.75;
  const gh = (gw * 9) / 16;
  if (!fs.existsSync(GIF)) throw new Error(`missing ${GIF}: re-make it (deck/README.md, "Demo GIF")`);
  s.addImage({
    path: GIF, x: gx, y: gy, w: gw, h: gh, objectName: "buy desk demo",
    altText: `Looping clip of the live Buy Desk on simulated data: Goa in Christmas week, ${STORY.searches} searches hit sold out, buy ${STORY.rooms} rooms by ${STORY.buyBy}, and a second person approves the line.`,
  });
  s.addShape(pres.shapes.RECTANGLE, { x: gx, y: gy, w: gw, h: gh, fill: { type: "none" }, line: { color: HAIR, width: 0.75 }, objectName: "demo frame" });
  text(s, `The live Buy Desk, simulated data: Goa in Christmas week, buy ${STORY.rooms} rooms by ${STORY.buyBy}, then a second person approves.`, {
    x: gx, y: gy + gh + 0.08, w: gw, h: 0.26, fontSize: 10.5, color: MUTED, italic: true,
  });

  // Right: the impact numbers
  const rx = 7.6;
  const rw = M + CW - rx;
  label(s, "Impact", rx, 1.3, rw);
  const stats = [
    [`+${BT.gainLo}–${BT.gainHi}%`, "profit vs re-buying last year", "real 2017 hotel bookings, buying by our forecast; every 95% interval above zero"],
    [`+${SIM.tightGain}%`, "profit on a tight ₹40L budget", `simulated: ${SIM.worlds} Decembers, 5 Indian cities`],
    [`+${SIM.looseWorstGain}%`, "better bad season at ₹2 cr", `simulated: worst 5% of seasons, ₹${SIM.looseSpendLess}L less spent`],
  ];
  stats.forEach(([big, head, sub], i) => {
    stat(s, { x: rx, y: 1.66 + i * 1.18, numW: 1.8, w: rw, big, head, sub, name: `impact ${i + 1}` });
  });

  // Bottom: how it works, which is also the architecture. Dashed = not built yet (Round 2).
  const py = 5.86;
  label(s, "How it works", M, py - 0.34, 4);
  const stages = [
    ["Signals", "Sold-out searches + bookings", "Round 2: Go · Kafka", true],
    ["Hidden demand", "Sold-outs back in + a forecast", "Python · LightGBM", false],
    ["Optimizer", "Profit vs worst 5%, in budget", "Python · HiGHS", false],
    ["Buy Desk API", "Reasons, approvals, audit log", "FastAPI · 3 roles", false],
    ["Dashboard", "Review and approve each line", "React · Cloud Run", false],
  ];
  const gap = 0.3;
  const sw = (CW - gap * (stages.length - 1)) / stages.length;
  const sh = 0.9;
  stages.forEach(([name, what, tech, planned], i) => {
    const x = M + i * (sw + gap);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y: py, w: sw, h: sh, rectRadius: 0.08,
      fill: { color: planned ? WHITE : CARD }, line: { color: planned ? MUTED : CARD, width: 1, dashType: planned ? "dash" : "solid" },
      objectName: `stage ${name}`,
    });
    text(s, [
      { text: name, options: { bold: true, fontSize: 14, color: INK, breakLine: true } },
      { text: what, options: { fontSize: 11, color: INK, breakLine: true } },
      { text: tech, options: { fontSize: 11, bold: true, color: BLUE_TEXT } },
    ], { x: x + 0.16, y: py + 0.12, w: sw - 0.26, h: sh - 0.2, objectName: `stage ${name} text` });
    if (i < stages.length - 1) {
      s.addShape(pres.shapes.CHEVRON, {
        x: x + sw + 0.09, y: py + sh / 2 - 0.12, w: 0.12, h: 0.24,
        fill: { color: MUTED }, line: { color: MUTED, width: 0.5 }, objectName: `arrow ${i + 1}`,
      });
    }
  });

  sourceNote(s, `Real: ${CAL.bookings} bookings at 2 hotels in Portugal, walk-forward on Jan–Aug 2017. Simulated: 40 hotel-weeks in 5 Indian cities, not TBO data. Built today: ${TESTS} automated tests, ${PLAN_SECONDS} per plan on a laptop.`);
  s.addNotes(
    "Voyance is a pre-buy planner. The clip is the live Buy Desk on simulated data, one story: Goa in Christmas week. " +
    `${STORY.searches} searches found the hotel sold out in past Decembers, so the planner buys ${STORY.rooms} rooms, by ${STORY.buyBy}, ` +
    "explains why in plain numbers, and a second person approves the line. Nothing is bought until it's approved, and every decision is logged. " +
    "How it works, left to right: search and booking signals, sold-outs included; hidden demand counts the sold-out searches back in and " +
    "a LightGBM forecast gives a low, likely and high range; one optimizer spreads the budget across cities, weeks and hotels, weighing " +
    "expected profit against the worst 5% of seasons; the Buy Desk API adds reasons, roles, approvals and an audit log; and the React " +
    "dashboard is live on Cloud Run. Everything is built except the Go and Kafka ingest, which is Round 2: today a simulator stands in. " +
    `Impact. On real bookings: buying by our forecast beat re-buying last year by ${BT.gainLo} to ${BT.gainHi} percent at every lead ` +
    `(${BT.leadLo} to ${BT.leadHi} days) and margin (${BT.marginLo} to ${BT.marginHi} percent), with ${BT.unsoldLo} to ${BT.unsoldHi} percent fewer unsold rooms. ` +
    "That gain is the forecast's: wiring the forecast into the planner is the first Round 2 engine task. " +
    `In simulation, against re-buying past bookings: ${SIM.tightGain} percent more profit when the budget is tight at 40 lakh, and at 2 crore ` +
    `a ${SIM.looseWorstGain} percent better bad season while spending ${SIM.looseSpendLess} lakh less. Around 1.2 crore it's about even. ` +
    `The simulator matches the real Christmas-week peak, ${CAL.peakReal} times the December average against ${CAL.peakSim} in ours. ` +
    `${TESTS} automated tests, and one plan over 40 hotel-weeks takes ${PLAN_SECONDS.replace(" s", " seconds")} on a laptop.`
  );
}

// ---------- slide 4: thank you ----------
{
  const s = pres.addSlide({ masterName: "DARK" });
  text(s, "Thank you", { x: 0.8, y: 1.45, w: 6.5, h: 1.1, fontSize: 60, bold: true, color: WHITE, valign: "middle" });
  text(s, "Voyance sees hotel demand before it sells out, and buys ahead for it within the budget and risk TBO sets.", {
    x: 0.8, y: 2.7, w: 6.2, h: 0.8, fontSize: 18, color: ON_INK_MUTED,
  });
  const links = [
    ["Try it", DEMO.replace("https://", ""), DEMO, "Voyance live demo"],
    ["Code", REPO.replace("https://", ""), REPO, "Voyance code"],
    ["Every number, with its source", "github.com/Priyanshu-senapati/voyage/blob/main/docs/numbers.md", NUMBERS, "Every number on the slides, with its source"],
  ];
  links.forEach(([head, shown, url, tooltip], i) => {
    const y = 3.8 + i * 0.78;
    label(s, head, 0.8, y, 6.6, true);
    text(s, [{ text: shown, options: { hyperlink: { url, tooltip } } }], {
      x: 0.8, y: y + 0.28, w: 7.2, h: 0.36, fontSize: 16, bold: true, color: BLUE_ON_INK,
    });
  });
  text(s, TEAM, { x: 0.8, y: 6.45, w: 6.6, h: 0.3, fontSize: 14, color: WHITE });
  ghostBars(s, {
    x: 8.9, y: 2.2, w: 3.2, h: 3.0, demand: [0.55, 0.78, 1.28, 1.62], onInk: true, name: "close ghost",
  });
  s.addNotes("Thank you. The Buy Desk is live at the demo link, and the code, the tests and every number on these slides, with its source, are in our repo.");
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
  console.log(`wrote ${OUT} (${names.length} parts, ${(buf.length / 1e6).toFixed(2)} MB)`);
  console.log("sim", JSON.stringify(SIM));
  console.log("real", JSON.stringify(BT));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
