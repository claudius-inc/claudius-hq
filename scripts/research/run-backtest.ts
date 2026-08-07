/**
 * Replays the production scorers over cached history and reports information
 * coefficient, quantile spreads, and a bucket study of the momentum band.
 *
 * Run with:
 *   npx tsx scripts/research/fetch-price-history.ts   # once, populates .cache
 *   npx tsx scripts/research/run-backtest.ts
 *   npx tsx scripts/research/run-backtest.ts --horizon 20
 *
 * Every return reported is EXCESS over the equal-weight mean of the scorable
 * universe on that date, so none of these numbers are flattered by a rising
 * market. Dates are sampled `horizon` trading days apart, so the forward
 * windows never overlap and the t-statistics are honest.
 */
import * as fs from "fs";
import * as path from "path";
import {
  replay,
  spearman,
  summarizeIc,
  quantileSpread,
  type Bar,
  type DateSlice,
  type ScoredRow,
} from "@/lib/markets/backtest";

const CACHE_DIR = path.join(process.cwd(), ".cache", "price-history");

const argOf = (flag: string, fallback: string): string => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const HORIZONS = argOf("--horizon", "5,20").split(",").map(Number);

function loadHistory(): Map<string, Bar[]> {
  if (!fs.existsSync(CACHE_DIR)) {
    throw new Error(`No cache at ${CACHE_DIR}. Run fetch-price-history.ts first.`);
  }
  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));
  const out = new Map<string, Bar[]>();
  for (const f of files) {
    const bars = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), "utf8")) as Bar[];
    if (bars.length >= 300) out.set(f.replace(/\.json$/, ""), bars);
  }
  return out;
}

const pctf = (v: number, d = 2) => (Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(d)}%` : "  n/a");
const numf = (v: number, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : "n/a");

/**
 * Excess-return stats for rows whose `score` falls in [lo, hi].
 *
 * The median is reported alongside the mean deliberately. Equity return
 * distributions are heavily right-skewed, so a bucket can post a strong mean
 * off a handful of names that doubled while most of its members lagged. A high
 * mean next to a below-average win rate and a negative median is a skew
 * artifact, not a tradeable edge.
 */
function bucket(
  slices: DateSlice[],
  score: (r: ScoredRow) => number,
  lo: number,
  hi: number,
): { n: number; mean: number; median: number; win: number } {
  const rows = slices.flatMap((s) => s.rows).filter((r) => score(r) >= lo && score(r) <= hi);
  if (rows.length === 0) return { n: 0, mean: NaN, median: NaN, win: NaN };
  const mean = rows.reduce((a, b) => a + b.excess, 0) / rows.length;
  const sorted = rows.map((r) => r.excess).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const win = (100 * rows.filter((r) => r.excess > 0).length) / rows.length;
  return { n: rows.length, mean, median, win };
}

const bucketLine = (label: string, b: ReturnType<typeof bucket>) =>
  `    ${label.padEnd(10)} n=${String(b.n).padStart(6)}  mean ${pctf(b.mean).padStart(7)}` +
  `  median ${pctf(b.median).padStart(7)}` +
  `  win ${Number.isFinite(b.win) ? b.win.toFixed(0).padStart(3) : " n/a"}%`;

function reportIc(label: string, slices: DateSlice[], score: (r: ScoredRow) => number) {
  const ics = slices.map((s) => spearman(s.rows.map(score), s.rows.map((r) => r.excess)));
  const s = summarizeIc(ics);
  const spreads = slices
    .map((sl) => quantileSpread(sl.rows, score, 5).spread)
    .filter(Number.isFinite);
  const meanSpread = spreads.length ? spreads.reduce((a, b) => a + b, 0) / spreads.length : NaN;

  console.log(
    `  ${label.padEnd(16)} IC ${numf(s.meanIc).padStart(7)}  t ${numf(s.tStat, 2).padStart(6)}` +
      `  IC>0 ${s.hitRate.toFixed(0).padStart(3)}%  Q5-Q1 ${pctf(meanSpread).padStart(7)}  (n=${s.n} dates)`,
  );
  return s;
}

function main() {
  const history = loadHistory();
  const totalBars = [...history.values()].reduce((a, b) => a + b.length, 0);
  console.log(`Loaded ${history.size} tickers · ${totalBars.toLocaleString()} bars`);
  console.log(
    "All returns are EXCESS over the universe equal-weight mean on the same date.\n",
  );

  for (const horizon of HORIZONS) {
    const t0 = Date.now();
    const slices = replay(history, { horizon });
    if (slices.length === 0) {
      console.log(`Horizon ${horizon}d: no scorable dates.\n`);
      continue;
    }

    const names = slices.reduce((a, s) => a + s.rows.length, 0) / slices.length;
    console.log(
      `═══ Horizon ${horizon}d · ${slices.length} non-overlapping dates · ` +
        `${names.toFixed(0)} names/date · ${slices[0].date} → ${slices.at(-1)!.date} ` +
        `· ${((Date.now() - t0) / 1000).toFixed(0)}s`,
    );

    console.log("\n  Information coefficient (Spearman: score rank vs forward excess return)");
    reportIc("momentum_score", slices, (r) => r.momentum);
    reportIc("technical_score", slices, (r) => r.technical);
    reportIc("mom+tech", slices, (r) => r.momentum + r.technical);
    // The key the report ranked on BEFORE this work — the honest baseline for
    // judging whether switching to technical_score was an improvement.
    reportIc("delta (old key)", slices, (r) => r.momentumDelta);

    // The momentum band (40-69) was fitted in-sample on 22 live days. This is
    // the out-of-sample test of that constant.
    console.log("\n  momentum_score buckets (excess return)");
    for (const [lo, hi] of [[0, 19], [20, 39], [40, 69], [70, 84], [85, 100]] as const) {
      console.log(bucketLine(`${lo}-${hi}`, bucket(slices, (r) => r.momentum, lo, hi)));
    }

    console.log("\n  technical_score buckets (excess return)");
    for (const [lo, hi] of [[0, 39], [40, 59], [60, 74], [75, 100]] as const) {
      console.log(bucketLine(`${lo}-${hi}`, bucket(slices, (r) => r.technical, lo, hi)));
    }

    // What the shipped screen actually selects: technical >= 60 as the ranking
    // gate, with and without the fitted momentum band on top.
    console.log("\n  Shipped-screen approximation (structure gates only, no liquidity/cooldown)");
    console.log(bucketLine("tech>=60", bucket(slices, (r) => r.technical, 60, 100)));

    const banded = slices.map((s) => ({
      ...s,
      rows: s.rows.filter((r) => r.momentum >= 40 && r.momentum <= 69),
    }));
    console.log(bucketLine("+mom40-69", bucket(banded, (r) => r.technical, 60, 100)));
    console.log();
  }
}

try {
  main();
  process.exit(0);
} catch (err) {
  console.error("Backtest failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
