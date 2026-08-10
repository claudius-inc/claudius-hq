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
 * the forward return over a fixed horizon. Three readings:
 *
 *   1. Bucket means — average excess return by convergence score. Answers "does
 *      a 4/5 beat a 2/5", which is what the screen rests on.
 *   2. Information coefficient — per-timestamp rank correlation between the net
 *      score and forward excess return. One timestamp is one observation built
 *      from the whole cross-section.
 *   3. Walk-forward blocks — the same IC computed on disjoint contiguous
 *      windows. A signal that is real has a stable sign across blocks; one
 *      fitted to a single regime does not. This is the decisive test, and no
 *      pooled number should be trusted without it.
 *
 * SAMPLING — READ THIS BEFORE CHANGING THE LOOP
 * ---------------------------------------------
 * Timestamps are drawn from a GLOBAL grid built from the union of every
 * symbol's bar times, then stepped by `horizon`. The obvious alternative —
 * stepping each symbol's own array by index — is subtly and severely wrong:
 * symbols have different history lengths, so `bars[300]` is a different moment
 * for each one, and symbols land on disjoint timestamp lattices that never
 * share a cross-section. Measured on the live universe, index stepping produced
 * 22 disjoint lattices at the 7-day horizon whose largest cross-section held
 * 469 crypto names and ZERO tradfi names, while the surviving lattices
 * overlapped each other in time and were then pooled as though independent —
 * inflating every t-statistic by roughly the square root of the lattice count.
 *
 * RETURNS ARE EXCESS WITHIN CATEGORY
 * ----------------------------------
 * Not against the whole cross-section. Crypto is ~85% of the universe, so
 * demeaning an equity perp against everything measures equity-vs-crypto beta,
 * not stock selection. Each category is demeaned against itself.
 *
 * COSTS
 * -----
 * Round-trip taker fees plus per-name funding, applied BEFORE demeaning. Fees
 * are common across names so they do not move the IC; funding does not behave
 * that way — tradfi funding runs 3-12x crypto funding, so a screen that leans
 * tradfi pays a carry that demeaning would otherwise hide.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import {
  binanceVenue,
  fetchBarsForAll,
  sleep,
  type PerpBar,
  type PerpSymbol,
} from "@/lib/markets/perp-venues";
import { computeMcdSeries, MCD_WARMUP, type McdBar } from "@/lib/markets/mcd";
import { spearman, summarizeIc } from "@/lib/markets/backtest";

const INTERVAL = "4h" as const;

/**
 * 500, not 1500. Binance weights klines by `limit`: <=100 costs 1, <=500 costs
 * 2, <=1000 costs 5, above that 10, against 2400/min. 620 symbols at limit 1500
 * is 6,200 weight fired at concurrency 6 — it completes only because the retry
 * path absorbs the 429s, after tripping a 418 ban. At 500 the whole sweep is
 * ~1,240 weight and fits inside one minute.
 */
const BAR_LIMIT = 500;

/** Forward windows in 4h bars: 1 day, 3 days, 7 days. */
const HORIZONS = [6, 18, 42];

/** Binance USDⓈ-M taker fee, per side, VIP 0. */
const TAKER_FEE_PCT = 0.05;
const ROUND_TRIP_FEE_PCT = TAKER_FEE_PCT * 2;

/** Funding settles every 8 hours = every 2 bars at 4h. */
const BARS_PER_FUNDING = 2;

/** Walk-forward blocks. */
const N_BLOCKS = 5;

const CACHE_DIR = join(process.cwd(), "tmp", "perp-backtest");
const CACHE_FILE = join(CACHE_DIR, `bars-${INTERVAL}.json`);
const FUNDING_FILE = join(CACHE_DIR, "funding.json");

interface CachedPayload {
  fetchedAt: string;
  symbols: PerpSymbol[];
  bars: Record<string, PerpBar[]>;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

function stderr(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v / xs.length);
}

const fmt = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : "—");

async function loadBars(refresh: boolean): Promise<CachedPayload> {
  if (!refresh && existsSync(CACHE_FILE)) {
    const cached = JSON.parse(readFileSync(CACHE_FILE, "utf8")) as CachedPayload;
    // Bars cached before `tClose` existed would silently break the staleness
    // logic downstream; force a refresh rather than reason about half-shapes.
    const first = Object.values(cached.bars)[0];
    if (first?.[0]?.tClose !== undefined) {
      console.log(`Using cached bars from ${cached.fetchedAt} (--refresh to re-fetch)`);
      return cached;
    }
    console.log("Cached bars predate the tClose field; re-fetching.");
  }

  console.log("Fetching Binance perp universe...");
  const symbols = await binanceVenue.listSymbols();
  console.log(`  ${symbols.length} live perps`);

  console.log(`Fetching ${BAR_LIMIT} ${INTERVAL} bars each...`);
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

/**
 * Mean funding rate per symbol, as a fraction per 8h settlement.
 *
 * Cached separately from bars because it changes slowly and the fetch is one
 * request per symbol. A symbol with no funding history contributes 0 rather
 * than being dropped — missing funding should not delete an observation.
 */
async function loadFunding(symbols: PerpSymbol[], refresh: boolean): Promise<Record<string, number>> {
  if (!refresh && existsSync(FUNDING_FILE)) {
    return JSON.parse(readFileSync(FUNDING_FILE, "utf8")) as Record<string, number>;
  }

  console.log("Fetching funding-rate history...");
  const out: Record<string, number> = {};
  let cursor = 0;

  const worker = async () => {
    while (cursor < symbols.length) {
      const s = symbols[cursor++];
      try {
        const res = await fetch(
          `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${s.symbol}&limit=1000`,
          { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) },
        );
        if (!res.ok) {
          if (res.status === 429 || res.status === 418) await sleep(2000);
          continue;
        }
        const rows = (await res.json()) as { fundingRate: string }[];
        const rates = rows.map((r) => Number(r.fundingRate)).filter(Number.isFinite);
        if (rates.length) out[s.symbol] = mean(rates);
      } catch {
        // Funding is a cost adjustment, not the measurement; a failure here
        // must not remove the symbol from the study.
      }
    }
  };

  await Promise.all(Array.from({ length: 6 }, worker));
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(FUNDING_FILE, JSON.stringify(out));
  console.log(`  funding for ${Object.keys(out).length}/${symbols.length} symbols`);
  return out;
}

const FACTOR_KEYS = ["trend", "pullback", "support", "proximity", "vsa"] as const;
type FactorKey = (typeof FACTOR_KEYS)[number];

interface Obs {
  t: number;
  symbol: string;
  category: string;
  longScore: number;
  shortScore: number;
  longFactors: Record<FactorKey, boolean>;
  shortFactors: Record<FactorKey, boolean>;
  /** Gross forward return, %. */
  fwdGross: number;
  /** Net of round-trip fees and per-name funding, %. Sign depends on side. */
  fwdNetLong: number;
  fwdNetShort: number;
  /** Net-of-cost long return minus the category mean at this timestamp. */
  excess: number;
}

function bucketTable(obs: Obs[], key: "longScore" | "shortScore", label: string): void {
  console.log(`\n  ${label}`);
  console.log("  score |      n | mean excess % |  stderr | t-stat | win%");
  console.log("  ------+--------+---------------+---------+--------+------");
  for (let s = 0; s <= 5; s++) {
    const rows = obs.filter((o) => o[key] === s);
    if (rows.length === 0) continue;
    const ex = rows.map((o) => (key === "longScore" ? o.excess : -o.excess));
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

function factorTable(obs: Obs[]): void {
  console.log("\n  Per-factor edge (mean excess when ON minus when OFF, %) and fire rate");
  console.log("  factor     | long fire% |  long edge |     t | short fire% | short edge |     t");
  console.log("  -----------+------------+------------+-------+-------------+------------+------");

  for (const key of FACTOR_KEYS) {
    const cells: string[] = [];
    for (const side of ["longFactors", "shortFactors"] as const) {
      const sign = side === "longFactors" ? 1 : -1;
      const on = obs.filter((o) => o[side][key]).map((o) => sign * o.excess);
      const off = obs.filter((o) => !o[side][key]).map((o) => sign * o.excess);
      if (on.length < 30 || off.length < 30) {
        cells.push("—".padStart(10), "—".padStart(10), "—".padStart(5));
        continue;
      }
      const edge = mean(on) - mean(off);
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

function run(
  payload: CachedPayload,
  funding: Record<string, number>,
  horizon: number,
): void {
  const symbolMeta = new Map(payload.symbols.map((s) => [s.symbol, s]));

  // ---- score every symbol once, and index its bars BY TIMESTAMP ----
  const scoredByTime = new Map<
    string,
    { idx: Map<number, number>; bars: PerpBar[]; series: ReturnType<typeof computeMcdSeries> }
  >();
  const allTimes = new Set<number>();
  let tooShort = 0;

  for (const [symbol, bars] of Object.entries(payload.bars)) {
    if (!symbolMeta.has(symbol)) continue;
    if (bars.length < MCD_WARMUP + horizon + 1) {
      tooShort++;
      continue;
    }
    const mcdBars: McdBar[] = bars.map((b) => ({ o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
    const series = computeMcdSeries(mcdBars);

    const idx = new Map<number, number>();
    for (let i = 0; i < bars.length; i++) {
      idx.set(bars[i].t, i);
      // Only timestamps that could ever be sampled join the global grid.
      if (i >= MCD_WARMUP && i + horizon < bars.length) allTimes.add(bars[i].t);
    }
    scoredByTime.set(symbol, { idx, bars, series });
  }

  // ---- global timestamp grid, stepped by horizon (non-overlapping) ----
  const grid = Array.from(allTimes).sort((a, b) => a - b);
  const sampled: number[] = [];
  for (let i = 0; i < grid.length; i += horizon) sampled.push(grid[i]);

  const obs: Obs[] = [];
  const icByTime: { t: number; ic: number }[] = [];
  let thinDrops = 0;

  for (const t of sampled) {
    const rows: Omit<Obs, "excess">[] = [];

    for (const [symbol, s] of Array.from(scoredByTime.entries())) {
      const i = s.idx.get(t);
      if (i === undefined) continue;
      if (i < MCD_WARMUP || i + horizon >= s.bars.length) continue;

      const entry = s.bars[i].c;
      const exit = s.bars[i + horizon].c;
      if (!entry || !exit) continue;

      const gross = (100 * (exit - entry)) / entry;

      // Funding is paid by longs when positive, received by shorts.
      const fundingPct = ((funding[symbol] ?? 0) * 100 * horizon) / BARS_PER_FUNDING;
      const r = s.series[i];
      const meta = symbolMeta.get(symbol)!;

      rows.push({
        t,
        symbol,
        category: meta.category,
        longScore: r.longScore,
        shortScore: r.shortScore,
        longFactors: r.longFactors,
        shortFactors: r.shortFactors,
        fwdGross: gross,
        fwdNetLong: gross - fundingPct - ROUND_TRIP_FEE_PCT,
        fwdNetShort: -gross + fundingPct - ROUND_TRIP_FEE_PCT,
      });
    }

    if (rows.length < 30) {
      thinDrops++;
      continue;
    }

    // Demean WITHIN category. A category with too few names at this timestamp
    // cannot define its own mean, so it is dropped rather than demeaned against
    // a different asset class.
    const byCat = new Map<string, Omit<Obs, "excess">[]>();
    for (const r of rows) {
      const g = byCat.get(r.category);
      if (g) g.push(r);
      else byCat.set(r.category, [r]);
    }

    const withExcess: Obs[] = [];
    for (const [, group] of Array.from(byCat.entries())) {
      if (group.length < 5) continue;
      const m = mean(group.map((r) => r.fwdNetLong));
      for (const r of group) withExcess.push({ ...r, excess: r.fwdNetLong - m });
    }

    if (withExcess.length < 30) {
      thinDrops++;
      continue;
    }
    obs.push(...withExcess);

    icByTime.push({
      t,
      ic: spearman(
        withExcess.map((r) => r.longScore - r.shortScore),
        withExcess.map((r) => r.excess),
      ),
    });
  }

  const days = ((horizon * 4) / 24).toFixed(1);
  console.log("\n" + "=".repeat(76));
  console.log(
    `HORIZON ${horizon} bars (${days} days) — ${obs.length} observations across ` +
      `${icByTime.length} timestamps · ${scoredByTime.size} symbols · ` +
      `${tooShort} too short · ${thinDrops} thin timestamps dropped`,
  );
  console.log(
    `Costs applied: ${ROUND_TRIP_FEE_PCT.toFixed(2)}% round trip + per-name funding`,
  );
  console.log("=".repeat(76));

  bucketTable(obs, "longScore", "LONG convergence score vs forward excess return (net)");
  bucketTable(obs, "shortScore", "SHORT convergence score vs forward excess return (net)");
  factorTable(obs);

  // ---- the rule the screen actually ships ----
  const longRule = obs.filter((o) => o.longScore >= 3 && o.longScore > o.shortScore);
  const shortRule = obs.filter((o) => o.shortScore >= 3 && o.shortScore > o.longScore);
  const le = longRule.map((o) => o.excess);
  const se = shortRule.map((o) => -o.excess);

  console.log("\n  SHIPPED rule (score >= 3 AND strictly greater than the opposing side):");
  console.log(
    `    long  n=${longRule.length}  mean excess ${fmt(mean(le))}%  t=${fmt(mean(le) / stderr(le), 2)}`,
  );
  console.log(
    `    short n=${shortRule.length}  mean excess ${fmt(mean(se))}%  t=${fmt(mean(se) / stderr(se), 2)}`,
  );

  // ---- IC, pooled and walk-forward ----
  const ic = summarizeIc(icByTime.map((x) => x.ic));
  console.log("\n  Information coefficient (net score vs excess return):");
  console.log(
    `    pooled: n=${ic.n} timestamps  meanIC=${fmt(ic.meanIc)}  t=${fmt(ic.tStat, 2)}  ` +
      `hitRate=${fmt(ic.hitRate, 1)}%`,
  );

  const blockSize = Math.floor(icByTime.length / N_BLOCKS);
  if (blockSize >= 3) {
    console.log("\n    walk-forward blocks (sign stability is the real test):");
    const signs: number[] = [];
    for (let b = 0; b < N_BLOCKS; b++) {
      const slice = icByTime.slice(b * blockSize, (b + 1) * blockSize);
      const s = summarizeIc(slice.map((x) => x.ic));
      const from = new Date(slice[0].t).toISOString().slice(0, 10);
      const to = new Date(slice[slice.length - 1].t).toISOString().slice(0, 10);
      signs.push(Math.sign(s.meanIc));
      console.log(
        `      block ${b + 1} ${from}..${to}  n=${String(s.n).padStart(3)}  ` +
          `IC=${fmt(s.meanIc).padStart(7)}  t=${fmt(s.tStat, 2).padStart(6)}`,
      );
    }
    const neg = signs.filter((x) => x < 0).length;
    console.log(
      `      sign stability: ${Math.max(neg, N_BLOCKS - neg)}/${N_BLOCKS} blocks agree ` +
        `(${neg} negative)`,
    );
  } else {
    console.log(`\n    walk-forward skipped: only ${icByTime.length} timestamps`);
  }

  // ---- cohorts ----
  console.log("\n  By category (shipped rule):");
  for (const cohort of ["crypto", "equity", "commodity", "premarket", "index"]) {
    const c = obs.filter((o) => o.category === cohort);
    if (c.length < 100) {
      if (c.length) console.log(`    ${cohort.padEnd(10)} n=${c.length} — too few to report`);
      continue;
    }
    const cl = c.filter((o) => o.longScore >= 3 && o.longScore > o.shortScore).map((o) => o.excess);
    const cs = c.filter((o) => o.shortScore >= 3 && o.shortScore > o.longScore).map((o) => -o.excess);
    console.log(
      `    ${cohort.padEnd(10)} n=${String(c.length).padStart(6)}  ` +
        `long ${fmt(mean(cl)).padStart(7)}% (n=${cl.length})  ` +
        `short ${fmt(mean(cs)).padStart(7)}% (n=${cs.length})`,
    );
  }
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const payload = await loadBars(refresh);
  const funding = await loadFunding(payload.symbols, refresh);

  const counts: Record<string, number> = {};
  for (const s of payload.symbols) counts[s.category] = (counts[s.category] ?? 0) + 1;
  console.log(`\nUniverse: ${payload.symbols.length} perps`, counts);
  console.log(`Bars for ${Object.keys(payload.bars).length} symbols`);

  // The harness prints roughly 120 t-tests. At alpha=0.05 about six will read
  // "significant" from noise alone, so a single starred cell means nothing on
  // its own — only the walk-forward sign stability does.
  console.log(
    "\nNOTE: ~120 t-tests are printed below. ~6 spurious 'significant' cells are\n" +
      "expected at alpha=0.05. Judge the signal on walk-forward sign stability,\n" +
      "not on any individual cell.",
  );

  for (const h of HORIZONS) run(payload, funding, h);
}

main().catch((err) => {
  console.error("Backtest failed:", err);
  process.exit(1);
});
