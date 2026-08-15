/**
 * Does anything in the registry work on the TRADFI book?
 *
 * Run with:
 *   npx tsx scripts/research/run-perp-tradfi-study.ts
 *   npx tsx scripts/research/run-perp-tradfi-study.ts --horizon 6,18
 *   npx tsx scripts/research/run-perp-tradfi-study.ts --rebuild
 *
 * WHY THIS IS A SEPARATE SCRIPT AND NOT A FLAG
 * --------------------------------------------
 * `run-perp-signal-study.ts` answers a crypto question. It cannot answer this
 * one, and not because of a missing filter: its panel warmup is the MAX `minBars`
 * over every registered signal, which `volPctl252` sets at 552 bars. No equity
 * or premarket perp has 552 bars of 4h history — they are new listings — so the
 * default panel is 99.6% crypto BY CONSTRUCTION and prints `ABSENT` for three
 * of five categories. Open question 3 in `docs/perp-signal-research.md`.
 *
 * Getting a tradfi answer needs two changes at once, which is what makes it a
 * different study rather than a different flag:
 *
 *   1. A SHALLOW REGISTRY. Only signals whose `minBars` fits inside the tradfi
 *      book's history. That drops the warmup from 552 to `MAX_MIN_BARS`.
 *   2. A CATEGORY FILTER, so the per-timestamp Spearman ranks equity against
 *      equity instead of against 360 coins.
 *
 * WHAT IS LOST, AND IT IS NOT SMALL
 * ---------------------------------
 * The shallow registry excludes every signal built on MCD's 300-bar warmup:
 * `mcdNet`, `shippedScore`, `maStack`, `distSmma200`, `volPctl252`, `pos252`.
 * `shippedScore` is the incumbent, so THIS STUDY CANNOT COMPARE ANYTHING TO THE
 * LIVE RULE. It can only say whether a shallow signal orders the tradfi
 * cross-section. Excluded names are printed so this is never inferred silently.
 */
import "dotenv/config";
import {
  loadOrBuildPanel,
  printPanelStats,
  coveredSignals,
  TRADFI_CONFIG,
  type PanelConfig,
} from "@/lib/markets/perp-panel";
import { buildRankCache, commonMask, evaluateCombo } from "@/lib/markets/perp-evaluate";
import { PERP_SIGNALS, SIGNAL_BY_NAME, type PerSymbolSpec } from "@/lib/markets/perp-signals";

const argOf = (flag: string, fallback: string): string => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const HORIZONS = argOf("--horizon", "6,18").split(",").map(Number);
const REBUILD = process.argv.includes("--rebuild");
const COVERAGE_FLOOR = Number(argOf("--coverage", "0.5"));

/**
 * Warmup ceiling for a signal to be admitted.
 *
 * 178 is not a round number chosen for taste: it is the EMA ribbon's own
 * warmup, twice its slowest rung, and the ribbon is the signal this study was
 * built to test. Raising it past 300 readmits the MCD family and empties the
 * panel again; lowering it buys history that the equity book does not need.
 */
const MAX_MIN_BARS = 178;

const shallow = PERP_SIGNALS.filter(
  (s) => s.kind === "crossSectional" || (s as PerSymbolSpec).minBars <= MAX_MIN_BARS,
);
const deep = PERP_SIGNALS.filter((s) => !shallow.includes(s)).map((s) => s.name);

const f = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : "—");

function run(horizon: number): void {
  const cfg: PanelConfig = { ...TRADFI_CONFIG, horizon };
  const panel = loadOrBuildPanel(cfg, shallow, { rebuild: REBUILD });
  printPanelStats(panel);

  if (panel.nRows === 0) {
    console.log("\nNo rows. The tradfi book has no history at this horizon.");
    return;
  }

  const covered = coveredSignals(panel, COVERAGE_FLOOR);
  const cache = buildRankCache(panel);

  const volFamily = ["atrPct", "volPctl120", "bbWidthPctl120", "rangeExpansion"].filter((n) =>
    covered.includes(n),
  );
  let volBenchmark = 1;
  for (const n of volFamily) {
    const r = evaluateCombo(panel, cache, [n], commonMask(panel, [n]));
    if (Number.isFinite(r.captureLift)) volBenchmark = Math.max(volBenchmark, r.captureLift);
  }

  const rows = covered.map((name) => {
    const spec = SIGNAL_BY_NAME.get(name)!;
    const r = evaluateCombo(panel, cache, [name], commonMask(panel, [name]));
    return { name, spec, r };
  });
  rows.sort((a, b) => Math.abs(b.r.ic.tStat || 0) - Math.abs(a.r.ic.tStat || 0));

  console.log(
    `\n${"=".repeat(96)}\nTRADFI ONLY · HORIZON ${horizon} bars (${((horizon * 4) / 24).toFixed(1)} days)` +
      `  ·  entry lag ${cfg.entryLag}  ·  minPerCategory ${cfg.minPerCategory}\n${"=".repeat(96)}`,
  );
  console.log(
    `Capture null for magnitude signals = ${f(volBenchmark, 2)}x (best of ${volFamily.join(", ") || "none"}).`,
  );
  console.log(
    `\n  ${"signal".padEnd(18)} ${"group".padEnd(11)} ${"cov".padStart(5)} ${"IC".padStart(7)} ` +
      `${"t".padStart(6)} ${"lift".padStart(6)} ${"basket%".padStart(8)} ${"abs%".padStart(7)} ${"base%".padStart(7)}`,
  );
  console.log(`  ${"-".repeat(88)}`);

  for (const { name, spec, r } of rows) {
    const isMag = spec.polarity === "magnitude";
    const s = panel.signalNames.indexOf(name);
    console.log(
      `  ${name.padEnd(18)} ${spec.group.padEnd(11)} ${(100 * panel.coverage[s]).toFixed(0).padStart(4)}% ` +
        `${(isMag ? "—" : f(r.ic.meanIc)).padStart(7)} ${(isMag ? "—" : f(r.ic.tStat, 2)).padStart(6)} ` +
        `${f(r.captureLift, 2).padStart(6)} ${(isMag ? "—" : f(r.basketExcess, 3)).padStart(8)} ` +
        `${(isMag ? "—" : f(r.basketAbs, 3)).padStart(7)} ${(isMag ? "—" : f(r.baselineAbs, 3)).padStart(7)}`,
    );
  }

  // The t-threshold moves with the test count, and this panel is small enough
  // that the timestamp count — not the row count — is what limits it.
  console.log(
    `\n  ${covered.length} signals tested. The panel has ${panel.stats.timestampsUsable} usable ` +
      `timestamps, so treat any |t| below ~3 as noise.`,
  );
  console.log(`  EXCLUDED as too deep for the tradfi book (minBars > ${MAX_MIN_BARS}): ${deep.join(", ")}`);
}

for (const h of HORIZONS) run(h);
