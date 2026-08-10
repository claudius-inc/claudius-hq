/**
 * Builds a self-contained chart page for the day's shortlist.
 *
 * Run with:
 *   npx tsx scripts/pipelines/build-chart-page.ts
 *   npx tsx scripts/pipelines/build-chart-page.ts --out path/to/page.html
 *
 * WHY THIS EXISTS
 * ---------------
 * The screen's measured job is narrowing, not deciding. It shows ~27% of the
 * universe and its convergence count has a capture lift below 1.0, so the value
 * it adds is a short list to LOOK at — and looking means candles, not a row of
 * numbers in a Telegram message. This renders 4h candles for every shortlisted
 * name so the read happens on the chart.
 *
 * The page embeds its own OHLC data and draws with Canvas, so it needs no
 * network access and no charting library once written.
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import {
  selectConvergencePicks,
  CONVERGENCE_CONFIG,
  quarterlyVwap,
  type ConvergencePick,
} from "@/lib/markets/convergence-screen";
import { binanceVenue, type PerpBar } from "@/lib/markets/perp-venues";
import { logger } from "@/lib/logger";

/** 4h bars drawn per chart — ~30 days, enough to read structure without noise. */
const CHART_BARS = 180;

const OUT = (() => {
  const i = process.argv.indexOf("--out");
  return i >= 0 ? process.argv[i + 1] : "tmp/shortlist-charts.html";
})();

interface ChartPayload {
  base: string;
  symbol: string;
  side: string;
  score: number;
  maxScore: number;
  category: string;
  factors: string;
  rsi: number | null;
  volPctl: number | null;
  changePct: number | null;
  vwapDistPct: number | null;
  qvwap: number | null;
  /** [openTimeMs, open, high, low, close, volume] — compact on purpose, since
   *  16 charts x 180 bars of verbose JSON would dominate the page weight. */
  bars: number[][];
}

const initials = (p: ConvergencePick): string => {
  const on: string[] = [];
  if (p.vwapAgrees) on.push("Q");
  if (p.factors.trend) on.push("T");
  if (p.factors.pullback) on.push("P");
  if (p.factors.support) on.push("S");
  if (p.factors.proximity) on.push("X");
  if (p.factors.vsa) on.push("V");
  return on.join("");
};

function buildHtml(payloads: ChartPayload[], asOf: string, funnel: unknown): string {
  const data = JSON.stringify(payloads);
  return `<title>Shortlist Charts — 4h</title>
<style>
  :root {
    --ground:#F7F6F3; --surface:#FFFFFF; --sunk:#EFEDE8;
    --line:#DCD8D0; --ink:#14181C; --soft:#4A5158; --faint:#7C8590;
    --accent:#A8721B; --up:#1F7A52; --down:#A83A31; --vwap:#7A5EA8;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground:#0E1216; --surface:#161B21; --sunk:#10151A;
      --line:#262E36; --ink:#E8E9EA; --soft:#A7B0BA; --faint:#6E7883;
      --accent:#E0A94A; --up:#4FBF8B; --down:#E06C61; --vwap:#B49AE0;
    }
  }
  :root[data-theme="dark"] {
    --ground:#0E1216; --surface:#161B21; --sunk:#10151A;
    --line:#262E36; --ink:#E8E9EA; --soft:#A7B0BA; --faint:#6E7883;
    --accent:#E0A94A; --up:#4FBF8B; --down:#E06C61; --vwap:#B49AE0;
  }
  *{box-sizing:border-box}
  body{background:var(--ground);color:var(--ink);margin:0;padding:0 18px 80px;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased}
  .wrap{max-width:1240px;margin:0 auto}
  header{padding:44px 0 22px;border-bottom:2px solid var(--ink);margin-bottom:26px}
  .eyebrow{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;
    letter-spacing:.13em;text-transform:uppercase;color:var(--accent);margin:0 0 14px}
  h1{font-size:clamp(1.8rem,4vw,2.6rem);line-height:1.05;letter-spacing:-.03em;margin:0 0 12px}
  .sub{color:var(--soft);margin:0;max-width:62ch}
  .stamp{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11.5px;
    color:var(--faint);margin-top:16px;display:flex;gap:6px 20px;flex-wrap:wrap}
  .controls{display:flex;gap:8px;flex-wrap:wrap;margin:22px 0 26px}
  .controls button{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;
    letter-spacing:.08em;text-transform:uppercase;padding:7px 13px;border-radius:2px;
    border:1px solid var(--line);background:var(--surface);color:var(--soft);cursor:pointer}
  .controls button[aria-pressed="true"]{background:var(--ink);color:var(--ground);border-color:var(--ink)}
  .controls button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:18px}
  .card{background:var(--surface);border:1px solid var(--line);border-radius:2px;overflow:hidden}
  .card.hidden{display:none}
  .chead{display:flex;justify-content:space-between;align-items:baseline;gap:10px;
    padding:12px 14px;border-bottom:1px solid var(--line);background:var(--sunk)}
  .tkr{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-weight:650;font-size:1rem}
  .badge{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10px;
    padding:1px 6px;border-radius:2px;margin-left:6px;letter-spacing:.04em}
  .badge.long{background:var(--up);color:var(--ground)}
  .badge.short{background:var(--down);color:var(--ground)}
  .badge.cat{border:1px solid var(--line);color:var(--faint)}
  .score{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.9rem;
    font-weight:650;color:var(--accent);font-variant-numeric:tabular-nums}
  canvas{display:block;width:100%;height:210px}
  .cfoot{padding:9px 14px;border-top:1px solid var(--line);
    font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10.5px;
    color:var(--faint);display:flex;gap:4px 14px;flex-wrap:wrap}
  .legend{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10.5px;
    color:var(--faint);margin:26px 0 0;display:flex;gap:4px 18px;flex-wrap:wrap}
  .vw{color:var(--vwap)}
  .note{color:var(--soft);font-size:.86rem;max-width:70ch;margin:8px 0 0}
</style>

<div class="wrap">
<header>
  <p class="eyebrow">Claudius HQ · 4h shortlist</p>
  <h1>Charts for today&rsquo;s shortlist</h1>
  <p class="sub">Every name the screen surfaced, as 4h candles with quarterly anchored VWAP.
  The screen narrows; the read is yours.</p>
  <div class="stamp">
    <span>AS OF ${asOf}</span><span>${payloads.length} NAMES</span>
    <span>${CHART_BARS} x 4h BARS</span><span>THRESHOLD ${CONVERGENCE_CONFIG.minScore}/${5 + CONVERGENCE_CONFIG.vwapWeight}</span>
  </div>
</header>

<div class="controls">
  <button data-filter="all" aria-pressed="true">All</button>
  <button data-filter="long" aria-pressed="false">Long only</button>
  <button data-filter="short" aria-pressed="false">Short only</button>
  <button data-filter="crypto" aria-pressed="false">Crypto</button>
  <button data-filter="tradfi" aria-pressed="false">Tradfi</button>
</div>

<div class="grid" id="grid"></div>

<p class="legend">
  <span>Q quarterly VWAP (2pts)</span><span>T trend</span><span>P pullback</span>
  <span>S support</span><span>X extreme</span><span>V volume</span>
  <span class="vw">— purple line = quarterly VWAP</span>
</p>
<p class="note">Volatility percentile is the name&rsquo;s own 252-bar rank: low means coiled,
high means already moving. High convergence scores select coiled names, so expect most of
these to be quiet.</p>
</div>

<script>
const DATA = ${data};

function drawChart(canvas, bars, qvwap) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const up = css.getPropertyValue("--up").trim();
  const down = css.getPropertyValue("--down").trim();
  const line = css.getPropertyValue("--line").trim();
  const vwapCol = css.getPropertyValue("--vwap").trim();

  const padL = 2, padR = 46, padT = 8, padB = 26;
  const plotW = w - padL - padR, plotH = h - padT - padB;

  let lo = Infinity, hi = -Infinity;
  for (const b of bars) { if (b[3] < lo) lo = b[3]; if (b[2] > hi) hi = b[2]; }
  if (qvwap) { lo = Math.min(lo, qvwap); hi = Math.max(hi, qvwap); }
  const pad = (hi - lo) * 0.06 || 1;
  lo -= pad; hi += pad;
  const y = p => padT + plotH - ((p - lo) / (hi - lo)) * plotH;

  // horizontal guides
  ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.globalAlpha = 0.55;
  ctx.font = "10px ui-monospace, Consolas, monospace";
  ctx.fillStyle = css.getPropertyValue("--faint").trim();
  for (let i = 0; i <= 3; i++) {
    const p = lo + ((hi - lo) * i) / 3, yy = Math.round(y(p)) + 0.5;
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + plotW, yy); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillText(p >= 1000 ? Math.round(p).toLocaleString() : p >= 1 ? p.toFixed(2) : p.toPrecision(3),
      padL + plotW + 5, yy + 3);
    ctx.globalAlpha = 0.55;
  }
  ctx.globalAlpha = 1;

  const bw = plotW / bars.length;
  const body = Math.max(1, Math.min(6, bw * 0.62));
  bars.forEach((b, i) => {
    const cx = padL + bw * (i + 0.5);
    const bull = b[4] >= b[1];
    ctx.strokeStyle = bull ? up : down;
    ctx.fillStyle = bull ? up : down;
    ctx.beginPath();
    ctx.moveTo(Math.round(cx) + 0.5, y(b[2]));
    ctx.lineTo(Math.round(cx) + 0.5, y(b[3]));
    ctx.stroke();
    const top = y(Math.max(b[1], b[4])), bot = y(Math.min(b[1], b[4]));
    ctx.fillRect(cx - body / 2, top, body, Math.max(1, bot - top));
  });

  if (qvwap) {
    ctx.strokeStyle = vwapCol; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    const yy = Math.round(y(qvwap)) + 0.5;
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + plotW, yy); ctx.stroke();
    ctx.setLineDash([]);
  }
}

const grid = document.getElementById("grid");
DATA.forEach(d => {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.side = d.side;
  card.dataset.cat = d.category === "crypto" || d.category === "index" ? "crypto" : "tradfi";
  const pct = v => v === null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
  card.innerHTML =
    '<div class="chead"><span class="tkr">' + d.base +
      '<span class="badge ' + d.side + '">' + d.side.toUpperCase() + '</span>' +
      (d.category !== "crypto" ? '<span class="badge cat">' + d.category + '</span>' : '') +
    '</span><span class="score">' + d.score + '/' + d.maxScore + '</span></div>' +
    '<canvas></canvas>' +
    '<div class="cfoot"><span>' + d.factors + '</span>' +
      '<span>RSI ' + (d.rsi === null ? "—" : Math.round(d.rsi)) + '</span>' +
      '<span>qVWAP ' + pct(d.vwapDistPct) + '</span>' +
      '<span>5d ' + pct(d.changePct) + '</span>' +
      '<span>vol ' + (d.volPctl === null ? "—" : Math.round(d.volPctl)) + '</span></div>';
  grid.appendChild(card);
  drawChart(card.querySelector("canvas"), d.bars, d.qvwap);
});

document.querySelectorAll(".controls button").forEach(btn => {
  btn.addEventListener("click", () => {
    const f = btn.dataset.filter;
    document.querySelectorAll(".controls button").forEach(b =>
      b.setAttribute("aria-pressed", String(b === btn)));
    document.querySelectorAll(".card").forEach(c => {
      const show = f === "all" || c.dataset.side === f || c.dataset.cat === f;
      c.classList.toggle("hidden", !show);
    });
  });
});

// Redraw on resize and on theme change so colors and scale stay correct.
let t;
addEventListener("resize", () => {
  clearTimeout(t);
  t = setTimeout(() => document.querySelectorAll(".card").forEach((c, i) =>
    drawChart(c.querySelector("canvas"), DATA[i].bars, DATA[i].qvwap)), 150);
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () =>
  document.querySelectorAll(".card").forEach((c, i) =>
    drawChart(c.querySelector("canvas"), DATA[i].bars, DATA[i].qvwap)));
</script>`;
}

async function main() {
  const result = await selectConvergencePicks();
  const picks = [...result.longs, ...result.shorts];
  logger.info("chart-page", "Shortlist selected", {
    longs: result.longs.length,
    shorts: result.shorts.length,
  });

  const payloads: ChartPayload[] = [];
  for (const p of picks) {
    // Re-fetch a short window per name rather than reusing the screen's 400-bar
    // pull: the chart only needs ~30 days, and a small request keeps the page
    // light and the venue budget cheap.
    const bars: PerpBar[] = await binanceVenue.fetchBars(p.symbol, "4h", CHART_BARS + 1);
    if (!bars.length) continue;
    payloads.push({
      base: p.base,
      symbol: p.symbol,
      side: p.side,
      score: p.score,
      maxScore: p.maxScore,
      category: p.category,
      factors: initials(p),
      rsi: p.rsi,
      volPctl: p.volPctl,
      changePct: p.changePct,
      vwapDistPct: p.vwapDistPct,
      qvwap: quarterlyVwap(bars),
      bars: bars.map((b) => [b.t, b.o, b.h, b.l, b.c, b.v]),
    });
  }

  const asOf = result.asOf.replace("T", " ").slice(0, 16) + "Z";
  writeFileSync(OUT, buildHtml(payloads, asOf, result.funnel));
  console.log(`Wrote ${OUT} — ${payloads.length} charts`);
}

main().catch((err) => {
  logger.error("chart-page", "Chart page build failed", { error: err });
  process.exit(1);
});
