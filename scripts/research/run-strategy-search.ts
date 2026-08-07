/**
 * Strategy grid search with a sealed holdout.
 *
 * Run with:
 *   npx tsx scripts/research/run-strategy-search.ts
 *   npx tsx scripts/research/run-strategy-search.ts --target 70
 *
 * WHY THE HOLDOUT EXISTS
 * ----------------------
 * Searching a fixed sample until some configuration hits a target win rate is a
 * procedure that always succeeds, whether or not the edge is real: run enough
 * configs and the maximum of the sampling distribution clears any bar. This
 * script therefore splits dates chronologically BEFORE searching — the first
 * 70% is searchable, the last 30% is touched exactly once, at the end, by the
 * single best config. The holdout number is the only one that means anything.
 *
 * It also prints the win rate you would expect the best-of-N configs to reach
 * by pure chance, so a "winner" can be compared against the noise ceiling
 * rather than against 50%.
 *
 * THREE WIN RATES, DELIBERATELY
 * -----------------------------
 *   pickAbs   — share of individual picks with a positive raw return.
 *               Inflates with holding period and with a rising market; a
 *               long-only basket in a bull tape clears 70% with no skill.
 *   pickExc   — share of picks beating the universe mean that date. Excess
 *               returns are mean-zero by construction and right-skewed, so the
 *               median is negative and ~45% is the neutral baseline, not 50%.
 *   dateWin   — share of REBALANCE DATES where the basket beat the universe.
 *               This is the one that describes a strategy, and the one the
 *               search optimizes.
 */
import * as fs from "fs";
import * as path from "path";
import { replay, type Bar, type DateSlice, type ScoredRow } from "@/lib/markets/backtest";
import { rankZ } from "@/lib/markets/signals";

const CACHE_DIR = path.join(process.cwd(), ".cache", "price-history");

const argOf = (flag: string, fallback: string): string => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const TARGET = Number(argOf("--target", "70"));
const TRAIN_FRAC = 0.7;

function loadHistory(): Map<string, Bar[]> {
  const out = new Map<string, Bar[]>();
  for (const f of fs.readdirSync(CACHE_DIR).filter((x) => x.endsWith(".json"))) {
    const bars = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), "utf8")) as Bar[];
    if (bars.length >= 300) out.set(f.replace(/\.json$/, ""), bars);
  }
  return out;
}

// ---------------------------------------------------------------- strategy

type Direction = 1 | -1;
type FilterName = "none" | "us" | "usLiquid";

/**
 * Trade only in a rising tape, or always.
 *
 * Regime conditioning is one of the few levers that genuinely raises a win rate
 * rather than merely relabelling it: sitting out downtrends removes the dates
 * where most strategies lose. It costs coverage — roughly a third of dates go
 * untraded — so it must be judged on dates traded, not on the calendar.
 */
type Regime = "always" | "uptrend";

interface Strategy {
  label: string;
  signals: string[]; // rank-averaged when more than one
  direction: Direction;
  topN: number;
  horizon: number;
  filter: FilterName;
  regime: Regime;
}

/**
 * Effective independent observations.
 *
 * With overlapping forward windows, consecutive dates share most of their
 * return path: at horizon 120 sampled every 5 days, neighbouring dates overlap
 * by 115/120. A run of 55 such dates carries roughly 55*5/120 ~ 2 independent
 * observations, so a win rate computed from it is nearly information-free
 * however confident the percentage looks.
 */
const effectiveN = (dates: number, step: number, horizon: number) =>
  Math.max(1, Math.round((dates * step) / horizon));

interface Perf {
  dates: number;
  picks: number;
  /** Share of dates where the basket BEAT THE UNIVERSE. Pure selection skill. */
  dateWin: number;
  /** Share of dates where the basket simply MADE MONEY. Includes market drift,
   *  which is exactly why it must always be read next to the buy-everything
   *  baseline rather than against 50%. */
  dateAbs: number;
  pickAbs: number;
  pickExc: number;
  meanExcess: number;
  meanAbs: number;
}

function applyFilter(slice: DateSlice, filter: FilterName): ScoredRow[] {
  const isUS = (t: string) => !t.includes(".");
  if (filter === "none") return slice.rows;
  const us = slice.rows.filter((r) => isUS(r.ticker));
  if (filter === "us") return us;
  const advs = us
    .map((r) => r.advLocal)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  if (!advs.length) return [];
  const cut = advs[Math.floor(advs.length / 2)];
  return us.filter((r) => r.advLocal !== null && r.advLocal >= cut);
}

/**
 * Evaluate one strategy over a set of date slices.
 *
 * Excess is re-centred on the FILTERED population: leaving it relative to the
 * full universe would let a filter score well purely because of what it
 * excluded, which measures composition rather than selection.
 */
function evaluate(slices: DateSlice[], st: Strategy): Perf {
  let dateWins = 0, dateAbsWins = 0, dates = 0, picks = 0, absWins = 0, excWins = 0;
  let sumExcess = 0, sumAbs = 0;

  for (const slice of slices) {
    const pool = applyFilter(slice, st.filter);
    if (pool.length < Math.max(30, st.topN * 2)) continue;

    // Regime gate. Uses the cross-sectional median 12-1m return as a proxy for
    // "is this universe trending up" — it is already computed per name, needs
    // no index data, and is point-in-time by construction.
    if (st.regime === "uptrend") {
      const trend = pool
        .map((r) => r.signals.ret12mEx1m)
        .filter((v): v is number => v !== null && Number.isFinite(v))
        .sort((a, b) => a - b);
      if (!trend.length) continue;
      if (trend[Math.floor(trend.length / 2)] <= 0) continue; // sit out
    }

    const mean = pool.reduce((a, b) => a + b.fwd, 0) / pool.length;

    // Rank-average the component signals; rows missing any component drop out.
    const zs = st.signals.map((s) => rankZ(pool.map((r) => r.signals[s] ?? null)));
    const scored: { row: ScoredRow; score: number }[] = [];
    pool.forEach((row, i) => {
      const vals = zs.map((z) => z[i]);
      if (vals.some((v) => v === null)) return;
      const score = (vals as number[]).reduce((a, b) => a + b, 0) / vals.length;
      scored.push({ row, score: score * st.direction });
    });
    if (scored.length < Math.max(30, st.topN * 2)) continue;

    scored.sort((a, b) => b.score - a.score);
    const basket = scored.slice(0, st.topN);

    const basketExcess = basket.reduce((a, b) => a + (b.row.fwd - mean), 0) / basket.length;
    const basketAbs = basket.reduce((a, b) => a + b.row.fwd, 0) / basket.length;
    dates++;
    if (basketExcess > 0) dateWins++;
    if (basketAbs > 0) dateAbsWins++;
    for (const b of basket) {
      picks++;
      if (b.row.fwd > 0) absWins++;
      if (b.row.fwd - mean > 0) excWins++;
      sumExcess += b.row.fwd - mean;
      sumAbs += b.row.fwd;
    }
  }

  return {
    dates,
    picks,
    dateWin: dates ? (100 * dateWins) / dates : NaN,
    dateAbs: dates ? (100 * dateAbsWins) / dates : NaN,
    pickAbs: picks ? (100 * absWins) / picks : NaN,
    pickExc: picks ? (100 * excWins) / picks : NaN,
    meanExcess: picks ? sumExcess / picks : NaN,
    meanAbs: picks ? sumAbs / picks : NaN,
  };
}

// ------------------------------------------------------------------- grid

const SIGNAL_SETS: { label: string; signals: string[] }[] = [
  { label: "rev1w", signals: ["rev1w"] },
  { label: "rev1wVolAdj", signals: ["rev1wVolAdj"] },
  { label: "rev1m", signals: ["rev1m"] },
  { label: "mom12", signals: ["ret12mEx1m"] },
  { label: "mom12VolAdj", signals: ["mom12VolAdj"] },
  { label: "pos52w", signals: ["pos52w"] },
  { label: "lowVol", signals: ["lowVol"] },
  { label: "maStack", signals: ["maStack"] },
  { label: "trendPersist", signals: ["trendPersistence"] },
  { label: "volumeTrend", signals: ["volumeTrend"] },
  // Long-horizon momentum paired with short-horizon reversal is the classic
  // combination: the two operate at different frequencies and are close to
  // uncorrelated, so they can add where either alone does not.
  { label: "mom12+rev1w", signals: ["ret12mEx1m", "rev1wVolAdj"] },
  { label: "mom12+lowVol", signals: ["ret12mEx1m", "lowVol"] },
  { label: "rev1w+lowVol", signals: ["rev1wVolAdj", "lowVol"] },
  { label: "pos52w+rev1w", signals: ["pos52w", "rev1wVolAdj"] },
  { label: "mom+rev+lowVol", signals: ["ret12mEx1m", "rev1wVolAdj", "lowVol"] },
];

const TOP_NS = [5, 10, 20, 50];
const HORIZONS = [5, 10, 20, 60, 120, 250];
const FILTERS: FilterName[] = ["none", "us", "usLiquid"];
const DIRECTIONS: Direction[] = [1, -1];

/**
 * Date sampling stride. Non-overlapping sampling (step = horizon) is right for
 * significance testing, but it left the 20-day horizon with 35 train dates —
 * and the first search promptly picked its "winners" there, because the fewest
 * observations give the widest sampling distribution and therefore the highest
 * maximum. A fixed short stride gives every horizon a comparable number of
 * dates, so the grid cannot win by choosing the noisiest cell.
 *
 * The cost is overlapping forward windows, which are autocorrelated: fine for
 * ESTIMATING a win rate, invalid for a naive t-test on one. Significance here
 * comes from the holdout and the simulated null ceiling, not from a t-stat.
 */
const STEP = 5;

/**
 * Expected best-of-N win rate under the null, by simulation.
 *
 * With `nConfigs` independent coin-flip strategies over `nDates` dates, the
 * maximum observed win rate is well above 50% purely by chance. Comparing a
 * search winner against 50% instead of against this ceiling is the single
 * easiest way to fool yourself.
 */
function nullCeiling(nConfigs: number, nDates: number, trials = 2000): number {
  let s = 12345;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const maxes: number[] = [];
  for (let t = 0; t < trials; t++) {
    let best = 0;
    for (let c = 0; c < nConfigs; c++) {
      let w = 0;
      for (let d = 0; d < nDates; d++) if (rnd() < 0.5) w++;
      best = Math.max(best, w / nDates);
    }
    maxes.push(best);
  }
  maxes.sort((a, b) => a - b);
  return 100 * maxes[Math.floor(trials * 0.5)]; // median of the max
}

function main() {
  const history = loadHistory();
  console.log(`Loaded ${history.size} tickers · target dateWin ${TARGET}%\n`);

  // Replay once per horizon, then reuse across the grid.
  const byHorizon = new Map<number, DateSlice[]>();
  for (const h of HORIZONS) {
    const s = replay(history, { horizon: h, step: STEP, computeDelta: false });
    byHorizon.set(h, s);
    console.log(`  replay h=${String(h).padStart(2)} → ${s.length} dates, ${(s.reduce((a, x) => a + x.rows.length, 0) / (s.length || 1)).toFixed(0)} names/date`);
  }

  // Buy-everything benchmark. Without it a win rate has no reference point:
  // at long horizons equities drift up, so most picks are positive regardless
  // of selection, and a high pickAbs measures the market rather than the
  // strategy.
  console.log("\nBUY-EVERYTHING BASELINE (equal-weight whole universe)");
  console.log(`  ${"horizon".padStart(7)} ${"pickAbs".padStart(8)} ${"dateUp".padStart(8)}`);
  for (const h of HORIZONS) {
    const all = byHorizon.get(h)!;
    const rows = all.flatMap((s) => s.rows);
    const pickAbs = (100 * rows.filter((r) => r.fwd > 0).length) / rows.length;
    const dateUp = (100 * all.filter((s) => s.universeMean > 0).length) / all.length;
    console.log(`  ${String(h).padStart(7)} ${pickAbs.toFixed(1).padStart(7)}% ${dateUp.toFixed(1).padStart(7)}%`);
  }

  const results: { st: Strategy; train: Perf }[] = [];
  for (const set of SIGNAL_SETS)
    for (const dir of DIRECTIONS)
      for (const topN of TOP_NS)
        for (const h of HORIZONS)
          for (const filter of FILTERS)
            for (const regime of ["always", "uptrend"] as Regime[]) {
              const all = byHorizon.get(h)!;
              const split = Math.floor(all.length * TRAIN_FRAC);
              const st: Strategy = {
                label: `${dir > 0 ? "" : "-"}${set.label}${regime === "uptrend" ? "|up" : ""}`,
                signals: set.signals,
                direction: dir,
                topN,
                horizon: h,
                filter,
                regime,
              };
              const train = evaluate(all.slice(0, split), st);
              if (train.dates >= 50) results.push({ st, train });
            }

  const nConfigs = results.length;
  const medianDates = results[Math.floor(results.length / 2)].train.dates;
  const ceiling = nullCeiling(nConfigs, medianDates);

  console.log(`\n${nConfigs} configurations searched on the TRAIN split.`);
  console.log(
    `Null ceiling: with ${nConfigs} coin-flip strategies over ~${medianDates} dates, ` +
      `the best would reach ~${ceiling.toFixed(0)}% dateWin by chance alone.\n`,
  );

  results.sort((a, b) => b.train.dateWin - a.train.dateWin);

  console.log("TOP 15 ON TRAIN (in-sample — expect these to be flattered)");
  console.log(
    `  ${"strategy".padEnd(18)} ${"topN".padStart(4)} ${"h".padStart(3)} ${"filter".padEnd(9)} ` +
      `${"dateWin".padStart(8)} ${"pickAbs".padStart(8)} ${"pickExc".padStart(8)} ${"exc/pick".padStart(9)} ${"dates".padStart(6)}`,
  );
  for (const r of results.slice(0, 15)) {
    console.log(
      `  ${r.st.label.padEnd(18)} ${String(r.st.topN).padStart(4)} ${String(r.st.horizon).padStart(3)} ` +
        `${r.st.filter.padEnd(9)} ${r.train.dateWin.toFixed(1).padStart(7)}% ${r.train.pickAbs.toFixed(1).padStart(7)}% ` +
        `${r.train.pickExc.toFixed(1).padStart(7)}% ${r.train.meanExcess.toFixed(2).padStart(8)}% ${String(r.train.dates).padStart(6)}`,
    );
  }

  // The holdout is opened exactly once, for the top handful.
  console.log("\nHOLDOUT (last 30% of dates, never searched)");
  console.log(
    `  ${"strategy".padEnd(18)} ${"topN".padStart(4)} ${"h".padStart(3)} ${"filter".padEnd(9)} ` +
      `${"train".padStart(7)} ${"HOLDOUT".padStart(8)} ${"pickAbs".padStart(8)} ${"exc/pick".padStart(9)} ${"dates".padStart(6)} ${"effN".padStart(5)}`,
  );
  for (const r of results.slice(0, 12)) {
    const all = byHorizon.get(r.st.horizon)!;
    const split = Math.floor(all.length * TRAIN_FRAC);
    const test = evaluate(all.slice(split), r.st);
    const eff = effectiveN(test.dates, STEP, r.st.horizon);
    console.log(
      `  ${r.st.label.padEnd(18)} ${String(r.st.topN).padStart(4)} ${String(r.st.horizon).padStart(3)} ` +
        `${r.st.filter.padEnd(9)} ${r.train.dateWin.toFixed(1).padStart(6)}% ${test.dateWin.toFixed(1).padStart(7)}% ` +
        `${test.pickAbs.toFixed(1).padStart(7)}% ${test.meanExcess.toFixed(2).padStart(8)}% ${String(test.dates).padStart(6)} ${String(eff).padStart(5)}`,
    );
  }
  console.log(
    "\n  effN = effective INDEPENDENT observations after accounting for overlapping\n" +
      "  forward windows. A holdout win rate built on effN < 10 is not evidence.",
  );

  const best = results[0];
  console.log(
    `\nBest train dateWin: ${best.train.dateWin.toFixed(1)}% vs null ceiling ${ceiling.toFixed(0)}% ` +
      `→ ${best.train.dateWin > ceiling ? "above" : "AT OR BELOW"} what chance alone produces.`,
  );

  // The decisive test. Every config above sits at horizon 120, where the
  // holdout carries ~2 independent observations — a win rate there is a
  // coin-flip dressed as a percentage. Restricting to horizons whose holdout
  // has real independent samples is the only way to answer whether a durable
  // edge exists, so selection is still done on TRAIN and the holdout is opened
  // once for the winner.
  const MIN_EFF_N = 20;
  const adequate = results.filter((r) => {
    const all = byHorizon.get(r.st.horizon)!;
    const split = Math.floor(all.length * TRAIN_FRAC);
    return effectiveN(all.length - split, STEP, r.st.horizon) >= MIN_EFF_N;
  });

  console.log(`\n${"=".repeat(78)}`);
  console.log(`DECISIVE TEST — horizons whose holdout has >= ${MIN_EFF_N} independent observations`);
  console.log(`${adequate.length} of ${nConfigs} configurations qualify.\n`);
  console.log(
    `  ${"strategy".padEnd(18)} ${"topN".padStart(4)} ${"h".padStart(3)} ${"filter".padEnd(9)} ` +
      `${"train".padStart(7)} ${"HOLDOUT".padStart(8)} ${"pickAbs".padStart(8)} ${"exc/pick".padStart(9)} ${"effN".padStart(5)}`,
  );
  for (const r of adequate.slice(0, 10)) {
    const all = byHorizon.get(r.st.horizon)!;
    const split = Math.floor(all.length * TRAIN_FRAC);
    const test = evaluate(all.slice(split), r.st);
    const eff = effectiveN(test.dates, STEP, r.st.horizon);
    console.log(
      `  ${r.st.label.padEnd(18)} ${String(r.st.topN).padStart(4)} ${String(r.st.horizon).padStart(3)} ` +
        `${r.st.filter.padEnd(9)} ${r.train.dateWin.toFixed(1).padStart(6)}% ${test.dateWin.toFixed(1).padStart(7)}% ` +
        `${test.pickAbs.toFixed(1).padStart(7)}% ${test.meanExcess.toFixed(2).padStart(8)}% ${String(eff).padStart(5)}`,
    );
  }

  // ------------------------------------------------------------------
  // Second objective: ABSOLUTE win rate — "did this basket make money".
  //
  // The search above optimized dateWin (basket beats universe), which is pure
  // selection skill and where nothing survived. But a strategy is normally
  // judged on whether it makes money, and that is a different question with a
  // different answer: market drift is a real source of wins even though it is
  // not selection skill.
  //
  // Selection is still on TRAIN, the holdout is still sealed, and every result
  // is printed next to the buy-everything baseline for the same horizon so the
  // portion attributable to beta is never hidden.
  // ------------------------------------------------------------------
  // Baseline is keyed on (horizon, FILTER) — not horizon alone.
  //
  // Comparing a liquid-US basket against a whole-universe baseline compares two
  // different populations: US large caps have a different base rate from the
  // global small-cap tail, so the "edge" would measure the filter rather than
  // the selection. The buy-everything benchmark must be buy-everything WITHIN
  // THE SAME POOL the strategy picks from.
  const baseline = new Map<string, { pickAbs: number; dateAbs: number }>();
  for (const h of HORIZONS) {
    const all = byHorizon.get(h)!;
    const split = Math.floor(all.length * TRAIN_FRAC);
    const test = all.slice(split);
    for (const filter of FILTERS) {
      const pools = test.map((s) => applyFilter(s, filter)).filter((p) => p.length >= 30);
      const rows = pools.flat();
      if (!rows.length) continue;
      const dateUp = pools.filter(
        (p) => p.reduce((a, b) => a + b.fwd, 0) / p.length > 0,
      ).length;
      baseline.set(`${h}|${filter}`, {
        pickAbs: (100 * rows.filter((r) => r.fwd > 0).length) / rows.length,
        dateAbs: (100 * dateUp) / pools.length,
      });
    }
  }

  const byAbs = [...results].sort((a, b) => b.train.pickAbs - a.train.pickAbs);

  console.log(`\n${"=".repeat(90)}`);
  console.log("OBJECTIVE 2 — ABSOLUTE win rate (did the basket make money)");
  console.log("Selected on TRAIN, verified on the sealed HOLDOUT, shown against buy-everything.\n");
  console.log(
    `  ${"strategy".padEnd(18)} ${"topN".padStart(4)} ${"h".padStart(4)} ${"filter".padEnd(9)} ` +
      `${"trPick".padStart(7)} ${"hoPick".padStart(7)} ${"base".padStart(7)} ${"edge".padStart(6)} ` +
      `${"hoDate".padStart(7)} ${"picks".padStart(6)}`,
  );
  for (const r of byAbs.slice(0, 12)) {
    const all = byHorizon.get(r.st.horizon)!;
    const split = Math.floor(all.length * TRAIN_FRAC);
    const test = evaluate(all.slice(split), r.st);
    const base = baseline.get(`${r.st.horizon}|${r.st.filter}`);
    if (!base) continue;
    const edge = test.pickAbs - base.pickAbs;
    console.log(
      `  ${r.st.label.padEnd(18)} ${String(r.st.topN).padStart(4)} ${String(r.st.horizon).padStart(4)} ` +
        `${r.st.filter.padEnd(9)} ${r.train.pickAbs.toFixed(1).padStart(6)}% ${test.pickAbs.toFixed(1).padStart(6)}% ` +
        `${base.pickAbs.toFixed(1).padStart(6)}% ${(edge >= 0 ? "+" : "") + edge.toFixed(1).padStart(5)} ` +
        `${test.dateAbs.toFixed(1).padStart(6)}% ${String(test.picks).padStart(6)}`,
    );
  }

  const absChamp = byAbs[0];
  {
    const all = byHorizon.get(absChamp.st.horizon)!;
    const split = Math.floor(all.length * TRAIN_FRAC);
    const test = evaluate(all.slice(split), absChamp.st);
    const base = baseline.get(`${absChamp.st.horizon}|${absChamp.st.filter}`)!;
    console.log(
      `\n  Champion (selected on train): ${absChamp.st.label} topN=${absChamp.st.topN} ` +
        `h=${absChamp.st.horizon} filter=${absChamp.st.filter}`,
    );
    console.log(`  HOLDOUT absolute pick win rate : ${test.pickAbs.toFixed(1)}%   (target ${TARGET}%) → ${test.pickAbs >= TARGET ? "MET" : "not met"}`);
    console.log(`  HOLDOUT date-level win rate    : ${test.dateAbs.toFixed(1)}%`);
    console.log(`  Buy-everything same horizon    : ${base.pickAbs.toFixed(1)}% picks / ${base.dateAbs.toFixed(1)}% dates`);
    console.log(`  Selection edge over beta       : ${(test.pickAbs - base.pickAbs >= 0 ? "+" : "") + (test.pickAbs - base.pickAbs).toFixed(1)}pp`);
    console.log(`  Mean return per pick           : ${test.meanAbs.toFixed(2)}% over ${absChamp.st.horizon} trading days`);
  }

  if (adequate.length) {
    const champ = adequate[0];
    const all = byHorizon.get(champ.st.horizon)!;
    const split = Math.floor(all.length * TRAIN_FRAC);
    const test = evaluate(all.slice(split), champ.st);
    const eff = effectiveN(test.dates, STEP, champ.st.horizon);
    // Binomial standard error on the holdout win rate, using INDEPENDENT
    // observations rather than the inflated overlapping date count.
    const se = 100 * Math.sqrt((0.5 * 0.5) / Math.max(1, eff));
    console.log(
      `\n  Champion (chosen on train): ${champ.st.label} topN=${champ.st.topN} ` +
        `h=${champ.st.horizon} filter=${champ.st.filter}`,
    );
    console.log(
      `  Holdout dateWin ${test.dateWin.toFixed(1)}% ± ${(1.96 * se).toFixed(1)}pp (95% CI, effN=${eff})`,
    );
    console.log(
      `  Reaching ${TARGET}% with confidence needs the CI lower bound above ${TARGET}%: ` +
        `${test.dateWin - 1.96 * se > TARGET ? "MET" : "NOT MET"}`,
    );
  }
}

try {
  main();
  process.exit(0);
} catch (err) {
  console.error("Strategy search failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
