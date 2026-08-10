/**
 * Does MCD convergence actually predict forward returns on Binance perps?
 *
 * Run with:
 *   npx tsx scripts/research/run-perp-convergence-backtest.ts
 *   npx tsx scripts/research/run-perp-convergence-backtest.ts --refresh
 *
 * METHOD
 * ------
 * For every perp, score every 4h bar with the ported MCD engine, then measure
 * the forward return over a fixed horizon. Two complementary readings:
 *
 *   1. Bucket means — average EXCESS return by convergence score. This answers
 *      "does a 4/5 do better than a 2/5", which is the question the screen
 *      actually rests on. A monotone ladder is the thing worth seeing.
 *   2. Information coefficient — per-timestamp rank correlation between the net
 *      score (long minus short) and forward excess return. One timestamp is one
 *      observation built from the whole cross-section, so significance arrives
 *      in far fewer observations than a win-rate test on a top-10 list.
 *
 * Returns are EXCESS over the equal-weight mean of everything scorable at that
 * timestamp. Perps are ~0.9 correlated to BTC; without demeaning, any long-side
 * result would mostly be measuring whether the sample window was a bull market.
 *
 * Timestamps are sampled `horizon` bars apart so forward windows never overlap.
 * Overlapping windows are autocorrelated and would inflate the t-statistic.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import {
  binanceVenue,
  fetchBarsForAll,
  type PerpBar,
  type PerpSymbol,
} from "@/lib/markets/perp-venues";
import { computeMcdSeries, MCD_WARMUP, type McdBar } from "@/lib/markets/mcd";
import { spearman, summarizeIc } from "@/lib/markets/backtest";

const INTERVAL = "4h" as const;
const BAR_LIMIT = 1500; // ~250 days of 4h bars, the venue maximum per request

/** Forward windows in 4h bars: 1 day, 3 days, 7 days. */
const HORIZONS = [6, 18, 42];

const CACHE_DIR = join(process.cwd(), "tmp", "perp-backtest");
const CACHE_FILE = join(CACHE_DIR, `bars-${INTERVAL}.json`);

interface CachedPayload {
  fetchedAt: string;
  symbols: PerpSymbol[];
  bars: Record<string, PerpBar[]>;
}

async function loadBars(refresh: boolean): Promise<CachedPayload> {
  if (!refresh && existsSync(CACHE_FILE)) {
    const cached = JSON.parse(readFileSync(CACHE_FILE, "utf8")) as CachedPayload;
    console.log(`Using cached bars from ${cached.fetchedAt} (--refresh to re-fetch)`);
    return cached;
  }

  console.log("Fetching Binance perp universe...");
  const symbols = await binanceVenue.listSymbols();
  console.log(`  ${symbols.length} live perps`);

  console.log(`Fetching ${BAR_LIMIT} ${INTERVAL} bars each (this takes a few minutes)...`);
  const barMap = await fetchBarsForAll(binanceVenue, symbols, INTERVAL, BAR_LIMIT, 6);

  const payload: CachedPayload = {
    fetchedAt: new Date().toISOString(),
    symbols,
    bars: Object.fromEntries(barMap),
  };
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(payload));
  return payload;
}

const FACTOR_KEYS = ["trend", "pullback", "support", "proximity", "vsa"] as const;
type FactorKey = (typeof FACTOR_KEYS)[number];

interface Obs {
  t: number;
  symbol: string;
  category: string;
  longScore: number;
  shortScore: number;
  longFlag: boolean;
  shortFlag: boolean;
  longFactors: Record<FactorKey, boolean>;
  shortFactors: Record<FactorKey, boolean>;
  fwd: number;
  excess: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** Standard error of the mean — a bucket mean without one is unreadable. */
function stderr(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v / xs.length);
}

function fmt(v: number, digits = 3): string {
  return Number.isFinite(v) ? v.toFixed(digits) : "—";
}

function bucketTable(obs: Obs[], key: "longScore" | "shortScore", label: string): void {
  console.log(`\n  ${label}`);
  console.log("  score |      n | mean excess % |  stderr | t-stat | win%");
  console.log("  ------+--------+---------------+---------+--------+------");
  for (let s = 0; s <= 5; s++) {
    const rows = obs.filter((o) => o[key] === s);
    if (rows.length === 0) continue;
    const ex = rows.map((o) => o.excess);
    const m = mean(ex);
    const se = stderr(ex);
    const win = (100 * ex.filter((x) => x > 0).length) / ex.length;
    console.log(
      `  ${String(s).padStart(5)} | ${String(rows.length).padStart(6)} | ` +
        `${fmt(m).padStart(13)} | ${fmt(se).padStart(7)} | ` +
        `${fmt(se ? m / se : NaN, 2).padStart(6)} | ${fmt(win, 1).padStart(5)}`,
    );
  }
}

/**
 * Per-factor edge, measured on its own.
 *
 * The count treats all five as interchangeable. If one factor is predictive and
 * another is noise — or worse, inverted — the count averages the good one away.
 * `edge` is (mean excess when the factor fires) minus (mean excess when it does
 * not), so a positive long edge means the factor helps in the direction the
 * indicator intends.
 */
function factorTable(obs: Obs[]): void {
  console.log("\n  Per-factor edge (mean excess when ON minus when OFF, %)");
  console.log("  factor     | long fire% |  long edge |     t | short fire% | short edge |     t");
  console.log("  -----------+------------+------------+-------+-------------+------------+------");

  for (const key of FACTOR_KEYS) {
    const cells: string[] = [];
    for (const side of ["longFactors", "shortFactors"] as const) {
      const on = obs.filter((o) => o[side][key]).map((o) => o.excess);
      const off = obs.filter((o) => !o[side][key]).map((o) => o.excess);
      if (on.length < 30 || off.length < 30) {
        cells.push("—".padStart(11), "—".padStart(11), "—".padStart(5));
        continue;
      }
      const edge = mean(on) - mean(off);
      // Welch standard error — the two groups differ wildly in size.
      const se = Math.sqrt(stderr(on) ** 2 + stderr(off) ** 2);
      cells.push(
        fmt((100 * on.length) / obs.length, 1).padStart(10),
        fmt(edge).padStart(10),
        fmt(se ? edge / se : NaN, 2).padStart(5),
      );
    }
    console.log(
      `  ${key.padEnd(10)} | ${cells[0]} | ${cells[1]} | ${cells[2]} | ` +
        `${cells[3].padStart(11)} | ${cells[4]} | ${cells[5]}`,
    );
  }
}

function run(payload: CachedPayload, horizon: number): void {
  const symbolMeta = new Map(payload.symbols.map((s) => [s.symbol, s]));

  // Score every symbol once, then harvest non-overlapping observations.
  const raw: Omit<Obs, "excess">[] = [];
  let scored = 0;
  let tooShort = 0;

  for (const [symbol, bars] of Object.entries(payload.bars)) {
    const meta = symbolMeta.get(symbol);
    if (!meta) continue;
    if (bars.length < MCD_WARMUP + horizon + 1) {
      tooShort++;
      continue;
    }

    const mcdBars: McdBar[] = bars.map((b) => ({ o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
    const series = computeMcdSeries(mcdBars);
    scored++;

    // Step by `horizon` so forward windows never overlap.
    for (let i = MCD_WARMUP; i + horizon < bars.length; i += horizon) {
      const entry = bars[i].c;
      const exit = bars[i + horizon].c;
      if (!entry || !exit) continue;
      const r = series[i];
      raw.push({
        t: bars[i].t,
        symbol,
        category: meta.category,
        longScore: r.longScore,
        shortScore: r.shortScore,
        longFlag: r.longFlag,
        shortFlag: r.shortFlag,
        longFactors: r.longFactors,
        shortFactors: r.shortFactors,
        fwd: (100 * (exit - entry)) / entry,
      });
    }
  }

  // Demean within each timestamp. A timestamp with a thin cross-section gives a
  // noisy mean, so those are dropped rather than allowed to define "the market".
  const byTime = new Map<number, Omit<Obs, "excess">[]>();
  for (const o of raw) {
    const list = byTime.get(o.t);
    if (list) list.push(o);
    else byTime.set(o.t, [o]);
  }

  const obs: Obs[] = [];
  const ics: number[] = [];
  let thinDrops = 0;

  for (const [, rows] of Array.from(byTime.entries())) {
    if (rows.length < 30) {
      thinDrops++;
      continue;
    }
    const m = mean(rows.map((r) => r.fwd));
    const withExcess = rows.map((r) => ({ ...r, excess: r.fwd - m }));
    obs.push(...withExcess);

    // Net score: one number per name expressing the direction the factors lean.
    ics.push(
      spearman(
        withExcess.map((r) => r.longScore - r.shortScore),
        withExcess.map((r) => r.excess),
      ),
    );
  }

  const days = ((horizon * 4) / 24).toFixed(1);
  console.log("\n" + "=".repeat(72));
  console.log(`HORIZON ${horizon} bars (${days} days) — ${obs.length} observations, ` +
    `${scored} symbols scored, ${tooShort} too short, ${thinDrops} thin timestamps dropped`);
  console.log("=".repeat(72));

  bucketTable(obs, "longScore", "LONG convergence score vs forward excess return");
  bucketTable(obs, "shortScore", "SHORT convergence score vs forward excess return");
  factorTable(obs);

  // The headline test: does the screen's own rule separate winners from losers?
  const longs = obs.filter((o) => o.longScore >= 3);
  const shorts = obs.filter((o) => o.shortScore >= 3);
  const longEx = longs.map((o) => o.excess);
  const shortEx = shorts.map((o) => o.excess);
  const spread = mean(longEx) - mean(shortEx);

  console.log("\n  Screen rule (score >= 3):");
  console.log(
    `    long  n=${longs.length}  mean excess ${fmt(mean(longEx))}%  t=${fmt(mean(longEx) / stderr(longEx), 2)}`,
  );
  console.log(
    `    short n=${shorts.length}  mean excess ${fmt(mean(shortEx))}%  t=${fmt(mean(shortEx) / stderr(shortEx), 2)}`,
  );
  console.log(`    long-minus-short spread: ${fmt(spread)}%`);

  const ic = summarizeIc(ics);
  console.log("\n  Information coefficient (net score vs excess return):");
  console.log(
    `    n=${ic.n} timestamps  meanIC=${fmt(ic.meanIc)}  t=${fmt(ic.tStat, 2)}  ` +
      `hitRate=${fmt(ic.hitRate, 1)}%`,
  );

  // Split by cohort: the tradfi book is only months old and behaves differently
  // from crypto, so a blended number could hide one being useless.
  for (const cohort of ["crypto", "equity", "premarket", "commodity"]) {
    const c = obs.filter((o) => o.category === cohort);
    if (c.length < 200) continue;
    const cl = c.filter((o) => o.longScore >= 3).map((o) => o.excess);
    const cs = c.filter((o) => o.shortScore >= 3).map((o) => o.excess);
    console.log(
      `    ${cohort.padEnd(10)} n=${String(c.length).padStart(6)}  ` +
        `long>=3 ${fmt(mean(cl)).padStart(7)}% (n=${cl.length})  ` +
        `short>=3 ${fmt(mean(cs)).padStart(7)}% (n=${cs.length})`,
    );
  }
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const payload = await loadBars(refresh);

  const counts: Record<string, number> = {};
  for (const s of payload.symbols) counts[s.category] = (counts[s.category] ?? 0) + 1;
  console.log(`\nUniverse: ${payload.symbols.length} perps`, counts);
  console.log(`Bars fetched for ${Object.keys(payload.bars).length} symbols`);

  for (const h of HORIZONS) run(payload, h);
}

main().catch((err) => {
  console.error("Backtest failed:", err);
  process.exit(1);
});
