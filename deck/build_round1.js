// Builds deck/voyance_round1.pptx: cover, 2 content slides, thank-you (TBO VoyageHack 4.0, Round 1).
// Run from deck/:  npm install  then  node build_round1.js
// Impact numbers and the chart are read from out/proof_results.csv (lane A's simulation), and the Buy Desk rows
// from docs/sample_plan_round1.json (real API output), so the slide can't drift from the data.
// Every other figure comes from docs/numbers.md. Change it there first, then here.
// If deck/assets/buy_desk_mockup.png exists it is placed on slide 2; otherwise a sketch with the real rows is drawn.

const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");
const JSZip = require("jszip");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(__dirname, "voyance_round1.pptx");
const RESULTS_CSV = path.join(ROOT, "out", "proof_results.csv");
const SAMPLE_PLAN = path.join(ROOT, "docs", "sample_plan_round1.json");
const MOCKUP = path.join(__dirname, "assets", "buy_desk_mockup.png");
const REPO = "https://github.com/Priyanshu-senapati/voyage";
const TEAM = "Priyanshu Senapati  ·  Gourab Dash  ·  Vinochan R";

// Palette (deck/brief.md). Blue = Voyance / our planner, orange = sold out / status quo,
// green = our optimizer without hidden demand; all three match out/proof_chart.png.
const INK = "12141C";
const WHITE = "FFFFFF";
const CARD = "F3F4F7";
const MUTED = "5B6070";
const HAIR = "D9DCE3";
const GRID = "E6E7EB";
const BAR = "C9CDD6";
const BLUE = "2A78D6"; // shapes, lines and big numbers only
const BLUE_TEXT = "1F5FAF"; // small blue text on white (6.3:1)
const BLUE_TINT = "E6EFFA";
const BLUE_ON_INK = "6FA8EE"; // blue text on ink (7.5:1)
const ORANGE = "EB6834";
const ORANGE_TEXT = "B8471A"; // small orange text on white (5.3:1)
const GREEN = "1BAF7A";
const ON_INK_MUTED = "A9AEBB";
const BAR_ON_INK = "3A3F4F";

const W = 13.333;
const M = 0.5; // side margin
const CW = W - 2 * M; // content width

// ---------- data ----------

function splitCsv(line) {
  const cells = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { cells.push(cur); cur = ""; }
    else cur += ch;
  }
  cells.push(cur);
  return cells;
}

const RESULTS = (() => {
  const lines = fs.readFileSync(RESULTS_CSV, "utf8").trim().split(/\r?\n/);
  const header = splitCsv(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsv(line);
    return Object.fromEntries(header.map((h, i) => [h, h === "strategy" ? cells[i] : Number(cells[i])]));
  });
})();

const OURS = "Optimizer + hidden demand + events";
const BASE = "Repeat past bookings";
const RAW = "Optimizer, bookings only";
const EVEN = "Even split";

function result(budgetLakh, strategy) {
  const row = RESULTS.find((r) => r.budget_lakh === budgetLakh && r.strategy === strategy);
  if (!row) throw new Error(`no result for ${strategy} at ${budgetLakh} lakh`);
  return row;
}
const gainPct = (a, b) => Math.round(100 * (a / b - 1));
const lakh = (rupees) => (rupees / 1e5).toFixed(1);
const signed = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(n)}%`;
const budgetLabel = (l) => (l < 100 ? `₹${l}L` : `₹${l / 100} cr`);

const BUDGETS = [...new Set(RESULTS.map((r) => r.budget_lakh))].sort((a, b) => a - b);
const TIGHT = 60;
const LOOSE = 200;
const S = {
  tightGain: gainPct(result(TIGHT, OURS).mean_profit, result(TIGHT, BASE).mean_profit),
  looseWorstGain: gainPct(result(LOOSE, OURS).worst_5pct_profit, result(LOOSE, BASE).worst_5pct_profit),
  looseWorstOurs: lakh(result(LOOSE, OURS).worst_5pct_profit),
  looseWorstBase: lakh(result(LOOSE, BASE).worst_5pct_profit),
  looseVsRaw: gainPct(result(LOOSE, OURS).mean_profit, result(LOOSE, RAW).mean_profit),
  evenLoss: lakh(-result(LOOSE, EVEN).mean_profit),
  perRupeeOurs: (100 * result(LOOSE, OURS).mean_profit / result(LOOSE, OURS).spend).toFixed(1),
  perRupeeBase: (100 * result(LOOSE, BASE).mean_profit / result(LOOSE, BASE).spend).toFixed(1),
};
const PLAN = JSON.parse(fs.readFileSync(SAMPLE_PLAN, "utf8"));

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

function pill(slide, value, x, y, w, h, look, fontSize = 10) {
  slide.addText(value, {
    shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: h / 2, x, y, w, h,
    fill: { color: look.fill }, line: { color: look.line, width: 1 }, color: look.color,
    bold: true, fontSize, align: "center", valign: "middle", margin: 0, objectName: `pill ${value}`,
  });
}

const STATUS = {
  built: { fill: BLUE, line: BLUE, color: WHITE },
  part: { fill: BLUE_TINT, line: BLUE, color: BLUE_TEXT },
  planned: { fill: WHITE, line: BAR, color: MUTED },
};

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

const rupeesL = (inr) => `₹${(inr / 1e5).toFixed(2)}L`;
const dash = (s) => s.replace(/(\d)-(\d)/g, "$1–$2");

// The Buy Desk screen as a sketch, filled with real rows from today's API (docs/sample_plan_round1.json).
// Lane B's mockup PNG replaces it when it lands in deck/assets/.
function buyDeskSketch(slide, x, y, w, h) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.06, fill: { color: WHITE }, line: { color: HAIR, width: 1 }, objectName: "sketch frame",
  });
  text(slide, "Buy Desk", { x: x + 0.12, y: y + 0.08, w: 1.0, h: 0.22, fontSize: 10.5, bold: true, valign: "middle" });
  const budgetCr = PLAN.request.budget_inr / 1e7;
  pill(slide, `₹${budgetCr} cr budget`, x + w - 1.95, y + 0.09, 0.95, 0.2, STATUS.part, 8);
  pill(slide, "Risk: cautious", x + w - 0.95, y + 0.09, 0.83, 0.2, STATUS.part, 8);
  const sum = PLAN.summary;
  text(slide, `Spend ₹${(sum.spend_inr / 1e7).toFixed(2)} cr  ·  expected ${"+" + rupeesL(sum.expected_profit_inr)}  ·  worst 5% ${"+" + rupeesL(sum.worst_5pct_profit_inr)}`, {
    x: x + 0.12, y: y + 0.36, w: w - 0.24, h: 0.18, fontSize: 8.5, color: MUTED,
  });
  PLAN.top_lines.slice(0, 3).forEach((line, i) => {
    const ry = y + 0.6 + i * 0.235;
    const hot = i === 0;
    slide.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.1, y: ry, w: w - 0.2, h: 0.205, fill: { color: hot ? BLUE_TINT : CARD }, line: { color: hot ? BLUE_TINT : CARD, width: 0.5 },
      objectName: `sketch row ${i + 1}`,
    });
    text(slide, `${line.rank}   ${line.city} · ${dash(line.week)} · ${line.hotel}`, {
      x: x + 0.17, y: ry + 0.02, w: 1.95, h: 0.17, fontSize: 8.5, bold: hot, color: INK, valign: "middle",
    });
    text(slide, `${line.rooms} rooms`, { x: x + w - 1.33, y: ry + 0.02, w: 0.55, h: 0.17, fontSize: 8.5, color: MUTED, align: "right", valign: "middle" });
    text(slide, `+${rupeesL(line.expected_profit_inr)}`, { x: x + w - 0.76, y: ry + 0.02, w: 0.42, h: 0.17, fontSize: 8.5, bold: true, color: INK, align: "right", valign: "middle" });
    slide.addText(hot ? "✓" : "", {
      shape: pres.shapes.OVAL, x: x + w - 0.27, y: ry + 0.03, w: 0.15, h: 0.15,
      fill: { color: hot ? BLUE : WHITE }, line: { color: BLUE, width: 0.75 }, color: WHITE, fontSize: 7, bold: true,
      align: "center", valign: "middle", margin: 0, objectName: `sketch approve ${i + 1}`,
    });
  });
  const parts = PLAN.top_lines[0].reason.split("; ");
  const searches = parts.find((p) => /sold-out searches/.test(p));
  const why = [searches && searches.replace(/ in past Decembers$/, ""), parts.some((p) => /event week/.test(p)) && "an event week"]
    .filter(Boolean).join(" + ");
  text(slide, `Why #1: ${why}`, {
    x: x + 0.12, y: y + 1.32, w: w - 0.24, h: 0.24, fontSize: 8.5, color: BLUE_TEXT, italic: true,
  });
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

// ---------- slide 2: problem, innovation, impact, money ----------
{
  const s = pres.addSlide({ masterName: "CONTENT" });
  s.addText("Sold-out dates hide demand. Voyance buys ahead for it", { placeholder: "title" });
  text(s, "Hotels + ancillaries are 67% of TBO's GTV (₹7,889 cr of ₹11,695 cr, Q2 FY27), up 39% year on year, twice air's 18%.", {
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
  text(s, "bookings: what history sees", { x: tx, y: g.base - 0.24, w: 2.1, h: 0.22, fontSize: 11, color: MUTED });

  label(s, "What's new", lx, 4.02, lw);
  const ideas = [
    ["Hidden demand", "Counts sold-out searches back in, the way airlines correct for sold-out flights."],
    ["Event signals", "Festivals, matches, concerts and long weekends flag spikes before bookings do."],
    ["Budget as a portfolio", "Best mix of buys for the risk you pick; the slider trades a little profit for a better worst case."],
    ["Reasons and approval", "Every line says why in plain words. A second person approves each one."],
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
  const chartW = 5.2;
  label(s, "Impact (simulated)", rx, 1.4, chartW);
  const series = [
    [OURS, "Voyance"],
    [BASE, "Re-buy past bookings"],
    [RAW, "Our optimizer, raw bookings"],
  ].map(([strategy, name]) => ({
    name,
    labels: BUDGETS.map(budgetLabel),
    values: BUDGETS.map((b) => Number((result(b, strategy).mean_profit / 1e5).toFixed(2))),
  }));
  s.addChart(pres.charts.LINE, series, {
    x: rx - 0.08, y: 1.62, w: chartW + 0.08, h: 2.72,
    chartColors: [BLUE, ORANGE, GREEN],
    lineSize: 2.25, lineDataSymbol: "circle", lineDataSymbolSize: 6,
    showLegend: true, legendPos: "t", legendFontSize: 10.5, legendFontFace: "+mn-lt", legendColor: INK,
    catAxisLabelColor: MUTED, catAxisLabelFontSize: 10, catAxisLabelFontFace: "+mn-lt",
    catAxisLineShow: true, catAxisLineColor: BAR,
    valAxisLabelColor: MUTED, valAxisLabelFontSize: 10, valAxisLabelFontFace: "+mn-lt",
    valAxisMinVal: 6, valAxisMaxVal: 26, valAxisMajorUnit: 4, valAxisLineShow: false,
    showValAxisTitle: true, valAxisTitle: "Expected profit, ₹ lakh", valAxisTitleFontSize: 10,
    valAxisTitleColor: MUTED, valAxisTitleFontFace: "+mn-lt",
    valGridLine: { color: GRID, size: 0.75 }, catGridLine: { style: "none" },
    altText: `Line chart of simulated expected profit by maximum budget. Voyance leads re-buying past bookings by ${signed(S.tightGain)} at ₹60L, is about even at ₹1.2 cr, and ends ${signed(S.looseVsRaw)} above the same optimizer on raw bookings at ₹2 cr.`,
    objectName: "impact chart",
  });
  text(s, `An even split of the budget (not shown) loses ₹${S.evenLoss}L at ₹2 cr.`, {
    x: rx, y: 4.38, w: chartW, h: 0.4, fontSize: 9.5, color: MUTED, italic: true,
  });

  const sx = rx + chartW + 0.3;
  const sw = M + CW - sx;
  const stats = [
    [signed(S.tightGain), "more expected profit", "at a tight ₹60L budget"],
    [signed(S.looseWorstGain), "better worst case at ₹2 cr", `(₹${S.looseWorstOurs}L vs ₹${S.looseWorstBase}L)`],
    [signed(S.looseVsRaw), "more profit than our optimizer", "on raw bookings, at ₹2 cr"],
  ];
  stats.forEach(([big, line1, line2], i) => {
    const y = 1.58 + i * 0.86;
    text(s, big, { x: sx, y, w: sw, h: 0.46, fontSize: 30, bold: true, color: BLUE, valign: "middle" });
    text(s, [
      { text: line1, options: { breakLine: true } },
      { text: line2, options: { color: MUTED } },
    ], { x: sx, y: y + 0.45, w: sw, h: 0.38, fontSize: 11, color: INK });
  });
  text(s, "First two vs re-buying past bookings (about even with it at ₹1.2 cr). The third is what hidden demand + events add.", {
    x: sx, y: 4.18, w: sw, h: 0.62, fontSize: 9.5, color: MUTED, italic: true,
  });

  const by = 4.92;
  label(s, "The Buy Desk", rx, by, 3.6);
  const mw = 3.55;
  const mh = 1.58;
  if (fs.existsSync(MOCKUP)) {
    s.addImage({ path: MOCKUP, x: rx, y: by + 0.26, w: mw, h: mh, sizing: { type: "contain", w: mw, h: mh }, altText: "Buy Desk screen design: budget and risk in, a ranked buy list with a reason and an approval for every line.", objectName: "buy desk mockup" });
  } else {
    buyDeskSketch(s, rx, by + 0.26, mw, mh);
  }
  text(s, "Screen design (Round 2). Rows are real output from today's API, on simulated data.", {
    x: rx, y: by + 0.26 + mh + 0.04, w: mw, h: 0.2, fontSize: 9, color: MUTED, italic: true,
  });

  const mx = rx + mw + 0.35;
  const mwid = M + CW - mx;
  label(s, "How it makes money", mx, by, mwid);
  const money = [
    ["Buy Desk", "TBO's buying team", `${S.perRupeeOurs}% profit per rupee pre-bought vs ${S.perRupeeBase}% for re-buying, with fewer unsold rooms (simulated, ₹2 cr).`],
    ["Peak Access", "TBO's 34,529 monthly buyers (Q2 FY27)", "Agencies pay extra for rooms on sold-out dates."],
    ["White-label", "DMCs and tour operators", "Platform fee + success fee: a share of the profit uplift, measured against a holdout."],
  ];
  money.forEach(([name, who, body], i) => {
    const y = by + 0.28 + i * 0.6;
    text(s, [
      { text: name, options: { bold: true, fontSize: 12.5 } },
      { text: `  ·  ${who}`, options: { fontSize: 11, color: MUTED, breakLine: true } },
      { text: body, options: { fontSize: 11, color: INK } },
    ], { x: mx, y, w: mwid, h: 0.58 });
  });

  sourceNote(s, "Sources: TBO Tek press releases, 28 May 2026 (FY26) and 2 Nov 2026 (Q2 FY27). Impact: 20 simulated markets (40 hotel-weeks, 5 Indian cities), each scored on 500 unseen Decembers; not TBO data.");
  s.addNotes(
    "Problem: TBO pre-buys hotel rooms using booking history, but a search that hits sold out never becomes a booking, " +
    "so the busiest dates are undercounted. What's new: we count those sold-out searches back in, add event signals, " +
    "pick the best mix of buys for the chosen risk level, and explain every line for a second person to approve. " +
    `Impact, all simulated: ${signed(S.tightGain)} expected profit on a tight budget versus re-buying past bookings; ` +
    `at a generous budget a ${S.looseWorstGain}% better worst case, and ${S.looseVsRaw}% more profit than the same optimizer ` +
    "without hidden demand, which is the part our idea adds. Money: margin for TBO, Peak Access for its agencies, " +
    "and a white-label success fee measured against a holdout."
  );
}

// ---------- slide 3: architecture, stack, scale, adoption ----------
{
  const s = pres.addSlide({ masterName: "CONTENT" });
  s.addText("Designed for TBO's scale, with a buyer approving every buy", { placeholder: "title" });
  text(s, "The busy path is collecting search events, not the optimizer, so each layer scales on its own.", {
    x: M, y: 0.92, w: CW, h: 0.3, fontSize: 13.5, color: MUTED,
  });

  label(s, "Architecture", M, 1.4, 4);
  let lgx = M + CW - 3.9;
  [["Built", "built"], ["Part built", "part"], ["Round 2", "planned"]].forEach(([name, kind]) => {
    pill(s, name, lgx, 1.36, 1.2, 0.26, STATUS[kind]);
    lgx += 1.35;
  });

  const stages = [
    ["Ingest", "Go · Kafka / Redpanda", [
      "Search + booking events, incl. sold-out results",
      "TBO Hotel API: rates, availability re-check",
      "Event + holiday calendars",
      "Per-supplier rate limits",
    ], "Round 2", "planned"],
    ["Store", "SQLite today → Postgres", [
      "Tenants, plans, approvals, audit log",
      "Next: ClickHouse for search events, Redis rate cache",
    ], "Part built", "part"],
    ["Decision engine", "Python · HiGHS solver", [
      "Hidden demand → event lift → budget optimizer → reasons",
      "Next: demand-range forecast, price tiers",
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
    pill(s, status, x + 0.16, cy + ch - 0.4, 1.1, 0.26, STATUS[kind]);
    if (i < stages.length - 1) {
      s.addShape(pres.shapes.CHEVRON, {
        x: x + cw + 0.08, y: cy + ch / 2 - 0.14, w: 0.14, h: 0.28,
        fill: { color: MUTED }, line: { color: MUTED, width: 0.5 }, objectName: `arrow ${i + 1}`,
      });
    }
  });

  const bottom = [
    ["Scale", "0.2 s", "for one buy plan over 40 hotel-weeks in 5 cities, on a laptop (measured). Round 2: solve cities in parallel and load-test at TBO's catalogue size."],
    ["Real today", "72 tests", "Budget never exceeded. More caution never lowers the planned worst case. No company sees another's plans. Nobody approves their own plan."],
    ["Adoption risk: shadow mode", "1 season", "beside TBO's buyers before any money moves, logging sold-out searches if TBO doesn't yet. Then live city by city, a buyer approving every line."],
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

  sourceNote(s, "Built = in our repo today (Python, FastAPI, SQLite, 72 automated tests). Round 2 = planned for 26 Nov – 23 Dec. Timing measured on a laptop; all data is simulated until TBO's plugs in.");
  s.addNotes(
    "Today: a Python engine counts hidden demand, adds event weeks and runs a budget optimizer that weighs expected profit " +
    "against the worst five percent of outcomes. One plan over 40 hotel-weeks takes 0.2 seconds on a laptop. The Buy Desk API " +
    "is built: API keys, buyer, approver and admin roles, approvals, an audit log, SQLite storage and 72 tests. " +
    "Round 2: a Go collector streams TBO's search and booking events, sold-outs included, through Kafka into ClickHouse; " +
    "Postgres and Redis replace SQLite; a React dashboard on top. Adoption: shadow mode for one season beside TBO's buyers, " +
    "then live one city at a time."
  );
}

// ---------- slide 4: thank you ----------
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
  console.log("stats", JSON.stringify(S));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
