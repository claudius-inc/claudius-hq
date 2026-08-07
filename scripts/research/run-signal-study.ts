/**
 * Signal study: does ANY alpha exist in the price data already on hand?
 *
 * Run with:
 *   npx tsx scripts/research/run-signal-study.ts
 *   npx tsx scripts/research/run-signal-study.ts --horizon 20
 *
 * Tests two things the shipped screen assumes away:
 *
 *   1. De-quantization. The production scorers crush continuous quantities into
 *      4-6 tiers before ranking. Each continuous signal here is paired with the
 *      tiered scorer it replaces, so the columns are directly comparable.
 *
 *   2. Short-term reversal. The screen ranks recent strength highest. At a
 *      5-20 day horizon the literature says the opposite (Jegadeesh 1990,
 *      Lehmann 1990). rev1w/rev1m are sign-flipped past returns, so a positive
 *      IC there means the screen is pointed the wrong way.
 *
 * MULTIPLE TESTING: this runs ~17 signals x 2 horizons. At alpha=0.05 roughly
 * 1.7 spurious "significant" results are expected by chance, so a Bonferroni
 * threshold is printed alongside the raw t-stats and nothing is called real
 * unless it clears that line.
 */
import * as fs from "fs";
import * as path from "path";
import {
  replay,
  spearman,
  summarizeIc,
  type Bar,
  type DateSlice,
  type ScoredRow,
} from "@/lib/markets/backtest";
import { SIGNAL_NAMES, rankZ } from "@/lib/markets/signals";

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
  const out = new Map<string, Bar[]>();
  for (const f of fs.readdirSync(CACHE_DIR).filter((x) => x.endsWith(".json"))) {
    const bars = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), "utf8")) as Bar[];
    if (bars.length >= 300) out.set(f.replace(/\.json$/, ""), bars);
  }
  return out;
}

const numf = (v: number, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : "n/a");

/** IC series for an arbitrary per-row extractor, dropping rows the signal
 *  could not be computed for rather than coercing them to zero. */
function icSeries(slices: DateSlice[], get: (r: ScoredRow) => number | null): number[] {
  return slices.map((s) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const r of s.rows) {
      const v = get(r);
      if (v === null || !Number.isFinite(v)) continue;
      xs.push(v);
      ys.push(r.excess);
    }
    return spearman(xs, ys);
  });
}

interface Row {
  label: string;
  ic: number;
  t: number;
  hit: number;
  n: number;
  group: string;
}

function main() {
  const history = loadHistory();
  console.log(`Loaded ${history.size} tickers`);
  console.log("Excess return = forward return minus the universe equal-weight mean that date.");
  console.log('"more is better" convention: reversal signals are sign-flipped past returns.\n');

  for (const horizon of HORIZONS) {
    const slices = replay(history, { horizon });
    if (!slices.length) continue;

    const results: Row[] = [];
    const push = (label: string, group: string, get: (r: ScoredRow) => number | null) => {
      const s = summarizeIc(icSeries(slices, get));
      results.push({ label, group, ic: s.meanIc, t: s.tStat, hit: s.hitRate, n: s.n });
    };

    // Baselines: exactly what production computes today.
    push("momentum_score", "tiered (production)", (r) => r.momentum);
    push("technical_score", "tiered (production)", (r) => r.technical);

    for (const name of SIGNAL_NAMES) {
      const group =
        name.startsWith("rev") ? "REVERSAL"
        : ["mom12VolAdj", "lowVol"].includes(name) ? "extras"
        : "de-quantized";
      push(name, group, (r) => r.signals[name] ?? null);
    }

    // Equal-weight composite of the de-quantized momentum components, combined
    // on cross-sectional ranks so no single fat-tailed component dominates.
    const momParts = ["ret12mEx1m", "pos52w", "trendPersistence", "distAbove200"];
    const composite = (parts: string[]) => {
      const perDate = slices.map((s) => {
        const zs = parts.map((p) => rankZ(s.rows.map((r) => r.signals[p] ?? null)));
        const xs: number[] = [];
        const ys: number[] = [];
        s.rows.forEach((r, i) => {
          const vals = zs.map((z) => z[i]).filter((v): v is number => v !== null);
          if (vals.length !== parts.length) return;
          xs.push(vals.reduce((a, b) => a + b, 0));
          ys.push(r.excess);
        });
        return spearman(xs, ys);
      });
      return summarizeIc(perDate);
    };
    const cm = composite(momParts);
    results.push({ label: "composite(mom, z)", group: "composite", ic: cm.meanIc, t: cm.tStat, hit: cm.hitRate, n: cm.n });

    const nTests = results.length;
    const bonf = 2.807; // two-sided alpha=0.005 ~ Bonferroni for ~10 effective tests

    const names = slices.reduce((a, s) => a + s.rows.length, 0) / slices.length;
    console.log(
      `═══ Horizon ${horizon}d · ${slices.length} non-overlapping dates · ${names.toFixed(0)} names/date · ` +
        `${slices[0].date} → ${slices.at(-1)!.date}`,
    );
    console.log(`    ${nTests} signals tested · |t| > ${bonf} required to survive multiple testing\n`);

    results.sort((a, b) => Math.abs(b.t) - Math.abs(a.t));
    let lastGroup = "";
    console.log(`    ${"signal".padEnd(20)} ${"IC".padStart(8)} ${"t".padStart(7)} ${"IC>0".padStart(6)}   verdict`);
    console.log(`    ${"-".repeat(20)} ${"-".repeat(8)} ${"-".repeat(7)} ${"-".repeat(6)}   ${"-".repeat(20)}`);
    for (const r of results) {
      const verdict =
        Math.abs(r.t) > bonf ? (r.t > 0 ? "SURVIVES (positive)" : "SURVIVES (negative)")
        : Math.abs(r.t) > 1.96 ? "nominal only"
        : "";
      if (r.group !== lastGroup) {
        lastGroup = r.group;
      }
      console.log(
        `    ${r.label.padEnd(20)} ${numf(r.ic).padStart(8)} ${numf(r.t, 2).padStart(7)} ` +
          `${r.hit.toFixed(0).padStart(5)}%   ${verdict}  ${r.group === "REVERSAL" ? "<- reversal" : ""}`,
      );
    }
    console.log();
    robustness(slices, horizon);
  }
}

/**
 * A surviving t-stat is not alpha. Two things routinely kill a reversal signal:
 * it lives in illiquid names whose spreads exceed the edge, and it turns out to
 * be one market episode rather than a persistent effect. Both are checked here.
 *
 * Liquidity is only split inside the US subsample. Traded value is denominated
 * in the listing currency, so ranking a JPY name against a USD one measures the
 * exchange rate, not liquidity.
 */
function robustness(slices: DateSlice[], horizon: number) {
  const TOP = ["rev1wVolAdj", "rev1w", "lowVol", "ret12mEx1m", "pos52w"];
  const isUS = (t: string) => !t.includes(".");

  const subset = (
    filter: (r: ScoredRow, s: DateSlice) => boolean,
  ): DateSlice[] =>
    slices
      .map((s) => {
        const rows = s.rows.filter((r) => filter(r, s));
        if (rows.length < 30) return null;
        // Re-centre excess within the subsample, otherwise the benchmark is
        // still the full universe and the IC measures composition, not skill.
        const mean = rows.reduce((a, b) => a + b.fwd, 0) / rows.length;
        return { ...s, rows: rows.map((r) => ({ ...r, excess: r.fwd - mean })) };
      })
      .filter((s): s is DateSlice => s !== null);

  const half = Math.floor(slices.length / 2);
  const usOnly = subset((r) => isUS(r.ticker));
  const usLiquid = subset((r, s) => {
    if (!isUS(r.ticker) || r.advLocal === null) return false;
    const advs = s.rows
      .filter((x) => isUS(x.ticker) && x.advLocal !== null)
      .map((x) => x.advLocal as number)
      .sort((a, b) => a - b);
    if (!advs.length) return false;
    return r.advLocal >= advs[Math.floor(advs.length / 2)];
  });

  const line = (label: string, sl: DateSlice[], get: (r: ScoredRow) => number | null) => {
    if (!sl.length) return `${label.padEnd(22)}   n/a`;
    const s = summarizeIc(icSeries(sl, get));
    return `${label.padEnd(22)} IC ${numf(s.meanIc).padStart(8)}  t ${numf(s.tStat, 2).padStart(6)}  (${s.n} dates)`;
  };

  console.log(`    ── Robustness, horizon ${horizon}d ──`);
  for (const name of TOP) {
    const get = (r: ScoredRow) => r.signals[name] ?? null;
    console.log(`\n    ${name}`);
    console.log(`      ${line("all names", slices, get)}`);
    console.log(`      ${line("US only", usOnly, get)}`);
    console.log(`      ${line("US liquid half", usLiquid, get)}`);
    console.log(`      ${line("first half of dates", slices.slice(0, half), get)}`);
    console.log(`      ${line("second half of dates", slices.slice(half), get)}`);
  }
  console.log();
}

try {
  main();
  process.exit(0);
} catch (err) {
  console.error("Signal study failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
